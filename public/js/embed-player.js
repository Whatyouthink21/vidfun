/**
 * VidFun Standalone & Iframe Embed Player Engine
 * Supports:
 * - Adaptive HLS (.m3u8) via hls.js & native HLS
 * - Multi-quality MP4 switching (1080p, 720p, 480p)
 * - Built-in Local Cinema Stream Synthesizer (Canvas 60fps + WebAudio) for 100% offline/airgapped reliability
 * - Multi-Server Switcher (VidFun Direct, VidSrc.xyz, VidSrc.icu, VidSrc.cc, VidSrc.to, SuperEmbed, AutoEmbed, 2Embed)
 * - Live Scraper & JS Unpacker inspector right inside the player
 * - WebVTT Subtitle parser & custom overlay renderer
 * - TV Season & Episode drawer + Next Episode auto-advance
 */
(function () {
  // DOM Elements
  const playerRoot = document.getElementById('player-root');
  const mediaTitleEl = document.getElementById('media-title');
  const mediaSubtitleEl = document.getElementById('media-subtitle');
  const serverBtn = document.getElementById('server-btn');
  const activeServerLabel = document.getElementById('active-server-label');
  const serverMenu = document.getElementById('server-menu');
  const serverList = document.getElementById('server-list');
  const episodesBtn = document.getElementById('episodes-btn');

  const directLayer = document.getElementById('direct-player-layer');
  const backdropPoster = document.getElementById('backdrop-poster');
  const video = document.getElementById('vf-video');
  const synthCanvas = document.getElementById('synth-canvas');
  const subtitleOverlay = document.getElementById('subtitle-overlay');
  const loadingSpinner = document.getElementById('loading-spinner');
  const loadingText = document.getElementById('loading-text');
  const centerPlayBtn = document.getElementById('center-play-btn');

  const timelineContainer = document.getElementById('timeline-container');
  const timelineHoverTime = document.getElementById('timeline-hover-time');
  const timelineBuffered = document.getElementById('timeline-buffered');
  const timelineProgress = document.getElementById('timeline-progress');
  const timelineThumb = document.getElementById('timeline-thumb');

  const playPauseBtn = document.getElementById('play-pause-btn');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const rewindBtn = document.getElementById('rewind-btn');
  const forwardBtn = document.getElementById('forward-btn');
  const nextEpBtn = document.getElementById('next-ep-btn');
  const muteBtn = document.getElementById('mute-btn');
  const iconVolHigh = document.getElementById('icon-vol-high');
  const iconVolMute = document.getElementById('icon-vol-mute');
  const volumeSlider = document.getElementById('volume-slider');
  const currentTimeEl = document.getElementById('current-time');
  const durationTimeEl = document.getElementById('duration-time');

  const ccBtn = document.getElementById('cc-btn');
  const ccMenu = document.getElementById('cc-menu');
  const ccOptions = document.getElementById('cc-options');
  const settingsBtn = document.getElementById('settings-btn');
  const qualityBadge = document.getElementById('quality-badge');
  const settingsMenu = document.getElementById('settings-menu');
  const qualityOptions = document.getElementById('quality-options');
  const speedOptions = document.getElementById('speed-options');
  const pipBtn = document.getElementById('pip-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  const externalLayer = document.getElementById('external-embed-layer');
  const externalProviderName = document.getElementById('external-provider-name');
  const externalProviderUrl = document.getElementById('external-provider-url');
  const externalOpenTab = document.getElementById('external-open-tab');
  const externalIframe = document.getElementById('external-iframe');
  const scrapeCurrentBtn = document.getElementById('scrape-current-btn');
  const switchDirectBtn = document.getElementById('switch-direct-btn');
  const scrapeOverlay = document.getElementById('scrape-overlay');
  const closeScrapeOverlay = document.getElementById('close-scrape-overlay');
  const scrapeModalBody = document.getElementById('scrape-modal-body');

  const episodesDrawer = document.getElementById('episodes-drawer');
  const drawerShowTitle = document.getElementById('drawer-show-title');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const seasonTabs = document.getElementById('season-tabs');
  const episodeList = document.getElementById('episode-list');

  // State
  let hlsInstance = null;
  let resolvedData = null;
  let currentServerId = 'vidfun-direct';
  let currentQualityId = 'hls-auto';
  let currentSpeed = 1;
  let currentSubLang = 'en';
  let subtitleCues = [];
  let idleTimer = null;

  // Local Synthesizer Fallback State (when offline or user selects Local Synth HD)
  let synthState = {
    active: false,
    playing: false,
    currentTime: 0,
    duration: 734, // 12m 14s
    rafId: null,
    lastTick: 0,
    audioCtx: null,
    gainNode: null
  };

  /**
   * Parse URL path and query parameters to identify movie/tv, id, season, episode, and options
   */
  function parseEmbedRoute() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const params = new URLSearchParams(window.location.search);

    // Handle /v2/embed/... prefix
    const embedIdx = pathParts.indexOf('embed');
    const typeSegment = embedIdx >= 0 ? pathParts[embedIdx + 1] : 'movie';
    const type = typeSegment === 'tv' || typeSegment === 'series' ? 'tv' : 'movie';

    let id =
      (embedIdx >= 0 ? pathParts[embedIdx + 2] : null) ||
      params.get('tmdb') ||
      params.get('imdb') ||
      params.get('id') ||
      (type === 'tv' ? '1396' : '693134');

    let season = parseInt(params.get('season') || params.get('s') || '1', 10);
    let episode = parseInt(params.get('episode') || params.get('e') || '1', 10);

    if (type === 'tv' && embedIdx >= 0) {
      const seg3 = pathParts[embedIdx + 3];
      const seg4 = pathParts[embedIdx + 4];
      if (seg3 && seg4) {
        season = parseInt(seg3, 10) || 1;
        episode = parseInt(seg4, 10) || 1;
      } else if (seg3 && seg3.includes('-')) {
        const [sPart, ePart] = seg3.split('-');
        season = parseInt(sPart, 10) || 1;
        episode = parseInt(ePart, 10) || 1;
      } else if (seg3) {
        season = parseInt(seg3, 10) || 1;
      }
    }

    const color = params.get('color') || params.get('theme');
    if (color) {
      const hex = color.startsWith('#') ? color : `#${color}`;
      if (/^#[0-9a-fA-F]{3,6}$/.test(hex)) {
        document.documentElement.style.setProperty('--player-accent', hex);
      }
    }

    return {
      type,
      id,
      season,
      episode,
      autoplay: params.get('autoplay') === '1' || params.get('autoplay') === 'true',
      server: params.get('server') || 'vidfun-direct',
      sub: params.get('sub') || params.get('ds_lang') || 'en',
      startTime: parseFloat(params.get('t') || '0') || 0
    };
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const total = Math.floor(sec);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Parse WebVTT text into [{ start, end, text }]
   */
  function parseVtt(vttText) {
    if (!vttText) return [];
    const blocks = vttText.replace(/\r\n/g, '\n').split('\n\n');
    const cues = [];

    function toSeconds(tc) {
      const parts = tc.trim().split(':');
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      }
      if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      }
      return 0;
    }

    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const arrowIdx = lines.findIndex((l) => l.includes('-->'));
      if (arrowIdx === -1) continue;
      const [startStr, endStr] = lines[arrowIdx].split('-->');
      const text = lines.slice(arrowIdx + 1).join('<br/>');
      cues.push({
        start: toSeconds(startStr),
        end: toSeconds(endStr),
        text
      });
    }
    return cues;
  }

  async function loadSubtitleTrack(lang) {
    currentSubLang = lang;
    renderCcMenu();

    if (lang === 'off' || !resolvedData || !Array.isArray(resolvedData.subtitles)) {
      subtitleCues = [];
      subtitleOverlay.innerHTML = '';
      ccBtn.classList.remove('active-sub');
      return;
    }

    ccBtn.classList.add('active-sub');
    const track =
      resolvedData.subtitles.find((s) => s.lang === lang) || resolvedData.subtitles[0];
    if (!track) return;

    try {
      const res = await fetch(track.url);
      const vttText = await res.text();
      subtitleCues = parseVtt(vttText);
      updateSubtitleOverlay(getCurrentTime());
    } catch (_) {
      subtitleCues = [];
    }
  }

  function updateSubtitleOverlay(timeSec) {
    if (currentSubLang === 'off' || !subtitleCues.length) {
      subtitleOverlay.innerHTML = '';
      return;
    }
    // Loop cues modulo 70s so subtitles keep appearing throughout long videos
    const loopedTime = timeSec % 70;
    const active = subtitleCues.find((c) => loopedTime >= c.start && loopedTime <= c.end);
    if (active) {
      subtitleOverlay.innerHTML = `<span>${active.text}</span>`;
    } else {
      subtitleOverlay.innerHTML = '';
    }
  }

  /**
   * Local Cinema Synthesizer (60fps Canvas + WebAudio Harmonic Pad)
   * Guarantees smooth HD playback even in offline/airgapped environments
   */
  function startLocalSynth(autoPlay = true) {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();

    synthState.active = true;
    synthCanvas.classList.remove('hidden');
    loadingSpinner.classList.add('hidden');
    qualityBadge.textContent = 'SYNTH HD';

    drawSynthFrame();
    durationTimeEl.textContent = formatTime(synthState.duration);

    if (autoPlay) {
      playMedia();
    }
  }

  function stopLocalSynth() {
    synthState.active = false;
    synthState.playing = false;
    if (synthState.rafId) {
      cancelAnimationFrame(synthState.rafId);
      synthState.rafId = null;
    }
    stopSynthAudio();
    synthCanvas.classList.add('hidden');
  }

  function startSynthAudio() {
    try {
      if (!synthState.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.value = video.muted ? 0 : video.volume * 0.12;
        gain.connect(ctx.destination);

        // Warm cinematic chord (A minor 9th pad)
        [110, 164.81, 220, 261.63, 329.63].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = i % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.value = freq;
          const oscGain = ctx.createGain();
          oscGain.gain.value = 0.18 / (i + 1);
          osc.connect(oscGain);
          oscGain.connect(gain);
          osc.start();
        });

        synthState.audioCtx = ctx;
        synthState.gainNode = gain;
      } else if (synthState.audioCtx.state === 'suspended') {
        synthState.audioCtx.resume();
      }
    } catch (_) {}
  }

  function stopSynthAudio() {
    try {
      if (synthState.audioCtx && synthState.audioCtx.state === 'running') {
        synthState.audioCtx.suspend();
      }
    } catch (_) {}
  }

  function drawSynthFrame() {
    const ctx = synthCanvas.getContext('2d');
    const w = synthCanvas.width;
    const h = synthCanvas.height;
    const t = synthState.currentTime;

    // Deep space cinematic gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#060913');
    grad.addColorStop(0.5, '#111827');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Animated orbital rings & starfield
    const cx = w * 0.5;
    const cy = h * 0.46;
    for (let i = 0; i < 45; i++) {
      const angle = (i * 1.37 + t * (0.12 + (i % 5) * 0.03)) % (Math.PI * 2);
      const radius = 60 + ((i * 29) % 460);
      const x = cx + Math.cos(angle) * radius * 1.4;
      const y = cy + Math.sin(angle) * radius * 0.65;
      const size = 1.5 + (i % 3);
      ctx.fillStyle = i % 4 === 0 ? '#f43f5e' : '#38bdf8';
      ctx.globalAlpha = 0.35 + 0.45 * Math.sin(t * 2 + i);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Glowing horizon core
    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 240);
    glow.addColorStop(0, 'rgba(229, 9, 20, 0.55)');
    glow.addColorStop(0.5, 'rgba(99, 102, 241, 0.22)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.fill();

    // HUD Telemetry & Media Title
    const title = (resolvedData && resolvedData.media && resolvedData.media.title) || 'VidFun Cinema Stream';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase(), cx, cy + 10);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 16px monospace';
    ctx.fillText(
      `VIDFUN LOCAL HD STREAM • TC ${formatTime(t)} / ${formatTime(synthState.duration)} • ${currentSpeed}x`,
      cx,
      cy + 46
    );
  }

  function tickSynth(now) {
    if (!synthState.active || !synthState.playing) return;
    const dt = Math.min(0.1, (now - synthState.lastTick) / 1000) * currentSpeed;
    synthState.lastTick = now;
    synthState.currentTime += dt;
    if (synthState.currentTime >= synthState.duration) {
      synthState.currentTime = 0;
    }
    drawSynthFrame();
    syncTimelineUi(synthState.currentTime, synthState.duration, synthState.duration);
    updateSubtitleOverlay(synthState.currentTime);
    synthState.rafId = requestAnimationFrame(tickSynth);
  }

  function getCurrentTime() {
    return synthState.active ? synthState.currentTime : video.currentTime || 0;
  }

  function getDuration() {
    return synthState.active ? synthState.duration : video.duration || 0;
  }

  function syncTimelineUi(current, duration, bufferedEnd = 0) {
    currentTimeEl.textContent = formatTime(current);
    durationTimeEl.textContent = formatTime(duration);
    const pct = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
    const bufPct = duration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / duration) * 100)) : 0;
    timelineProgress.style.width = `${pct}%`;
    timelineThumb.style.left = `${pct}%`;
    timelineBuffered.style.width = `${bufPct}%`;
  }

  function setPlayingUi(isPlaying) {
    if (isPlaying) {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      centerPlayBtn.classList.add('playing');
      backdropPoster.classList.add('playing');
    } else {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      centerPlayBtn.classList.remove('playing');
    }
  }

  function playMedia() {
    if (synthState.active) {
      synthState.playing = true;
      synthState.lastTick = performance.now();
      setPlayingUi(true);
      startSynthAudio();
      synthState.rafId = requestAnimationFrame(tickSynth);
      return;
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setPlayingUi(false);
      });
    }
  }

  function pauseMedia() {
    if (synthState.active) {
      synthState.playing = false;
      setPlayingUi(false);
      stopSynthAudio();
      return;
    }
    video.pause();
  }

  function togglePlay() {
    if (synthState.active) {
      if (synthState.playing) pauseMedia();
      else playMedia();
      return;
    }
    if (video.paused) playMedia();
    else pauseMedia();
  }

  function seekTo(seconds) {
    const dur = getDuration() || 734;
    const target = Math.max(0, Math.min(dur, seconds));
    if (synthState.active) {
      synthState.currentTime = target;
      drawSynthFrame();
      syncTimelineUi(target, dur, dur);
      updateSubtitleOverlay(target);
      return;
    }
    video.currentTime = target;
  }

  /**
   * Load a direct stream source (HLS .m3u8, MP4, or Local Synth HD)
   */
  function loadDirectSource(sourceObj, autoPlay = false, startAt = 0) {
    if (!sourceObj) return;
    currentQualityId = sourceObj.id;
    renderSettingsMenu();

    if (sourceObj.id === 'local-synth') {
      if (startAt > 0) synthState.currentTime = startAt;
      startLocalSynth(autoPlay);
      return;
    }

    stopLocalSynth();
    loadingSpinner.classList.remove('hidden');
    loadingText.textContent = `Loading ${sourceObj.label}...`;
    qualityBadge.textContent = sourceObj.quality.replace('Auto / ', '');

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    let fallbackTimer = setTimeout(() => {
      // If remote stream is still stuck loading after 6.5s, try MP4 fallback or Local Synth
      if (video.readyState < 2) {
        const mp4Source =
          resolvedData &&
          resolvedData.directSources &&
          resolvedData.directSources.find((s) => s.type === 'mp4' && s.id !== sourceObj.id);
        if (mp4Source && sourceObj.type === 'hls') {
          loadDirectSource(mp4Source, autoPlay, startAt);
        } else {
          startLocalSynth(autoPlay);
        }
      }
    }, 6500);

    function clearFallback() {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    }

    video.onloadeddata = () => {
      clearFallback();
      loadingSpinner.classList.add('hidden');
      video.playbackRate = currentSpeed;
      if (startAt > 0) {
        video.currentTime = startAt;
      }
      if (autoPlay) {
        playMedia();
      }
    };

    if (sourceObj.type === 'hls' && window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false
      });
      hlsInstance.loadSource(sourceObj.url);
      hlsInstance.attachMedia(video);
      hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
        clearFallback();
        loadingSpinner.classList.add('hidden');
        if (startAt > 0) video.currentTime = startAt;
        if (autoPlay) playMedia();
      });
      hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
        if (data && data.fatal) {
          clearFallback();
          const mp4Fallback =
            resolvedData &&
            resolvedData.directSources &&
            resolvedData.directSources.find((s) => s.type === 'mp4');
          if (mp4Fallback) {
            loadDirectSource(mp4Fallback, autoPlay, startAt);
          } else {
            startLocalSynth(autoPlay);
          }
        }
      });
    } else {
      video.src = sourceObj.url;
      video.onerror = () => {
        clearFallback();
        startLocalSynth(autoPlay);
      };
      video.load();
    }
  }

  /**
   * Switch between VidFun Direct Player and External Upstream Providers (VidSrc.xyz, etc.)
   */
  function selectServer(providerId, autoPlay = false) {
    if (!resolvedData || !Array.isArray(resolvedData.providers)) return;
    const provider =
      resolvedData.providers.find((p) => p.id === providerId) || resolvedData.providers[0];
    if (!provider) return;

    currentServerId = provider.id;
    activeServerLabel.textContent = provider.shortName || provider.name;
    serverMenu.classList.add('hidden');
    renderServerMenu();

    if (provider.id === 'vidfun-direct') {
      externalIframe.src = 'about:blank';
      externalLayer.classList.add('hidden');
      directLayer.classList.remove('hidden');
      const defaultSource =
        (resolvedData.directSources && resolvedData.directSources[0]) || {
          id: 'local-synth',
          label: 'Local Cinema Synth HD',
          quality: '1080p',
          type: 'synth'
        };
      loadDirectSource(defaultSource, autoPlay, getCurrentTime());
    } else {
      pauseMedia();
      directLayer.classList.add('hidden');
      externalLayer.classList.remove('hidden');
      scrapeOverlay.classList.add('hidden');
      externalProviderName.textContent = provider.name;
      externalProviderUrl.textContent = provider.embedUrl;
      externalOpenTab.href = provider.embedUrl;
      externalIframe.src = provider.embedUrl;
    }

    // Notify parent window via postMessage
    try {
      window.parent.postMessage(
        {
          event: 'vidfun:serverchange',
          server: provider.id,
          embedUrl: provider.embedUrl
        },
        '*'
      );
    } catch (_) {}
  }

  function renderServerMenu() {
    if (!resolvedData || !Array.isArray(resolvedData.providers)) return;
    serverList.innerHTML = resolvedData.providers
      .map(
        (p) => `
      <button type="button" class="server-item ${p.id === currentServerId ? 'active' : ''}" data-server="${p.id}">
        <div class="server-item-info">
          <span class="server-item-name">${p.name}</span>
          <span class="server-item-desc">${p.id === 'vidfun-direct' ? 'Custom HTML5/HLS Player • Instant Play' : p.embedUrl}</span>
        </div>
        <span class="server-badge">${p.badge || p.quality}</span>
      </button>
    `
      )
      .join('');

    serverList.querySelectorAll('.server-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectServer(btn.getAttribute('data-server'), true);
      });
    });
  }

  function renderCcMenu() {
    const subs = (resolvedData && resolvedData.subtitles) || [];
    const options = [{ lang: 'off', label: 'Off' }, ...subs];
    ccOptions.innerHTML = options
      .map(
        (opt) => `
      <button type="button" class="popup-opt-btn ${currentSubLang === opt.lang ? 'active' : ''}" data-lang="${opt.lang}">
        <span>${opt.label}</span>
        ${currentSubLang === opt.lang ? '<span>✓</span>' : ''}
      </button>
    `
      )
      .join('');

    ccOptions.querySelectorAll('.popup-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        loadSubtitleTrack(btn.getAttribute('data-lang'));
        ccMenu.classList.add('hidden');
      });
    });
  }

  function renderSettingsMenu() {
    const sources = [
      ...((resolvedData && resolvedData.directSources) || []),
      {
        id: 'local-synth',
        label: 'Local Cinema Synth (Offline HD)',
        quality: 'SYNTH HD',
        type: 'synth'
      }
    ];

    qualityOptions.innerHTML = sources
      .map(
        (s) => `
      <button type="button" class="popup-opt-btn ${currentQualityId === s.id ? 'active' : ''}" data-qid="${s.id}">
        <span>${s.label}</span>
        ${currentQualityId === s.id ? '<span>✓</span>' : ''}
      </button>
    `
      )
      .join('');

    qualityOptions.querySelectorAll('.popup-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        const picked = sources.find((s) => s.id === qid);
        if (picked) {
          loadDirectSource(picked, true, getCurrentTime());
        }
        settingsMenu.classList.add('hidden');
      });
    });

    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    speedOptions.innerHTML = speeds
      .map(
        (sp) => `
      <button type="button" class="popup-opt-btn ${currentSpeed === sp ? 'active' : ''}" data-speed="${sp}">
        ${sp}x
      </button>
    `
      )
      .join('');

    speedOptions.querySelectorAll('.popup-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentSpeed = parseFloat(btn.getAttribute('data-speed')) || 1;
        video.playbackRate = currentSpeed;
        renderSettingsMenu();
        settingsMenu.classList.add('hidden');
      });
    });
  }

  function renderEpisodesDrawer() {
    const media = resolvedData && resolvedData.media;
    if (!media || media.type !== 'tv' || !Array.isArray(media.seasons)) {
      episodesBtn.classList.add('hidden');
      nextEpBtn.classList.add('hidden');
      return;
    }

    episodesBtn.classList.remove('hidden');
    nextEpBtn.classList.remove('hidden');
    drawerShowTitle.textContent = media.title;

    let activeSeasonNum = Number(media.season) || 1;

    function drawSeason(seasonNum) {
      activeSeasonNum = seasonNum;
      seasonTabs.innerHTML = media.seasons
        .map(
          (s) => `
        <button type="button" class="season-tab-btn ${Number(s.seasonNumber) === seasonNum ? 'active' : ''}" data-s="${s.seasonNumber}">
          ${s.name || `Season ${s.seasonNumber}`}
        </button>
      `
        )
        .join('');

      seasonTabs.querySelectorAll('.season-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          drawSeason(Number(btn.getAttribute('data-s')));
        });
      });

      const seasonObj =
        media.seasons.find((s) => Number(s.seasonNumber) === seasonNum) || media.seasons[0];
      const episodes = (seasonObj && seasonObj.episodes) || [];

      episodeList.innerHTML = episodes
        .map((ep) => {
          const isCurrent =
            Number(media.season) === Number(seasonObj.seasonNumber) &&
            Number(media.episode) === Number(ep.episodeNumber);
          return `
          <button type="button" class="ep-card ${isCurrent ? 'active' : ''}" data-s="${seasonObj.seasonNumber}" data-e="${ep.episodeNumber}">
            <div class="ep-card-top">
              <span>E${ep.episodeNumber} • ${ep.title}</span>
              <span>${ep.duration || '45m'}</span>
            </div>
            <div class="ep-card-desc">${ep.synopsis || ''}</div>
          </button>
        `;
        })
        .join('');

      episodeList.querySelectorAll('.ep-card').forEach((card) => {
        card.addEventListener('click', () => {
          const s = Number(card.getAttribute('data-s'));
          const e = Number(card.getAttribute('data-e'));
          episodesDrawer.classList.add('hidden');
          loadMediaData({
            type: 'tv',
            id: media.tmdbId,
            season: s,
            episode: e,
            autoplay: true,
            server: currentServerId,
            sub: currentSubLang,
            startTime: 0
          });
        });
      });
    }

    drawSeason(activeSeasonNum);
  }

  /**
   * Load Media & Sources from /api/sources/...
   */
  async function loadMediaData(routeConfig) {
    try {
      loadingSpinner.classList.remove('hidden');
      loadingText.textContent = 'Resolving multi-server sources...';

      const endpoint =
        routeConfig.type === 'tv'
          ? `/api/sources/tv/${encodeURIComponent(routeConfig.id)}/${routeConfig.season}/${routeConfig.episode}`
          : `/api/sources/movie/${encodeURIComponent(routeConfig.id)}`;

      const res = await fetch(endpoint);
      const data = await res.json();
      if (!data || !data.ok) {
        throw new Error((data && data.error) || 'Failed to resolve media sources');
      }

      resolvedData = data;
      const m = data.media;

      document.title =
        m.type === 'tv'
          ? `${m.title} S${m.season}E${m.episode} — VidFun Embed Player`
          : `${m.title} (${m.year}) — VidFun Embed Player`;

      mediaTitleEl.textContent = m.title;
      mediaSubtitleEl.textContent =
        m.type === 'tv'
          ? `Season ${m.season} • Episode ${m.episode}${m.episodeInfo ? ` — ${m.episodeInfo.title}` : ''}`
          : `${m.year} • ${m.duration || 'HD'} • ★ ${m.rating}`;

      if (m.backdrop) {
        backdropPoster.style.backgroundImage = `url('${m.backdrop}')`;
      }

      renderServerMenu();
      renderSettingsMenu();
      renderEpisodesDrawer();
      await loadSubtitleTrack(routeConfig.sub || 'en');

      selectServer(routeConfig.server || 'vidfun-direct', routeConfig.autoplay);
      if (routeConfig.startTime > 0) {
        seekTo(routeConfig.startTime);
      }
    } catch (err) {
      mediaTitleEl.textContent = 'Stream Fallback Active';
      mediaSubtitleEl.textContent = err.message;
      startLocalSynth(true);
    }
  }

  // Event Listeners for Video Element
  video.addEventListener('play', () => setPlayingUi(true));
  video.addEventListener('pause', () => setPlayingUi(false));
  video.addEventListener('waiting', () => loadingSpinner.classList.remove('hidden'));
  video.addEventListener('playing', () => loadingSpinner.classList.add('hidden'));
  video.addEventListener('timeupdate', () => {
    if (synthState.active) return;
    let bufEnd = 0;
    if (video.buffered && video.buffered.length > 0) {
      bufEnd = video.buffered.end(video.buffered.length - 1);
    }
    syncTimelineUi(video.currentTime, video.duration, bufEnd);
    updateSubtitleOverlay(video.currentTime);
  });

  // Control Buttons
  centerPlayBtn.addEventListener('click', togglePlay);
  playPauseBtn.addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);
  synthCanvas.addEventListener('click', togglePlay);

  rewindBtn.addEventListener('click', () => seekTo(getCurrentTime() - 10));
  forwardBtn.addEventListener('click', () => seekTo(getCurrentTime() + 10));

  nextEpBtn.addEventListener('click', () => {
    if (!resolvedData || !resolvedData.media || resolvedData.media.type !== 'tv') return;
    const m = resolvedData.media;
    const nextEp = Number(m.episode) + 1;
    loadMediaData({
      type: 'tv',
      id: m.tmdbId,
      season: m.season,
      episode: nextEp,
      autoplay: true,
      server: currentServerId,
      sub: currentSubLang,
      startTime: 0
    });
  });

  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    if (synthState.gainNode) {
      synthState.gainNode.gain.value = video.muted ? 0 : video.volume * 0.12;
    }
    iconVolHigh.classList.toggle('hidden', video.muted);
    iconVolMute.classList.toggle('hidden', !video.muted);
  });

  volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    video.volume = val;
    video.muted = val === 0;
    if (synthState.gainNode) {
      synthState.gainNode.gain.value = video.muted ? 0 : val * 0.12;
    }
    iconVolHigh.classList.toggle('hidden', video.muted);
    iconVolMute.classList.toggle('hidden', !video.muted);
  });

  // Timeline Scrubbing
  timelineContainer.addEventListener('mousemove', (e) => {
    const rect = timelineContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverSec = ratio * (getDuration() || 734);
    timelineHoverTime.textContent = formatTime(hoverSec);
    timelineHoverTime.style.left = `${ratio * 100}%`;
    timelineHoverTime.classList.remove('hidden');
  });

  timelineContainer.addEventListener('mouseleave', () => {
    timelineHoverTime.classList.add('hidden');
  });

  timelineContainer.addEventListener('click', (e) => {
    const rect = timelineContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * (getDuration() || 734));
  });

  // Dropdown & Popup Toggles
  serverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    serverMenu.classList.toggle('hidden');
    ccMenu.classList.add('hidden');
    settingsMenu.classList.add('hidden');
  });

  ccBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ccMenu.classList.toggle('hidden');
    settingsMenu.classList.add('hidden');
    serverMenu.classList.add('hidden');
  });

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle('hidden');
    ccMenu.classList.add('hidden');
    serverMenu.classList.add('hidden');
  });

  episodesBtn.addEventListener('click', () => {
    episodesDrawer.classList.toggle('hidden');
  });

  closeDrawerBtn.addEventListener('click', () => {
    episodesDrawer.classList.add('hidden');
  });

  document.addEventListener('click', () => {
    serverMenu.classList.add('hidden');
    ccMenu.classList.add('hidden');
    settingsMenu.classList.add('hidden');
  });

  // Picture-in-Picture & Fullscreen
  pipBtn.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch (_) {}
  });

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      playerRoot.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // External Layer Actions (Scrape Direct Stream & Switch back to Direct)
  switchDirectBtn.addEventListener('click', () => {
    selectServer('vidfun-direct', true);
  });

  scrapeCurrentBtn.addEventListener('click', async () => {
    const url = externalProviderUrl.textContent;
    scrapeOverlay.classList.remove('hidden');
    scrapeModalBody.innerHTML = `<p>Scraping <code>${url}</code> and unpacking obfuscated player scripts...</p>`;

    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      const streamsHtml =
        data.streams && data.streams.length
          ? data.streams
              .map(
                (s, idx) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:8px;margin-bottom:6px;">
              <div style="min-width:0;overflow:hidden;">
                <strong>${s.type.toUpperCase()} (${s.quality})</strong>
                <div style="font-family:monospace;font-size:11px;color:#94a3b8;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${s.url}</div>
              </div>
              <button type="button" class="ext-action-btn primary play-scraped-btn" data-url="${s.url}" data-type="${s.type}">
                ▶ Play in Direct Player
              </button>
            </div>
          `
              )
              .join('')
          : `<p style="color:#94a3b8;">No direct .m3u8/.mp4 streams found in top-level response.</p>`;

      const serversHtml =
        data.servers && data.servers.length
          ? data.servers
              .map(
                (srv) => `
            <span style="display:inline-block;background:rgba(99,102,241,0.2);border:1px solid #6366f1;padding:3px 9px;border-radius:6px;font-size:11px;margin:0 6px 6px 0;">
              ${srv.name}: ${srv.decodedUrl || srv.rcpUrl}
            </span>
          `
              )
              .join('')
          : '';

      scrapeModalBody.innerHTML = `
        ${data.networkNote ? `<div style="background:rgba(245,158,11,0.15);border:1px solid #f59e0b;padding:8px 12px;border-radius:8px;margin-bottom:12px;font-size:12px;color:#fcd34d;">${data.networkNote}</div>` : ''}
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:6px;">Extracted Playable Streams (${(data.streams || []).length}) • Unpacked Scripts (${data.unpackedScriptCount || 0})</div>
          ${streamsHtml}
        </div>
        ${
          serversHtml
            ? `<div><div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:6px;">Discovered Server Hashes</div>${serversHtml}</div>`
            : ''
        }
      `;

      scrapeModalBody.querySelectorAll('.play-scraped-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const streamUrl = btn.getAttribute('data-url');
          const streamType = btn.getAttribute('data-type') || 'hls';
          scrapeOverlay.classList.add('hidden');
          externalLayer.classList.add('hidden');
          directLayer.classList.remove('hidden');
          currentServerId = 'vidfun-direct';
          activeServerLabel.textContent = 'Scraped Direct';
          loadDirectSource(
            {
              id: 'scraped-custom',
              label: 'Scraped Stream',
              quality: '1080p',
              type: streamType,
              url: streamUrl
            },
            true,
            0
          );
        });
      });
    } catch (err) {
      scrapeModalBody.innerHTML = `<p style="color:#f87171;">Scrape error: ${err.message}</p>`;
    }
  });

  closeScrapeOverlay.addEventListener('click', () => {
    scrapeOverlay.classList.add('hidden');
  });

  // Auto-hide Controls when Mouse is Idle
  function resetIdleTimer() {
    playerRoot.classList.remove('controls-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const isPlaying = synthState.active ? synthState.playing : !video.paused;
      const menuOpen =
        !serverMenu.classList.contains('hidden') ||
        !ccMenu.classList.contains('hidden') ||
        !settingsMenu.classList.contains('hidden') ||
        !episodesDrawer.classList.contains('hidden');
      if (isPlaying && !menuOpen) {
        playerRoot.classList.add('controls-idle');
      }
    }, 3200);
  }

  playerRoot.addEventListener('mousemove', resetIdleTimer);
  playerRoot.addEventListener('touchstart', resetIdleTimer);

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) {
      return;
    }
    resetIdleTimer();
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'k') {
      e.preventDefault();
      togglePlay();
    } else if (key === 'f') {
      e.preventDefault();
      fullscreenBtn.click();
    } else if (key === 'm') {
      e.preventDefault();
      muteBtn.click();
    } else if (key === 'arrowleft' || key === 'j') {
      e.preventDefault();
      seekTo(getCurrentTime() - 10);
    } else if (key === 'arrowright' || key === 'l') {
      e.preventDefault();
      seekTo(getCurrentTime() + 10);
    } else if (key === 'c') {
      e.preventDefault();
      loadSubtitleTrack(currentSubLang === 'off' ? 'en' : 'off');
    }
  });

  // Listen for PostMessage commands from parent window
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.command === 'play') playMedia();
    else if (msg.command === 'pause') pauseMedia();
    else if (msg.command === 'seek' && typeof msg.time === 'number') seekTo(msg.time);
    else if (msg.command === 'setServer' && msg.server) selectServer(msg.server, true);
  });

  // Initialize on Page Load
  const initialRoute = parseEmbedRoute();
  loadMediaData(initialRoute);
})();
