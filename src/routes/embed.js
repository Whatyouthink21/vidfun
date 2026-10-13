/**
 * VidFun Embed Player Routes
 * Compatible with VidSrc (.xyz / .icu / .cc / .to / .me) URL conventions:
 *  - /embed/movie/:id
 *  - /embed/movie?tmdb=:id or ?imdb=:id
 *  - /embed/tv/:id/:season/:episode
 *  - /embed/tv/:id/:season-:episode
 *  - /embed/tv/:id?s=1&e=1
 *  - /embed/tv?tmdb=:id&season=1&episode=1
 *  - /v2/embed/movie/:id
 *  - /v2/embed/tv/:id/:season/:episode
 */
const path = require('path');
const express = require('express');
const router = express.Router();

const EMBED_HTML_PATH = path.join(__dirname, '../../public/embed.html');

function serveEmbedPage(req, res) {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(EMBED_HTML_PATH);
}

// Movie Embed Routes
router.get('/embed/movie', serveEmbedPage);
router.get('/embed/movie/:id', serveEmbedPage);
router.get('/v2/embed/movie/:id', serveEmbedPage);

// TV Show Embed Routes
router.get('/embed/tv', serveEmbedPage);
router.get('/embed/tv/:id', serveEmbedPage);
router.get('/embed/tv/:id/:seasonEpisode', serveEmbedPage);
router.get('/embed/tv/:id/:season/:episode', serveEmbedPage);
router.get('/v2/embed/tv/:id', serveEmbedPage);
router.get('/v2/embed/tv/:id/:season/:episode', serveEmbedPage);

module.exports = router;
