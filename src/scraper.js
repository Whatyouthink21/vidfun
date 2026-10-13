/**
 * Stream scraper — extracts REAL .m3u8/.mp4 + subtitles from embed pages.
 *
 * VidSrc-family chain (reverse-engineered from the live sites and from open
 * extractors such as CloudStream's VidSrcTo/Vidplay and Nuvio's vidsrc extractor):
 *
 *   GET  vidsrc.xyz/embed/movie/{id}
 *        -> <div class="server" data-hash="...">…</div>   (one per server)
 *        -> <iframe id="player_iframe" src="//{host}/rcp/{hash}">
 *   GET  {host}/rcp/{hash}            (host discovered from the iframe, e.g. cloudnestra.com)
 *        -> <iframe src="{host}/prorcp/{hash}">  (or srcrcp)
 *   GET  {host}/prorcp/{hash}
 *        -> packed JS / jwplayer setup -> file: "https://…/master.m3u8" + subtitle tracks
 *
 * Everything else (VidLink/Videasy/…) is a client-side JS app: a server fetch
 * returns a shell with no stream in it. Those are reported as iframe-only —
 * never faked, never substituted with a demo clip.
 */
const cheerio = require('cheerio');
const { extractMediaFromText, tryDecodeBase64Url } = require('./unpacker');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function fetchText(url, { referer, timeoutMs = 6000 } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(referer ? { Referer: referer } : {})
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  });
  return { status: res.status, finalUrl: res.url, text: await res.text() };
}

function absolute(url, base) {
  if (!url) return null;
  const t = String(url).trim();
  if (t.startsWith('//')) return `https:${t}`;
  try { return new URL(t, base).toString(); } catch (_) { return null; }
}

/** Parse one HTML page: servers, iframes, rcp/prorcp hops, streams, subtitles. */
function parseHtmlForStreams(html, baseUrl = 'https://vidsrc.xyz/') {
  const $ = cheerio.load(html || '');
  const iframes = [];
  $('iframe').each((_, el) => {
    const src = absolute($(el).attr('src') || $(el).attr('data-src'), baseUrl);
    if (src) iframes.push(src);
  });

  const servers = [];
  $('[data-hash]').each((_, el) => {
    const hash = ($(el).attr('data-hash') || '').trim();
    if (!hash) return;
    servers.push({
      name: $(el).text().trim() || 'Server',
      hash,
      decodedUrl: tryDecodeBase64Url(hash)
    });
  });

  // rcp -> prorcp/srcrcp hops appear as iframe srcs or inline strings.
  const hops = new Set();
  const hopRe = /(?:https?:)?\/\/[^\s"'<>]+?\/(?:prorcp|srcrcp|rcp)\/[^\s"'<>\\]+|\/(?:prorcp|srcrcp|rcp)\/[^\s"'<>\\]+/gi;
  for (const m of String(html).matchAll(hopRe)) {
    const u = absolute(m[0], baseUrl);
    if (u) hops.add(u);
  }
  iframes.forEach((u) => { if (/\/(rcp|prorcp|srcrcp)\//.test(u)) hops.add(u); });

  const extracted = extractMediaFromText(html || '', baseUrl);
  return {
    title: $('meta[property="og:title"]').attr('content') || $('title').first().text().trim() || null,
    servers,
    iframes,
    hops: [...hops],
    streams: extracted.streams,
    subtitles: extracted.subtitles,
    unpackedScripts: extracted.unpackedScripts.length
  };
}

/**
 * Follow the VidSrc RCP chain from an embed URL.
 * Bounded: <= maxFetches page loads. Stops as soon as a stream is found.
 */
async function scrapeVidsrcChain(embedUrl, { timeoutMs = 6000, maxFetches = 8 } = {}) {
  const trace = [];
  const streams = new Map();
  const subtitles = new Map();
  let fetches = 0;

  const originOf = (u) => { try { return new URL(u).origin; } catch (_) { return null; } };
  const collect = (parsed, fromUrl) => {
    for (const s of parsed.streams) if (!streams.has(s.url)) streams.set(s.url, { ...s, referer: fromUrl });
    for (const s of parsed.subtitles) if (!subtitles.has(s.url)) subtitles.set(s.url, s);
  };

  // 1) Embed page
  let embed;
  try {
    embed = await fetchText(embedUrl, { referer: `${originOf(embedUrl)}/`, timeoutMs });
    fetches++;
  } catch (err) {
    return { streams: [], subtitles: [], trace, error: `embed fetch failed: ${err.message}` };
  }
  trace.push({ step: 'embed', url: embedUrl, status: embed.status });
  if (embed.status >= 400) {
    return { streams: [], subtitles: [], trace, error: `embed returned HTTP ${embed.status}` };
  }
  const parsed = parseHtmlForStreams(embed.text, embed.finalUrl);
  collect(parsed, embed.finalUrl);
  trace.push({ step: 'parse-embed', servers: parsed.servers.length, iframes: parsed.iframes.length, streams: parsed.streams.length });
  if (streams.size) return { streams: [...streams.values()], subtitles: [...subtitles.values()], trace };

  // 2) Build rcp candidates: from #player_iframe host + each server hash.
  const iframeHost = parsed.iframes.map(originOf).find(Boolean);
  const candidates = [];
  const seen = new Set();
  const push = (u) => { if (u && !seen.has(u)) { seen.add(u); candidates.push(u); } };
  parsed.iframes.forEach(push);
  for (const srv of parsed.servers.slice(0, 5)) {
    if (srv.decodedUrl && /^https?:/i.test(srv.decodedUrl)) push(srv.decodedUrl);
    else if (iframeHost) push(`${iframeHost}/rcp/${srv.hash}`);
  }
  parsed.hops.forEach(push);

  // 3) rcp -> prorcp/srcrcp -> stream
  for (const rcpUrl of candidates.slice(0, 5)) {
    if (fetches >= maxFetches || streams.size) break;
    let referer = embed.finalUrl;
    let url = rcpUrl;
    for (let depth = 0; depth < 3 && url && fetches < maxFetches; depth++) {
      let page;
      try {
        page = await fetchText(url, { referer, timeoutMs });
        fetches++;
      } catch (err) {
        trace.push({ step: 'hop-failed', url, error: err.message });
        break;
      }
      trace.push({ step: depth === 0 ? 'rcp' : 'prorcp', url, status: page.status });
      const p = parseHtmlForStreams(page.text, page.finalUrl);
      collect(p, page.finalUrl);
      if (streams.size) break;
      referer = page.finalUrl;
      url = p.hops.find((h) => h !== page.finalUrl) || p.iframes.find((f) => !/google|doubleclick|ads/i.test(f)) || null;
    }
  }

  return {
    streams: [...streams.values()],
    subtitles: [...subtitles.values()],
    trace,
    error: streams.size ? null : 'Chain completed but no .m3u8/.mp4 was exposed (provider may be JS-gated, geo-blocked, or the title is unavailable).'
  };
}

/** One-shot scrape of any embed/player URL (used by /api/scrape and 'generic' providers). */
async function scrapeUrl(targetUrl, { rawHtml, referer, timeoutMs = 6000 } = {}) {
  if (rawHtml) {
    const parsed = parseHtmlForStreams(rawHtml, targetUrl || 'https://localhost/');
    return { ok: true, mode: 'raw-html', targetUrl: targetUrl || null, ...parsed };
  }
  if (!/^https?:\/\//i.test(targetUrl || '')) throw new Error('A valid http(s) url is required.');
  if (/\/(rcp|embed)\//.test(targetUrl) || /vidsrc/i.test(targetUrl)) {
    const chain = await scrapeVidsrcChain(targetUrl, { timeoutMs });
    return { ok: chain.streams.length > 0, mode: 'vidsrc-chain', targetUrl, ...chain };
  }
  const page = await fetchText(targetUrl, { referer, timeoutMs });
  const parsed = parseHtmlForStreams(page.text, page.finalUrl);
  // Follow one iframe hop — many players put the real page one level down.
  if (!parsed.streams.length && parsed.iframes[0]) {
    try {
      const sub = await fetchText(parsed.iframes[0], { referer: page.finalUrl, timeoutMs });
      const sp = parseHtmlForStreams(sub.text, sub.finalUrl);
      parsed.streams.push(...sp.streams);
      parsed.subtitles.push(...sp.subtitles);
      parsed.iframes.push(...sp.iframes);
      parsed.hops.push(...sp.hops);
    } catch (_) { /* leave as-is */ }
  }
  return { ok: parsed.streams.length > 0, mode: 'live-fetch', status: page.status, targetUrl, ...parsed };
}

/** Verify an HLS/MP4 URL server-side so the player only lists streams that answer. */
async function verifyStream(stream, { timeoutMs = 5000 } = {}) {
  try {
    const isHls = stream.type === 'hls' || /\.m3u8($|\?)/i.test(stream.url);
    if (isHls) {
      const res = await fetch(stream.url, {
        headers: { 'User-Agent': UA, ...(stream.referer ? { Referer: stream.referer } : {}) },
        signal: AbortSignal.timeout(timeoutMs)
      });
      const text = await res.text();
      return res.ok && text.includes('#EXTM3U')
        ? { verified: true, detail: `HTTP ${res.status}, valid HLS manifest` }
        : { verified: false, detail: `HTTP ${res.status}, not an HLS manifest` };
    }
    const res = await fetch(stream.url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Range: 'bytes=0-1023', ...(stream.referer ? { Referer: stream.referer } : {}) },
      signal: AbortSignal.timeout(timeoutMs)
    });
    return { verified: res.ok || res.status === 206, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { verified: false, detail: err.message };
  }
}

module.exports = { fetchText, parseHtmlForStreams, scrapeVidsrcChain, scrapeUrl, verifyStream, UA };
