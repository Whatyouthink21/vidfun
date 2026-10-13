/**
 * Automated Verification Suite for VidFun Video Player, Scraper & Embed API
 */
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { unpackAll, extractMediaFromText } = require('../src/scrapers/unpacker');
const { getSampleVidsrcHtml, parseHtmlForStreams } = require('../src/scrapers/scraperEngine');

function request(server, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: reqPath,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  console.log('Running VidFun verification suite...');

  // 1. Test JS Packer Unpacker & Stream Extractor
  const sampleHtml = getSampleVidsrcHtml({ type: 'movie', id: '693134' });
  const unpacked = unpackAll(sampleHtml);
  assert(unpacked.length >= 1, 'Should unpack Dean Edwards packed JS script');
  assert(
    unpacked[0].includes('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'),
    'Unpacked script should reveal obfuscated .m3u8 stream URL'
  );

  // 2. Test VidSrc DOM & Hash Parser
  const parsed = parseHtmlForStreams(sampleHtml, 'https://vidsrc.xyz');
  assert(parsed.servers.length >= 3, 'Should extract data-hash server items');
  assert(parsed.streams.length >= 2, 'Should extract .m3u8 and .mp4 stream URLs');
  assert(parsed.iframes.length >= 1, 'Should extract #player_iframe src');
  console.log('✓ Scraper & JS Packer Unpacker tests passed');

  // 3. Test Express HTTP Endpoints
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const health = await request(server, '/api/health');
    assert.strictEqual(health.status, 200);
    const healthJson = JSON.parse(health.body);
    assert.strictEqual(healthJson.ok, true);

    const movieSources = await request(server, '/api/sources/movie/693134');
    assert.strictEqual(movieSources.status, 200);
    const movieJson = JSON.parse(movieSources.body);
    assert.strictEqual(movieJson.ok, true);
    assert.strictEqual(movieJson.media.title, 'Dune: Part Two');
    assert(movieJson.directSources.length >= 3, 'Should provide multiple direct stream qualities');
    assert(movieJson.providers.length >= 7, 'Should include VidFun Direct + VidSrc/MultiEmbed/2Embed providers');

    const tvSources = await request(server, '/api/sources/tv/1396/1/2');
    assert.strictEqual(tvSources.status, 200);
    const tvJson = JSON.parse(tvSources.body);
    assert.strictEqual(tvJson.ok, true);
    assert.strictEqual(tvJson.media.title, 'Breaking Bad');
    assert.strictEqual(tvJson.media.season, 1);
    assert.strictEqual(tvJson.media.episode, 2);

    // Test dynamic synthesis for arbitrary TMDB ID (e.g. 550 Fight Club)
    const dynamicMovie = await request(server, '/api/sources/movie/550');
    assert.strictEqual(dynamicMovie.status, 200);
    const dynJson = JSON.parse(dynamicMovie.body);
    assert.strictEqual(dynJson.ok, true);
    assert.strictEqual(dynJson.media.tmdbId, '550');

    // Test Embed HTML routes
    const embedMovie = await request(server, '/embed/movie/693134');
    assert.strictEqual(embedMovie.status, 200);
    assert(embedMovie.body.includes('id="vf-video"'), 'Movie embed route should serve embed player HTML');

    const embedTv = await request(server, '/embed/tv/1396/1/1');
    assert.strictEqual(embedTv.status, 200);
    assert(embedTv.body.includes('id="vf-video"'), 'TV embed route should serve embed player HTML');

    // Test Subtitles WebVTT endpoint
    const vttRes = await request(server, '/api/subtitles/693134/en.vtt');
    assert.strictEqual(vttRes.status, 200);
    assert(vttRes.body.startsWith('WEBVTT'), 'Subtitles endpoint should return valid WEBVTT');

    console.log('✓ HTTP API & Embed route tests passed');
  } finally {
    server.close();
  }

  console.log('All VidFun verification checks passed!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
