/**
 * VidFun Scraper & Source Resolution Engine
 * - Parses VidSrc (.xyz / .icu / .to / .me) embed pages, server hashes (`data-hash`), and RCP iframes
 * - Unpacks obfuscated P.A.C.K.E.R. scripts (`eval(function(p,a,c,k,e,d)...)`)
 * - Extracts direct HLS (.m3u8), MP4 (.mp4), WebM, and Subtitle (.vtt/.srt) URLs
 * - Aggregates VidFun Direct streams + Upstream Embed Providers for any Movie or TV Episode
 */
const cheerio = require('cheerio');
const { extractMediaFromText, tryDecodeBase64Url } = require('./unpacker');
const { buildProviderTargets } = require('./providers');
const { findOrSynthesizeItem } = require('../data/catalog');
const { getCustomMedia } = require('../data/customStore');

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

/**
 * Sample realistic VidSrc + Packed Player HTML payload for testing the scraper offline/in-sandbox
 */
function getSampleVidsrcHtml({ type = 'movie', id = '693134', season = 1, episode = 1 } = {}) {
  const label = type === 'tv' ? `TV ${id} S${season}E${episode}` : `Movie ${id}`;
  // Packed script containing file:"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
  const packedDemo =
    "eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('0.1({2:[{3:\"4://5-6.7.8/9/9.a\",b:\"c\"}],d:[{3:\"4://e.f.g/h/i/j.k\",l:\"m\"}]});',23,23,'jwplayer|setup|sources|file|https|test|streams|mux|dev|x36xhzz|m3u8|label|1080p|tracks|bitdash|akamaihd|net|content|sintel|subtitles|vtt|kind|captions'.split('|'),0,{}))";

  return `<!DOCTYPE html>
<html>
<head>
  <title>Watch ${label} - VidSrc Embed</title>
  <meta property="og:title" content="${label} - Stream HD" />
  <meta property="og:description" content="Multi-server embed page for ${label}" />
</head>
<body>
  <div class="servers">
    <div class="server active" data-hash="aHR0cHM6Ly92aWRzcmMueHl6L2VtYmVkL21vdmllLzY5MzEzNA==">CloudStream Pro</div>
    <div class="server" data-hash="aHR0cHM6Ly9iaXRkYXNoLWEuYWthbWFpaGQubmV0L2NvbnRlbnQvc2ludGVsL2hscy9wbGF5bGlzdC5tM3U4">VidPlay Direct HLS</div>
    <div class="server" data-hash="aHR0cHM6Ly9jb21tb25kYXRhc3RvcmFnZS5nb29nbGVhcGlzLmNvbS9ndHYtdmlkZW9zLWJ1Y2tldC9zYW1wbGUvVGVhcnNPZlN0ZWVsLm1wNA==">FileMoon 1080p MP4</div>
  </div>
  <iframe id="player_iframe" src="//cloudnestra.com/rcp/sample-${id}" allowfullscreen></iframe>
  <script type="text/javascript">
    ${packedDemo}
  </script>
</body>
</html>`;
}

/**
 * Parse an HTML document (from a live URL or raw HTML string) and extract VidSrc servers,
 * iframes, unpacked JS streams (.m3u8 / .mp4), and subtitle tracks.
 */
function parseHtmlForStreams(html, baseUrl = 'https://vidsrc.xyz') {
  const $ = cheerio.load(html || '');

  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text().trim() ||
    'Scraped Media Page';

  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';

  const poster =
    $('meta[property="og:image"]').attr('content') || '';

  // 1. Extract iframes (including #player_iframe used by VidSrc)
  const iframes = [];
  $('iframe').each((_, el) => {
    const rawSrc = $(el).attr('src') || $(el).attr('data-src');
    if (!rawSrc) return;
    let resolved = rawSrc.trim();
    if (resolved.startsWith('//')) resolved = `https:${resolved}`;
    else if (resolved.startsWith('/')) {
      try {
        resolved = new URL(resolved, baseUrl).toString();
      } catch (_) {}
    }
    iframes.push({
      id: $(el).attr('id') || undefined,
      src: resolved
    });
  });

  // 2. Extract VidSrc / MultiEmbed style server nodes (.server[data-hash], [data-id], [data-link])
  const servers = [];
  $('[data-hash], [data-link], .server').each((_, el) => {
    const name = $(el).text().trim() || $(el).attr('title') || 'Server';
    const hash = $(el).attr('data-hash') || $(el).attr('data-link') || $(el).attr('data-id') || '';
    if (!hash) return;
    const decodedUrl = tryDecodeBase64Url(hash);
    servers.push({
      name,
      hash,
      decodedUrl: decodedUrl || null,
      rcpUrl: !decodedUrl && hash ? `${baseUrl.replace(/\/$/, '')}/rcp/${hash}` : decodedUrl
    });
  });

  // 3. Extract direct <video> and <source> tags
  const directTags = [];
  $('video source, video').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      directTags.push({
        url: src.startsWith('//') ? `https:${src}` : src,
        type: $(el).attr('type') || (src.includes('.m3u8') ? 'hls' : 'mp4'),
        quality: $(el).attr('size') || $(el).attr('label') || 'HD'
      });
    }
  });

  // 4. Run regex + P.A.C.K.E.R. unpacker across the full HTML + decoded server hashes
  const decodedServerUrls = servers.map((s) => s.decodedUrl).filter(Boolean).join('\n');
  const extracted = extractMediaFromText(`${html}\n${decodedServerUrls}`, baseUrl);

  const allStreams = [...directTags, ...extracted.streams];
  const uniqueStreams = [];
  const seen = new Set();
  for (const s of allStreams) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url);
      uniqueStreams.push(s);
    }
  }

  return {
    title,
    description,
    poster,
    baseUrl,
    iframes,
    servers,
    streams: uniqueStreams,
    subtitles: extracted.subtitles,
    unpackedScriptCount: extracted.unpackedScripts.length,
    unpackedPreview: extracted.unpackedScripts.slice(0, 2)
  };
}

/**
 * Scrape a target URL (or raw HTML payload) for embed iframes, server hashes, and HLS/MP4 streams.
 */
async function scrapeUrl(targetUrl, { rawHtml, referer, timeoutMs = 4500 } = {}) {
  if (rawHtml && typeof rawHtml === 'string') {
    const parsed = parseHtmlForStreams(rawHtml, targetUrl || 'https://vidsrc.xyz');
    return {
      ok: true,
      mode: 'raw-html',
      targetUrl: targetUrl || 'inline://payload',
      ...parsed
    };
  }

  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    throw new Error('A valid http:// or https:// URL (or rawHtml payload) is required.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      ...DEFAULT_HEADERS,
      Referer: referer || new URL(targetUrl).origin + '/'
    };
    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timer);

    const html = await response.text();
    const parsed = parseHtmlForStreams(html, targetUrl);

    // If a VidSrc #player_iframe was found pointing to an RCP endpoint, try following 1 hop
    const primaryIframe = parsed.iframes[0];
    if (primaryIframe && primaryIframe.src && parsed.streams.length === 0) {
      try {
        const subCtrl = new AbortController();
        const subTimer = setTimeout(() => subCtrl.abort(), 3000);
        const subResp = await fetch(primaryIframe.src, {
          headers: { ...DEFAULT_HEADERS, Referer: targetUrl },
          signal: subCtrl.signal
        });
        clearTimeout(subTimer);
        const subHtml = await subResp.text();
        const subParsed = parseHtmlForStreams(subHtml, primaryIframe.src);
        parsed.streams.push(...subParsed.streams);
        parsed.subtitles.push(...subParsed.subtitles);
        parsed.iframes.push(...subParsed.iframes);
        parsed.unpackedScriptCount += subParsed.unpackedScriptCount;
      } catch (_) {
        // Ignore secondary hop timeout
      }
    }

    return {
      ok: true,
      mode: 'live-fetch',
      status: response.status,
      targetUrl,
      ...parsed
    };
  } catch (err) {
    clearTimeout(timer);
    // If outbound network is restricted (e.g., inside an isolated container),
    // return a structured fallback parse using a sample VidSrc payload so the user
    // can still inspect how the scraper & unpacker works, along with the error details.
    const fallbackHtml = getSampleVidsrcHtml({ id: '693134' });
    const parsed = parseHtmlForStreams(fallbackHtml, targetUrl);
    return {
      ok: true,
      mode: 'simulated-fallback',
      networkNote: `Direct server-side fetch to ${targetUrl} could not complete (${err.message}). Showing simulated VidSrc + Packer extraction result. When running locally on your machine, live HTTP scraping connects directly.`,
      targetUrl,
      ...parsed
    };
  }
}

/**
 * Resolve all playable sources (direct HLS/MP4 streams + subtitles + multi-server embeds)
 * for a Movie or TV Show Episode.
 */
async function resolveSourcesForMedia({
  type = 'movie',
  id,
  season = 1,
  episode = 1,
  attemptRemoteScrape = false
}) {
  const normalizedType = type === 'tv' || type === 'series' ? 'tv' : 'movie';
  const seasonNum = Math.max(1, parseInt(season, 10) || 1);
  const episodeNum = Math.max(1, parseInt(episode, 10) || 1);

  const customMedia = getCustomMedia();
  const item = findOrSynthesizeItem(normalizedType, id, customMedia);

  // Determine episode-specific streams if TV show
  let activeStreams = item.streams || {};
  let episodeInfo = null;

  if (normalizedType === 'tv' && Array.isArray(item.seasons)) {
    const foundSeason =
      item.seasons.find((s) => Number(s.seasonNumber) === seasonNum) || item.seasons[0];
    if (foundSeason && Array.isArray(foundSeason.episodes)) {
      const foundEp =
        foundSeason.episodes.find((e) => Number(e.episodeNumber) === episodeNum) ||
        foundSeason.episodes[0];
      if (foundEp) {
        episodeInfo = {
          seasonNumber: foundSeason.seasonNumber,
          episodeNumber: foundEp.episodeNumber,
          title: foundEp.title,
          duration: foundEp.duration,
          synopsis: foundEp.synopsis
        };
        if (foundEp.streams) {
          activeStreams = foundEp.streams;
        }
      }
    }
  }

  // Build Direct Playable Stream Qualities
  const directSources = [];
  if (activeStreams.hls) {
    directSources.push({
      id: 'hls-auto',
      label: 'Auto (HLS Adaptive)',
      quality: 'Auto / 1080p',
      type: 'hls',
      url: activeStreams.hls
    });
  }
  if (activeStreams.mp4_1080) {
    directSources.push({
      id: 'mp4-1080p',
      label: '1080p Full HD (MP4)',
      quality: '1080p',
      type: 'mp4',
      url: activeStreams.mp4_1080
    });
  }
  if (activeStreams.mp4_720) {
    directSources.push({
      id: 'mp4-720p',
      label: '720p HD (MP4)',
      quality: '720p',
      type: 'mp4',
      url: activeStreams.mp4_720
    });
  }
  if (activeStreams.mp4_480) {
    directSources.push({
      id: 'mp4-480p',
      label: '480p SD (MP4)',
      quality: '480p',
      type: 'mp4',
      url: activeStreams.mp4_480
    });
  }

  // Build Local WebVTT Subtitle tracks
  const subQuery =
    normalizedType === 'tv'
      ? `?title=${encodeURIComponent(item.title)}&s=${seasonNum}&e=${episodeNum}`
      : `?title=${encodeURIComponent(item.title)}`;

  const subtitles = [
    {
      lang: 'en',
      label: 'English',
      url: `/api/subtitles/${encodeURIComponent(item.tmdbId)}/en.vtt${subQuery}`,
      default: true
    },
    {
      lang: 'es',
      label: 'Español',
      url: `/api/subtitles/${encodeURIComponent(item.tmdbId)}/es.vtt${subQuery}`,
      default: false
    },
    {
      lang: 'fr',
      label: 'Français',
      url: `/api/subtitles/${encodeURIComponent(item.tmdbId)}/fr.vtt${subQuery}`,
      default: false
    }
  ];

  // Build Provider Embed Targets (VidFun Direct + VidSrc XYZ/ICU/CC/TO + SuperEmbed + AutoEmbed + 2Embed)
  const providers = buildProviderTargets({
    type: normalizedType,
    id: item.id,
    tmdbId: item.tmdbId,
    imdbId: item.imdbId,
    season: seasonNum,
    episode: episodeNum
  });

  // If custom item has a customEmbedUrl, prepend it to providers
  if (item.customEmbedUrl) {
    providers.splice(1, 0, {
      id: 'custom-embed',
      name: 'Custom Upstream Embed',
      shortName: 'Custom Embed',
      badge: 'CUSTOM',
      quality: 'HD',
      mode: 'iframe',
      description: 'User-configured custom embed source.',
      embedUrl: item.customEmbedUrl
    });
  }

  let scrapeReport = null;
  if (attemptRemoteScrape) {
    const vidsrcTarget = providers.find((p) => p.id === 'vidsrc-xyz');
    if (vidsrcTarget) {
      scrapeReport = await scrapeUrl(vidsrcTarget.embedUrl, { timeoutMs: 3000 });
    }
  }

  return {
    ok: true,
    media: {
      id: item.id,
      tmdbId: item.tmdbId,
      imdbId: item.imdbId,
      type: normalizedType,
      title: item.title,
      year: item.year,
      rating: item.rating,
      duration: item.duration,
      genres: item.genres,
      synopsis: item.synopsis,
      poster: item.poster,
      backdrop: item.backdrop,
      season: normalizedType === 'tv' ? seasonNum : undefined,
      episode: normalizedType === 'tv' ? episodeNum : undefined,
      episodeInfo,
      seasons: item.seasons
    },
    embedEndpoints: {
      vidfunEmbed:
        normalizedType === 'tv'
          ? `/embed/tv/${item.tmdbId}/${seasonNum}/${episodeNum}`
          : `/embed/movie/${item.tmdbId}`,
      vidfunV2Embed:
        normalizedType === 'tv'
          ? `/v2/embed/tv/${item.tmdbId}/${seasonNum}/${episodeNum}`
          : `/v2/embed/movie/${item.tmdbId}`,
      iframeSnippet: `<iframe src="${
        normalizedType === 'tv'
          ? `/embed/tv/${item.tmdbId}/${seasonNum}/${episodeNum}`
          : `/embed/movie/${item.tmdbId}`
      }" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>`
    },
    directSources,
    subtitles,
    providers,
    scrapeReport
  };
}

module.exports = {
  getSampleVidsrcHtml,
  parseHtmlForStreams,
  scrapeUrl,
  resolveSourcesForMedia
};
