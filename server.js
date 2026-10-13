/**
 * VidFun — movie & TV embed API with its own scraping player.
 * Not a streaming site: no catalog, no browsing. See README.md.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
  // The whole point is to be iframed from anywhere.
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  next();
});
app.use(express.json({ limit: '2mb' }));

app.get('/vendor/hls.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/hls.js/dist/hls.min.js'));
});

app.use('/api', require('./src/routes/api'));
app.use('/', require('./src/routes/embed'));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found. See / for the embed API docs.' }));

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`VidFun embed API on http://localhost:${PORT}`);
    console.log(`  Movie:  http://localhost:${PORT}/embed/movie/550`);
    console.log(`  TV:     http://localhost:${PORT}/embed/tv/1399/1/1`);
    console.log(`  JSON:   http://localhost:${PORT}/api/sources/movie/550`);
    console.log(`  TMDB key: ${process.env.TMDB_API_KEY ? 'set (id conversion + metadata on)' : 'not set (IMDb<->TMDB conversion off)'}`);
  });
}

module.exports = app;
