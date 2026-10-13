/**
 * VidFun — Local Movie & TV Video Player, Scraper & Embed API Server
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const apiRoutes = require('./src/routes/api');
const embedRoutes = require('./src/routes/embed');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Enable CORS for all origins so /embed/* and /api/* work anywhere
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })
);

// Allow iframe embedding from any host/origin (critical for Embed API & Live Preview)
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve hls.js locally so the embed player never depends on an external script CDN
app.get('/vendor/hls.min.js', (req, res) => {
  const hlsPath = path.join(__dirname, 'node_modules/hls.js/dist/hls.min.js');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(hlsPath);
});

// Mount API & Embed Routes
app.use('/api', apiRoutes);
app.use('/', embedRoutes);

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback SPA handler for non-API routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`============================================================`);
    console.log(`🎬 VidFun Video Player & Embed API running at:`);
    console.log(`   Local Portal:  http://localhost:${PORT}`);
    console.log(`   Movie Embed:   http://localhost:${PORT}/embed/movie/693134`);
    console.log(`   TV Show Embed: http://localhost:${PORT}/embed/tv/1396/1/1`);
    console.log(`   Sources API:   http://localhost:${PORT}/api/sources/movie/693134`);
    console.log(`   Scraper API:   http://localhost:${PORT}/api/scrape?sample=1`);
    console.log(`============================================================`);
  });
}

module.exports = app;
