/**
 * Source resolution: scrape what can be scraped, list the rest as iframes.
 *
 * Contract the player relies on:
 *  - `direct` only ever contains streams the scraper actually found upstream
 *    (and, when verify=1, that answered an HLS/MP4 probe). No placeholders.
 *  - `providers` always contains every usable iframe embed, so playback can
 *    fall back even when scraping yields nothing.
 */
const { getProviders, buildProviderTarget, withPlayerParams } = require('./providers');
const { resolveIds } = require('./tmdb');
const { scrapeVidsrcChain, scrapeUrl, verifyStream } = require('./scraper');

const CACHE = new Map();
const CACHE_TTL = Number(process.env.SOURCES_CACHE_TTL_MS) || 10 * 60 * 1000;

const keyOf = (a) => [a.type, a.tmdbId, a.imdbId, a.season, a.episode].join(':');

async function resolveSources({
  type = 'movie', id, season = 1, episode = 1,
  scrape = true, verify = true, autoplay = false, color = '', start = 0
} = {}) {
  const normType = type === 'tv' ? 'tv' : 'movie';
  const { tmdbId, imdbId, meta } = await resolveIds({ type: normType, id, season, episode });
  if (!tmdbId && !imdbId) {
    const err = new Error(`Unrecognised id "${id}". Use a TMDB numeric id (550) or an IMDb id (tt0137523).`);
    err.status = 400;
    throw err;
  }

  const cacheKey = keyOf({ type: normType, tmdbId, imdbId, season, episode }) + `:s${scrape ? 1 : 0}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.data, cached: true };

  const providers = getProviders().map((p) => {
    const target = buildProviderTarget(p, { type: normType, tmdbId, imdbId, season, episode });
    return {
      ...target,
      provider: p,
      embedUrl: target.embedUrl ? withPlayerParams(p, target.embedUrl, { autoplay, color, start }) : null
    };
  });

  const direct = [];
  const seen = new Set();
  const scrapeReport = [];

  if (scrape) {
    const scrapeable = providers.filter((p) => p.available && p.scrape);
    const results = await Promise.allSettled(
      scrapeable.map(async (p) => {
        const started = Date.now();
        try {
          const out = p.scrape === 'vidsrc'
            ? await scrapeVidsrcChain(p.embedUrl)
            : await scrapeUrl(p.embedUrl);
          return { provider: p, out, ms: Date.now() - started };
        } catch (err) {
          return { provider: p, out: { streams: [], subtitles: [], error: err.message }, ms: Date.now() - started };
        }
      })
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        scrapeReport.push({ provider: 'unknown', ok: false, error: r.reason.message });
        continue;
      }
      const { provider: p, out, ms } = r.value;
      scrapeReport.push({
        provider: p.id, ok: out.streams.length > 0, ms,
        streams: out.streams.length, error: out.error || null,
        trace: out.trace || undefined
      });
      for (const s of out.streams) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        direct.push({
          url: s.url,
          proxiedUrl: `/api/proxy/stream?url=${encodeURIComponent(s.url)}${s.referer ? `&referer=${encodeURIComponent(s.referer)}` : ''}`,
          type: s.type, quality: s.quality || 'Auto',
          provider: p.id, providerName: p.name, referer: s.referer || null,
          verified: null
        });
      }
      for (const sub of out.subtitles || []) {
        // subtitles are merged below, deduped by url
        (p._subs = p._subs || []).push(sub);
      }
    }
  }

  // Verify the streams we are about to hand to the player (bounded).
  if (verify && direct.length) {
    await Promise.allSettled(direct.slice(0, 6).map(async (s) => {
      const v = await verifyStream(s);
      s.verified = v.verified;
      s.verifyDetail = v.detail;
    }));
  }

  const subtitles = [];
  const subSeen = new Set();
  for (const p of providers) for (const s of p._subs || []) {
    if (!subSeen.has(s.url)) { subSeen.add(s.url); subtitles.push(s); }
  }

  const publicProviders = providers.map(({ provider, _subs, ...rest }) => ({
    ...rest,
    mode: direct.some((d) => d.provider === rest.id) ? 'scraped' : 'iframe'
  }));

  const data = {
    ok: true,
    type: normType,
    ids: { tmdb: tmdbId, imdb: imdbId },
    season: normType === 'tv' ? Number(season) : undefined,
    episode: normType === 'tv' ? Number(episode) : undefined,
    meta,
    direct,
    subtitles,
    providers: publicProviders,
    scrapeReport,
    embed: {
      movie: tmdbId || imdbId ? `/embed/movie/${tmdbId || imdbId}` : null,
      url: normType === 'tv'
        ? `/embed/tv/${tmdbId || imdbId}/${season}/${episode}`
        : `/embed/movie/${tmdbId || imdbId}`
    },
    cached: false
  };
  CACHE.set(cacheKey, { at: Date.now(), data });
  return data;
}

module.exports = { resolveSources };
