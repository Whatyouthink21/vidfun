/**
 * JSON API — no catalog, no browsing. Just sources, scraping and proxying.
 *
 *   GET /api/health
 *   GET /api/providers
 *   GET /api/sources/movie/:id                 ?scrape=0 to skip scraping
 *   GET /api/sources/tv/:id/:season/:episode
 *   GET /api/scrape?url=…        POST /api/scrape {url|rawHtml}
 *   GET /api/proxy/stream?url=…&referer=…
 */
const express = require('express');
const { Readable } = require('stream');
const router = express.Router();

const { getProviders } = require('../providers');
const { resolveSources } = require('../resolve');
const { scrapeUrl, UA } = require('../scraper');

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'vidfun-embed-api',
    version: '2.0.0',
    tmdbKeyConfigured: Boolean(process.env.TMDB_API_KEY),
    providers: getProviders().map((p) => p.id),
    endpoints: {
      embedMovie: '/embed/movie/:tmdbOrImdbId',
      embedTv: '/embed/tv/:tmdbOrImdbId/:season/:episode',
      sourcesMovie: '/api/sources/movie/:id',
      sourcesTv: '/api/sources/tv/:id/:season/:episode',
      scrape: '/api/scrape?url=',
      proxy: '/api/proxy/stream?url='
    }
  });
});

router.get('/providers', (req, res) => {
  res.json({
    ok: true,
    providers: getProviders().map(({ movie, tv, ...p }) => ({ ...p, movieTemplate: movie, tvTemplate: tv }))
  });
});

function sourcesHandler(getArgs) {
  return async (req, res) => {
    try {
      const data = await resolveSources({
        ...getArgs(req),
        scrape: req.query.scrape !== '0',
        verify: req.query.verify !== '0',
        autoplay: req.query.autoplay === '1' || req.query.autoplay === 'true',
        color: req.query.color || '',
        start: Number(req.query.t) || 0
      });
      res.json(data);
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  };
}

router.get('/sources/movie/:id', sourcesHandler((req) => ({ type: 'movie', id: req.params.id })));
router.get('/sources/tv/:id/:season/:episode', sourcesHandler((req) => ({
  type: 'tv', id: req.params.id, season: req.params.season, episode: req.params.episode
})));
router.get('/sources/tv/:id', sourcesHandler((req) => ({
  type: 'tv', id: req.params.id, season: req.query.s || req.query.season || 1, episode: req.query.e || req.query.episode || 1
})));

router.get('/scrape', async (req, res) => {
  try {
    if (!req.query.url) return res.status(400).json({ ok: false, error: 'Pass ?url=https://… (or POST {rawHtml}).' });
    res.json(await scrapeUrl(req.query.url, { referer: req.query.referer, timeoutMs: Number(req.query.timeout) || 6000 }));
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

router.post('/scrape', async (req, res) => {
  try {
    const { url, rawHtml, referer } = req.body || {};
    if (!url && !rawHtml) return res.status(400).json({ ok: false, error: 'Provide {url} or {rawHtml}.' });
    res.json(await scrapeUrl(url, { rawHtml, referer }));
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

/**
 * CORS + Referer proxy. HLS manifests are rewritten so every segment/key
 * also comes through here (upstream hosts commonly reject foreign referers
 * and don't send CORS headers — the two classic "black player" causes).
 */
router.get('/proxy/stream', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid ?url=' });
  }
  let origin;
  try { origin = new URL(targetUrl).origin; } catch (_) { return res.status(400).json({ ok: false, error: 'Invalid url' }); }
  const referer = req.query.referer || `${origin}/`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': UA,
        Referer: referer,
        ...(req.headers.range ? { Range: req.headers.range } : {})
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000)
    });
    const contentType = upstream.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(upstream.status);

    const isManifest = /\.m3u8($|\?)/i.test(targetUrl) || /mpegurl/i.test(contentType);
    if (isManifest) {
      const text = await upstream.text();
      const proxify = (u) => {
        try {
          const abs = new URL(u, targetUrl).toString();
          return `/api/proxy/stream?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}`;
        } catch (_) { return u; }
      };
      const rewritten = text.split('\n').map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
          // Rewrite URI="…" attributes (keys, alternate renditions, I-frames).
          return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxify(u)}"`);
        }
        return proxify(t);
      }).join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ ok: false, error: `Proxy fetch failed: ${err.message}`, targetUrl });
    else res.end();
  }
});

module.exports = router;
