/**
 * VidFun REST API Routes (/api/*)
 */
const express = require('express');
const router = express.Router();

const { MOVIES, TV_SHOWS, enrichItem, findOrSynthesizeItem } = require('../data/catalog');
const {
  getCustomMedia,
  addCustomMedia,
  removeCustomMedia,
  addCustomProvider,
  getSettings,
  updateSettings
} = require('../data/customStore');
const { getAllProviders } = require('../scrapers/providers');
const {
  getSampleVidsrcHtml,
  scrapeUrl,
  resolveSourcesForMedia
} = require('../scrapers/scraperEngine');
const {
  generateWebVtt,
  generatePosterSvg,
  generateBackdropSvg
} = require('../utils/localMedia');

function getAllCatalogItems() {
  const custom = getCustomMedia();
  const all = [...custom, ...MOVIES, ...TV_SHOWS].map(enrichItem);
  return all;
}

// 1. Health & Info
router.get('/health', (req, res) => {
  const items = getAllCatalogItems();
  res.json({
    ok: true,
    service: 'VidFun Video Player & Embed API',
    version: '1.0.0',
    uptimeSeconds: Math.round(process.uptime()),
    counts: {
      movies: items.filter((i) => i.type === 'movie').length,
      tvShows: items.filter((i) => i.type === 'tv').length,
      providers: getAllProviders().length
    },
    endpoints: {
      movieEmbed: '/embed/movie/:tmdbOrImdbId',
      tvEmbed: '/embed/tv/:tmdbOrImdbId/:season/:episode',
      movieSources: '/api/sources/movie/:id',
      tvSources: '/api/sources/tv/:id/:season/:episode',
      scraper: '/api/scrape?url=...',
      streamProxy: '/api/proxy/stream?url=...'
    }
  });
});

// 2. Full Catalog with Filtering
router.get('/catalog', (req, res) => {
  const { type, genre, q, featured, trending } = req.query;
  let items = getAllCatalogItems();

  if (type && (type === 'movie' || type === 'tv')) {
    items = items.filter((i) => i.type === type);
  }
  if (genre && genre !== 'all') {
    const gLower = String(genre).toLowerCase();
    items = items.filter(
      (i) => Array.isArray(i.genres) && i.genres.some((g) => g.toLowerCase() === gLower)
    );
  }
  if (featured === '1' || featured === 'true') {
    items = items.filter((i) => i.featured);
  }
  if (trending === '1' || trending === 'true') {
    items = items.filter((i) => i.trending);
  }
  if (q && String(q).trim()) {
    const query = String(q).trim().toLowerCase();
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(query) ||
        String(i.tmdbId).toLowerCase() === query ||
        String(i.imdbId).toLowerCase() === query ||
        (i.synopsis && i.synopsis.toLowerCase().includes(query)) ||
        (Array.isArray(i.genres) && i.genres.some((g) => g.toLowerCase().includes(query)))
    );
  }

  const allGenres = Array.from(
    new Set(
      getAllCatalogItems().flatMap((i) => (Array.isArray(i.genres) ? i.genres : []))
    )
  ).sort();

  res.json({
    ok: true,
    total: items.length,
    genres: allGenres,
    items
  });
});

// 3. Search Endpoint (also supports instant TMDB / IMDb ID lookup)
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.json({ ok: true, query: '', results: getAllCatalogItems().slice(0, 12) });
  }

  const qLower = q.toLowerCase();
  const items = getAllCatalogItems();
  const matched = items.filter(
    (i) =>
      i.title.toLowerCase().includes(qLower) ||
      String(i.tmdbId).toLowerCase().includes(qLower) ||
      String(i.imdbId).toLowerCase().includes(qLower) ||
      (i.director && i.director.toLowerCase().includes(qLower)) ||
      (Array.isArray(i.cast) && i.cast.some((c) => c.toLowerCase().includes(qLower))) ||
      (Array.isArray(i.genres) && i.genres.some((g) => g.toLowerCase().includes(qLower)))
  );

  // If user searched a numeric TMDB ID or IMDb ID (tt...) not in catalog, synthesize quick results
  const isTmdbId = /^\d{2,8}$/.test(q);
  const isImdbId = /^tt\d{5,10}$/i.test(q);
  if ((isTmdbId || isImdbId) && matched.length === 0) {
    matched.push(
      findOrSynthesizeItem('movie', q, getCustomMedia()),
      findOrSynthesizeItem('tv', q, getCustomMedia())
    );
  }

  res.json({
    ok: true,
    query: q,
    total: matched.length,
    results: matched
  });
});

// 4. Movies Endpoints
router.get('/movies', (req, res) => {
  const movies = getAllCatalogItems().filter((i) => i.type === 'movie');
  res.json({ ok: true, total: movies.length, movies });
});

router.get('/movies/:id', async (req, res) => {
  try {
    const resolved = await resolveSourcesForMedia({
      type: 'movie',
      id: req.params.id,
      attemptRemoteScrape: req.query.scrape === '1'
    });
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. TV Shows Endpoints
router.get('/tv', (req, res) => {
  const tvShows = getAllCatalogItems().filter((i) => i.type === 'tv');
  res.json({ ok: true, total: tvShows.length, tvShows });
});

router.get('/tv/:id', async (req, res) => {
  try {
    const season = req.query.season || req.query.s || 1;
    const episode = req.query.episode || req.query.e || 1;
    const resolved = await resolveSourcesForMedia({
      type: 'tv',
      id: req.params.id,
      season,
      episode,
      attemptRemoteScrape: req.query.scrape === '1'
    });
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/tv/:id/season/:season/episode/:episode', async (req, res) => {
  try {
    const resolved = await resolveSourcesForMedia({
      type: 'tv',
      id: req.params.id,
      season: req.params.season,
      episode: req.params.episode,
      attemptRemoteScrape: req.query.scrape === '1'
    });
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. Sources Resolution API (VidSrc-compatible JSON resolver)
router.get('/sources/movie/:id', async (req, res) => {
  try {
    const resolved = await resolveSourcesForMedia({
      type: 'movie',
      id: req.params.id,
      attemptRemoteScrape: req.query.scrape === '1'
    });
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/sources/tv/:id', async (req, res) => {
  try {
    const resolved = await resolveSourcesForMedia({
      type: 'tv',
      id: req.params.id,
      season: req.query.s || req.query.season || 1,
      episode: req.query.e || req.query.episode || 1,
      attemptRemoteScrape: req.query.scrape === '1'
    });
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/sources/tv/:id/:season/:episode', async (req, res) => {
  try {
    const resolved = await resolveSourcesForMedia({
      type: 'tv',
      id: req.params.id,
      season: req.params.season,
      episode: req.params.episode,
      attemptRemoteScrape: req.query.scrape === '1'
    });
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. Providers Registry API
router.get('/providers', (req, res) => {
  res.json({
    ok: true,
    providers: getAllProviders()
  });
});

router.post('/providers', (req, res) => {
  const { name, badge, quality, movieTemplate, tvTemplate, mode } = req.body || {};
  if (!name || (!movieTemplate && !tvTemplate)) {
    return res.status(400).json({
      ok: false,
      error: 'Provider name and at least one URL template (movieTemplate or tvTemplate) are required.'
    });
  }
  const created = addCustomProvider({ name, badge, quality, movieTemplate, tvTemplate, mode });
  res.json({
    ok: true,
    provider: created,
    providers: getAllProviders()
  });
});

// 8. Live Scraper & JS Packer Unpacker Endpoint
router.get('/scrape', async (req, res) => {
  try {
    const { url, sample, type = 'movie', id = '693134', s = 1, e = 1 } = req.query;
    if (sample === '1' || (!url && !req.query.rawHtml)) {
      const sampleHtml = getSampleVidsrcHtml({ type, id, season: s, episode: e });
      const result = await scrapeUrl(`https://vidsrc.xyz/embed/${type}/${id}`, {
        rawHtml: sampleHtml
      });
      return res.json({
        ...result,
        sampleHtml
      });
    }
    const result = await scrapeUrl(url, {
      referer: req.query.referer,
      timeoutMs: Number(req.query.timeout) || 5000
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    const { url, rawHtml, referer, sample } = req.body || {};
    if (sample) {
      const sampleHtml = getSampleVidsrcHtml(req.body);
      const result = await scrapeUrl(url || 'https://vidsrc.xyz/embed/movie/693134', {
        rawHtml: sampleHtml
      });
      return res.json({ ...result, sampleHtml });
    }
    const result = await scrapeUrl(url, { rawHtml, referer });
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 9. CORS Stream & HLS Playlist Proxy
router.get('/proxy/stream', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid ?url= parameter' });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const referer = req.query.referer || `${parsedUrl.origin}/`;
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Referer: referer
      }
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (
      targetUrl.includes('.m3u8') ||
      contentType.includes('mpegurl') ||
      contentType.includes('x-mpegURL')
    ) {
      const manifest = await upstream.text();
      // Rewrite relative segment/playlist URLs inside the .m3u8 to go through our proxy
      const rewritten = manifest
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
          try {
            const absUrl = new URL(trimmed, targetUrl).toString();
            return `/api/proxy/stream?url=${encodeURIComponent(absUrl)}&referer=${encodeURIComponent(referer)}`;
          } catch (_) {
            return line;
          }
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }

    res.setHeader('Content-Type', contentType);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: `Upstream proxy fetch failed: ${err.message}`,
      targetUrl
    });
  }
});

// 10. Dynamic WebVTT Subtitles Endpoint
router.get('/subtitles/:id/:langFile', (req, res) => {
  const lang = String(req.params.langFile || 'en.vtt').replace(/\.vtt$/i, '');
  const id = req.params.id;
  const item = findOrSynthesizeItem('movie', id, getCustomMedia());
  const title = req.query.title || item.title || `Stream #${id}`;
  const season = req.query.s || req.query.season;
  const episode = req.query.e || req.query.episode;

  const vtt = generateWebVtt({ title, lang, season, episode });
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(vtt);
});

// 11. Dynamic SVG Poster & Backdrop Artwork
router.get('/artwork/poster/:file', (req, res) => {
  const id = String(req.params.file || '').replace(/\.svg$/i, '');
  const all = getAllCatalogItems();
  const item =
    all.find((i) => String(i.id) === id || String(i.tmdbId) === id) ||
    findOrSynthesizeItem('movie', id);
  const svg = generatePosterSvg(item);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

router.get('/artwork/backdrop/:file', (req, res) => {
  const id = String(req.params.file || '').replace(/\.svg$/i, '');
  const all = getAllCatalogItems();
  const item =
    all.find((i) => String(i.id) === id || String(i.tmdbId) === id) ||
    findOrSynthesizeItem('movie', id);
  const svg = generateBackdropSvg(item);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

// 12. Custom Media Management
router.get('/custom/media', (req, res) => {
  res.json({ ok: true, items: getCustomMedia().map(enrichItem) });
});

router.post('/custom/media', (req, res) => {
  const body = req.body || {};
  if (!body.title) {
    return res.status(400).json({ ok: false, error: 'Title is required' });
  }
  const created = addCustomMedia(body);
  res.json({ ok: true, item: enrichItem(created) });
});

router.delete('/custom/media/:id', (req, res) => {
  const removed = removeCustomMedia(req.params.id);
  res.json({ ok: true, removed });
});

// 13. Settings Management
router.get('/settings', (req, res) => {
  res.json({ ok: true, settings: getSettings() });
});

router.post('/settings', (req, res) => {
  const updated = updateSettings(req.body || {});
  res.json({ ok: true, settings: updated });
});

module.exports = router;
