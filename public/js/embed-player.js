/**
 * VidFun embed player.
 *
 * Playback order (this is the "not playing" fix — no demo clips, no fake canvas):
 *   1. Direct streams our server scraped from upstream (HLS/MP4, via /api/proxy/stream)
 *   2. Auto-failover to the next scraped stream on fatal HLS errors
 *   3. Fallback to provider iframes (VidLink, Videasy, VidSrc, …) which resolve
 *      the stream client-side in the visitor's browser
 *   4. Only then: an honest error screen listing every server and why it failed
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const video = $('video'), frame = $('frame'), spinner = $('spinner'), spinnerText = $('spinner-text');
  const bigPlay = $('big-play'), toast = $('toast'), serverSel = $('server'), qualitySel = $('quality');
  const subsSel = $('subs'), statusEl = $('status'), titleEl = $('title'), badge = $('mode-badge');
  const controls = $('controls'), bar = $('bar'), fatal = $('fatal');

  // ---- Parse route: /embed/movie/:id · /embed/tv/:id/:s/:e · /embed/tv/:id/:s-:e · query forms
  const parts = location.pathname.split('/').filter(Boolean);
  const q = new URLSearchParams(location.search);
  const ei = parts.indexOf('embed');
  const type = (ei >= 0 && parts[ei + 1] === 'tv') || q.get('type') === 'tv' ? 'tv' : 'movie';
  const id = (ei >= 0 && parts[ei + 2]) || q.get('tmdb') || q.get('imdb') || q.get('id') || '';
  let season = parseInt(q.get('s') || q.get('season') || '1', 10) || 1;
  let episode = parseInt(q.get('e') || q.get('episode') || '1', 10) || 1;
  if (type === 'tv' && ei >= 0) {
    const a = parts[ei + 3], b = parts[ei + 4];
    if (a && b) { season = +a || 1; episode = +b || 1; }
    else if (a && a.includes('-')) { const [s, e] = a.split('-'); season = +s || 1; episode = +e || 1; }
  }
  const autoplay = q.get('autoplay') === '1' || q.get('autoplay') === 'true';
  const startAt = parseFloat(q.get('t') || q.get('start') || '0') || 0;
  const color = (q.get('color') || '').replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(color)) document.documentElement.style.setProperty('--accent', `#${color}`);
  const wantedServer = q.get('server') || '';

  let data = null, hls = null, mode = null, directIdx = 0, triedServers = new Set();

  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
  };
  let toastTimer;
  function showToast(msg, ms = 4000) {
    toast.textContent = msg; toast.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), ms);
  }
  function setStatus(s) { statusEl.textContent = s; }
  function goToEpisode(s, e) {
    location.href = `/embed/tv/${encodeURIComponent(id)}/${s}/${e}${location.search.replace(/[?&](s|season|e|episode)=[^&]*/g, '')}`;
  }

  // ---- Source loading
  async function load() {
    if (!id) { showFatal('No id in the URL. Use /embed/movie/{tmdbOrImdbId} or /embed/tv/{id}/{season}/{episode}.'); return; }
    const srcUrl = type === 'tv' ? `/api/sources/tv/${encodeURIComponent(id)}/${season}/${episode}` : `/api/sources/movie/${encodeURIComponent(id)}`;
    try {
      const res = await fetch(`${srcUrl}?scrape=1${autoplay ? '&autoplay=1' : ''}${color ? `&color=${color}` : ''}${startAt ? `&t=${startAt}` : ''}`);
      data = await res.json();
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (err) { showFatal(err.message); return; }

    titleEl.textContent = data.meta?.title
      ? `${data.meta.title}${type === 'tv' ? ` — S${season} E${episode}` : ''}`
      : `${type === 'tv' ? 'TV' : 'Movie'} ${data.ids.tmdb || data.ids.imdb} · S${season}E${episode}`;
    if (data.meta?.backdrop) video.poster = data.meta.backdrop;
    buildServerMenu();
    if (type === 'tv') {
      $('ep-nav').classList.remove('hidden');
      $('in-s').value = season; $('in-e').value = episode;
    }

    const start = wantedServer && data.providers.find((p) => p.id === wantedServer && p.available)
      ? wantedServer
      : (data.direct[0] ? '__direct' : data.providers.find((p) => p.available)?.id);
    if (!start) { showFatal('No provider accepts this id kind. Pass a TMDB id, or set TMDB_API_KEY on the server to convert IMDb ids.'); return; }
    selectServer(start);
  }

  function buildServerMenu() {
    serverSel.innerHTML = '';
    if (data.direct.length) {
      const o = document.createElement('option');
      o.value = '__direct';
      o.textContent = `⚡ Scraped direct stream (${data.direct.length})`;
      serverSel.appendChild(o);
    }
    for (const p of data.providers) {
      const o = document.createElement('option');
      o.value = p.id;
      o.disabled = !p.available;
      o.textContent = p.available ? `${p.name}${p.mode === 'scraped' ? ' · scraped' : ''}` : `${p.name} — unavailable for this id`;
      o.title = p.available ? p.embedUrl : p.reason;
      serverSel.appendChild(o);
    }
  }

  function selectServer(value) {
    serverSel.value = value;
    triedServers.add(value);
    if (value === '__direct') playDirect(0);
    else playIframe(data.providers.find((p) => p.id === value));
  }

  function nextFallback() {
    if (mode === 'direct' && directIdx + 1 < data.direct.length) { playDirect(directIdx + 1); return; }
    const next = data.providers.find((p) => p.available && !triedServers.has(p.id));
    if (next) {
      showToast(`Direct stream failed — switching to ${next.name}…`);
      selectServer(next.id);
    } else showFatalFromReports();
  }

  // ---- Direct (scraped) playback
  function destroyHls() { if (hls) { hls.destroy(); hls = null; } }
  function playDirect(idx) {
    const src = data.direct[idx];
    if (!src) return nextFallback();
    directIdx = idx; mode = 'direct';
    frame.classList.add('hidden'); frame.removeAttribute('src');
    video.classList.remove('hidden'); controls.classList.remove('hidden');
    badge.textContent = `DIRECT · ${src.providerName}`;
    spinner.classList.remove('hidden'); spinnerText.textContent = `Loading ${src.quality} stream from ${src.providerName}…`;
    setStatus(`${src.providerName} · ${src.quality}${src.verified === false ? ' · unverified' : ''}`);
    destroyHls();
    video.removeAttribute('src'); video.load();

    const url = src.proxiedUrl || src.url;
    const onReady = () => {
      spinner.classList.add('hidden');
      if (startAt) video.currentTime = startAt;
      if (autoplay) video.play().catch(() => bigPlay.classList.remove('hidden'));
      else bigPlay.classList.remove('hidden');
    };
    if (src.type === 'hls' || /\.m3u8($|\?)/.test(url)) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url; video.addEventListener('loadedmetadata', onReady, { once: true });
      } else if (window.Hls && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(url); hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
          qualitySel.innerHTML = '<option value="-1">Auto</option>' +
            d.levels.map((l, i) => `<option value="${i}">${l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`}</option>`).join('');
          qualitySel.classList.toggle('hidden', d.levels.length < 2);
          onReady();
        });
        hls.on(Hls.Events.ERROR, (_, e) => {
          if (!e.fatal) return;
          if (e.type === Hls.ErrorTypes.NETWORK_ERROR) { showToast('Network error — retrying…'); hls.startLoad(); }
          else if (e.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else { destroyHls(); nextFallback(); }
        });
      } else { showToast('HLS is not supported in this browser.'); nextFallback(); }
    } else {
      video.src = url; video.addEventListener('loadedmetadata', onReady, { once: true });
    }
    buildSubs();
  }

  function buildSubs() {
    subsSel.innerHTML = '<option value="">Subs off</option>';
    (data.subtitles || []).forEach((s, i) => {
      const track = document.createElement('track');
      track.kind = 'subtitles'; track.label = s.label || s.lang || `Sub ${i + 1}`;
      track.srclang = s.lang || 'en';
      track.src = `/api/proxy/stream?url=${encodeURIComponent(s.url)}`;
      video.appendChild(track);
      const o = document.createElement('option'); o.value = String(i); o.textContent = track.label;
      subsSel.appendChild(o);
    });
  }

  // ---- Iframe playback
  function playIframe(p) {
    if (!p || !p.available) return nextFallback();
    mode = 'iframe';
    destroyHls(); video.pause(); video.classList.add('hidden');
    controls.classList.add('hidden'); spinner.classList.add('hidden'); bigPlay.classList.add('hidden');
    badge.textContent = `IFRAME · ${p.name}`;
    setStatus(p.embedUrl);
    frame.src = p.embedUrl;
    frame.classList.remove('hidden');
  }

  function showFatal(detail) {
    spinner.classList.add('hidden');
    $('fatal-detail').textContent = detail || '';
    fatal.classList.remove('hidden');
  }
  function showFatalFromReports() {
    const lines = (data.scrapeReport || []).map((r) => `${r.provider}: ${r.ok ? `${r.streams} stream(s)` : (r.error || 'no streams')}`);
    showFatal(`Scraped streams failed to play and every iframe server was tried. ${lines.join(' · ')}`.trim());
    $('fatal-servers').innerHTML = data.providers.filter((p) => p.available)
      .map((p) => `<button data-s="${p.id}">${p.name}</button>`).join(' ');
    $('fatal-servers').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => { fatal.classList.add('hidden'); triedServers.clear(); selectServer(b.dataset.s); }));
  }

  // ---- Controls
  $('btn-play').onclick = () => (video.paused ? video.play() : video.pause());
  bigPlay.onclick = () => { bigPlay.classList.add('hidden'); video.play(); };
  video.addEventListener('play', () => { $('btn-play').textContent = '⏸'; bigPlay.classList.add('hidden'); });
  video.addEventListener('pause', () => { $('btn-play').textContent = '▶'; });
  video.addEventListener('error', () => { if (mode === 'direct') nextFallback(); });
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    $('seek-played').style.width = `${(video.currentTime / video.duration) * 100}%`;
    $('time').textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
  });
  video.addEventListener('progress', () => {
    try { if (video.buffered.length && video.duration) $('seek-buf').style.width = `${(video.buffered.end(video.buffered.length - 1) / video.duration) * 100}%`; } catch (_) {}
  });
  video.addEventListener('ended', () => { if (type === 'tv' && q.get('autonext') === '1') goToEpisode(season, episode + 1); });
  $('seek-wrap').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (video.duration) video.currentTime = ((e.clientX - r.left) / r.width) * video.duration;
  };
  $('btn-back').onclick = () => { video.currentTime = Math.max(0, video.currentTime - 10); };
  $('btn-fwd').onclick = () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); };
  $('vol').oninput = (e) => { video.volume = +e.target.value; };
  $('speed').onchange = (e) => { video.playbackRate = +e.target.value; };
  qualitySel.onchange = (e) => { if (hls) hls.currentLevel = +e.target.value; };
  subsSel.onchange = (e) => {
    [...video.textTracks].forEach((t, i) => { t.mode = String(i) === e.target.value ? 'showing' : 'hidden'; });
  };
  $('btn-pip').onclick = () => video.requestPictureInPicture && video.requestPictureInPicture().catch(() => {});
  $('btn-fs').onclick = () => {
    const el = $('root');
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen && el.requestFullscreen();
  };
  serverSel.onchange = (e) => selectServer(e.target.value);
  $('ep-go').onclick = () => goToEpisode(+$('in-s').value || 1, +$('in-e').value || 1);
  $('ep-next').onclick = () => goToEpisode(season, episode + 1);
  $('ep-prev').onclick = () => goToEpisode(season, Math.max(1, episode - 1));
  document.addEventListener('keydown', (e) => {
    if (mode !== 'direct') return;
    if (e.code === 'Space') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    if (e.code === 'ArrowRight') video.currentTime += 10;
    if (e.code === 'ArrowLeft') video.currentTime -= 10;
    if (e.code === 'KeyF') $('btn-fs').click();
  });
  // Idle-hide chrome
  let idle;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 3000);
  };
  ['mousemove', 'touchstart', 'click'].forEach((ev) => document.addEventListener(ev, wake)); wake();

  load();
})();
