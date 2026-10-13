/**
 * Verification: provider URL building, packer unpacking, HTML parsing,
 * and the HTTP surface. No network, no fake streams — fixtures are local
 * and assertions check honesty (e.g. no direct streams when scrape=0).
 */
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { unpackAll } = require('../src/unpacker');
const { parseHtmlForStreams } = require('../src/scraper');
const { getProviders, buildProviderTarget } = require('../src/providers');
const { parseId } = require('../src/tmdb');

function request(server, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({ hostname: '127.0.0.1', port, path: reqPath, method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const FIXTURE = `<!DOCTYPE html><html><head><title>Watch Movie 550</title></head><body>
  <div class="server" data-hash="${Buffer.from('https://cdn.example.com/movie/550/master.m3u8').toString('base64')}">CloudStream</div>
  <div class="server" data-hash="abc123hash">VidPlay</div>
  <iframe id="player_iframe" src="//cloudnestra.com/rcp/abc123hash"></iframe>
  <script>eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('0.1({2:[{3:"4://5-6.7.8/9/9.a",b:"c"}],d:[{3:"4://e.f.g/h/i/j.k",l:"m"}]});',23,23,'jwplayer|setup|sources|file|https|test|streams|mux|dev|x36xhzz|m3u8|label|1080p|tracks|bitdash|akamaihd|net|content|sintel|subtitles|vtt|kind|captions'.split('|'),0,{}))</script>
</body></html>`;

async function run() {
  console.log('Running VidFun embed-API verification…');

  // IDs
  assert.deepStrictEqual(parseId('tt0137523'), { kind: 'imdb', imdbId: 'tt0137523', tmdbId: null });
  assert.strictEqual(parseId('550').tmdbId, '550');
  assert.strictEqual(parseId('nonsense').kind, null);

  // Provider URL building — the old bug factory: wrong-kind ids must not build.
  const byId = Object.fromEntries(getProviders().map((p) => [p.id, p]));
  assert.strictEqual(
    buildProviderTarget(byId.vidlink, { type: 'tv', tmdbId: '1399', season: 1, episode: 2 }).embedUrl,
    'https://vidlink.pro/tv/1399/1/2'
  );
  const vidlinkImdbOnly = buildProviderTarget(byId.vidlink, { type: 'movie', imdbId: 'tt0137523' });
  assert.strictEqual(vidlinkImdbOnly.available, false, 'TMDB-only provider must refuse an IMDb-only request');
  assert.match(vidlinkImdbOnly.reason, /TMDB_API_KEY/);
  assert.strictEqual(
    buildProviderTarget(byId.vidsrc, { type: 'tv', tmdbId: '1399', season: 2, episode: 3 }).embedUrl,
    'https://vidsrc.xyz/embed/tv/1399/2-3'
  );
  assert.strictEqual(
    buildProviderTarget(byId['2embed'], { type: 'tv', tmdbId: '1399', imdbId: 'tt0903747', season: 1, episode: 1 }).embedUrl,
    'https://www.2embed.cc/embedtv/tt0903747&s=1&e=1'
  );
  assert.strictEqual(
    buildProviderTarget(byId.multiembed, { type: 'movie', imdbId: 'tt0137523' }).embedUrl,
    'https://multiembed.mov/?video_id=tt0137523',
    'SuperEmbed must drop &tmdb=1 for IMDb ids'
  );
  console.log('✓ provider URL building');

  // Packer + parser fixture
  assert.ok(unpackAll(FIXTURE)[0].includes('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'));
  const parsed = parseHtmlForStreams(FIXTURE, 'https://vidsrc.xyz/embed/movie/550');
  assert.strictEqual(parsed.servers.length, 2);
  assert.strictEqual(parsed.servers[0].decodedUrl, 'https://cdn.example.com/movie/550/master.m3u8');
  assert.ok(parsed.hops.includes('https://cloudnestra.com/rcp/abc123hash'));
  assert.ok(parsed.streams.some((s) => s.url.includes('.m3u8')));
  assert.ok(parsed.subtitles.some((s) => s.url.includes('.vtt')));
  console.log('✓ packer unpacker + VidSrc HTML parser');

  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const health = JSON.parse((await request(server, '/api/health')).body);
    assert.strictEqual(health.ok, true);
    assert.ok(health.providers.includes('vidlink'));

    // scrape=0: providers are built, but NO direct streams may be invented.
    const src = JSON.parse((await request(server, '/api/sources/movie/550?scrape=0')).body);
    assert.strictEqual(src.ok, true);
    assert.deepStrictEqual(src.direct, [], 'scrape=0 must not fabricate direct streams');
    assert.ok(src.providers.find((p) => p.id === 'vidlink').available);
    assert.ok(src.providers.every((p) => !p.available || /^https?:/.test(p.embedUrl)));

    const tv = JSON.parse((await request(server, '/api/sources/tv/1399/1/2?scrape=0')).body);
    assert.strictEqual(tv.season, 1); assert.strictEqual(tv.episode, 2);

    const imdbOnly = JSON.parse((await request(server, '/api/sources/movie/tt0137523?scrape=0')).body);
    assert.strictEqual(imdbOnly.providers.find((p) => p.id === 'vidlink').available, false);
    assert.strictEqual(imdbOnly.providers.find((p) => p.id === '2embed').available, true);

    const bad = await request(server, '/api/sources/movie/not-an-id?scrape=0');
    assert.strictEqual(bad.status, 400);

    for (const path of ['/embed/movie/550', '/embed/tv/1399/1/1', '/embed/tv/1399/1-1', '/v2/embed/movie/550']) {
      const page = await request(server, path);
      assert.strictEqual(page.status, 200, path);
      assert.ok(page.body.includes('id="video"'), path);
      assert.ok(!page.body.includes('Sintel') && !page.body.includes('test-streams'), `${path} must not contain demo streams`);
    }

    const scrape = JSON.parse((await request(server, '/api/scrape', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawHtml: FIXTURE })
    })).body);
    assert.strictEqual(scrape.mode, 'raw-html');
    assert.ok(scrape.streams.length >= 1);

    const proxy400 = await request(server, '/api/proxy/stream');
    assert.strictEqual(proxy400.status, 400);
    console.log('✓ HTTP API + embed routes');
  } finally { server.close(); }

  console.log('All verification checks passed.');
}

run().catch((err) => { console.error('Test failed:', err); process.exit(1); });
