/**
 * VidFun Main Platform Frontend Controller
 * Handles Catalog browsing, Theater Watch Player, Embed API Builder,
 * Scraper & JS Packer Unpacker Studio, and Custom Media/Provider management.
 */
(function () {
  // Navigation & Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabSections = document.querySelectorAll('.tab-section');
  const brandHome = document.getElementById('brand-home');
  const globalSearchInput = document.getElementById('global-search-input');
  const quickIdPlayBtn = document.getElementById('quick-id-play-btn');

  // Catalog Elements
  const heroBackdrop = document.getElementById('hero-backdrop');
  const heroMetaBadge = document.getElementById('hero-meta-badge');
  const heroTitle = document.getElementById('hero-title');
  const heroSynopsis = document.getElementById('hero-synopsis');
  const heroWatchBtn = document.getElementById('hero-watch-btn');
  const heroEmbedBtn = document.getElementById('hero-embed-btn');
  const heroDirectEmbedLink = document.getElementById('hero-direct-embed-link');
  const filterPills = document.querySelectorAll('.filter-pill');
  const genreFilter = document.getElementById('genre-filter');
  const catalogGrid = document.getElementById('catalog-grid');

  // Theater Elements
  const theaterIframe = document.getElementById('theater-iframe');
  const theaterServerPills = document.getElementById('theater-server-pills');
  const theaterStandaloneLink = document.getElementById('theater-standalone-link');
  const theaterCopyIframeBtn = document.getElementById('theater-copy-iframe-btn');
  const copyToast = document.getElementById('copy-toast');
  const theaterTypeBadge = document.getElementById('theater-type-badge');
  const theaterIdsBadge = document.getElementById('theater-ids-badge');
  const theaterTitle = document.getElementById('theater-title');
  const theaterSubmeta = document.getElementById('theater-submeta');
  const theaterSynopsis = document.getElementById('theater-synopsis');
  const theaterIframeCode = document.getElementById('theater-iframe-code');
  const theaterTvPanel = document.getElementById('theater-tv-panel');
  const theaterSeasonSelect = document.getElementById('theater-season-select');
  const theaterEpisodeList = document.getElementById('theater-episode-list');
  const theaterDirectStreams = document.getElementById('theater-direct-streams');

  // Playground Elements
  const pgType = document.getElementById('pg-type');
  const pgId = document.getElementById('pg-id');
  const pgTvFields = document.getElementById('pg-tv-fields');
  const pgSeason = document.getElementById('pg-season');
  const pgEpisode = document.getElementById('pg-episode');
  const pgServer = document.getElementById('pg-server');
  const pgColor = document.getElementById('pg-color');
  const pgSub = document.getElementById('pg-sub');
  const pgAutoplay = document.getElementById('pg-autoplay');
  const pgApplyBtn = document.getElementById('pg-apply-btn');
  const pgPreviewIframe = document.getElementById('pg-preview-iframe');
  const pgCodeOutput = document.getElementById('pg-code-output');
  const pgCopyBtn = document.getElementById('pg-copy-btn');
  const pgJsonOutput = document.getElementById('pg-json-output');

  // Scraper Elements
  const scrapeUrlInput = document.getElementById('scrape-url-input');
  const scrapeRawHtml = document.getElementById('scrape-raw-html');
  const loadSampleScrapeBtn = document.getElementById('load-sample-scrape-btn');
  const runScrapeBtn = document.getElementById('run-scrape-btn');
  const clearScrapeHtmlBtn = document.getElementById('clear-scrape-html-btn');
  const scrapeResultsContainer = document.getElementById('scrape-results-container');

  // Custom Sources Elements
  const customMediaForm = document.getElementById('custom-media-form');
  const customProviderForm = document.getElementById('custom-provider-form');
  const providersRegistryList = document.getElementById('providers-registry-list');

  // State
  let catalogItems = [];
  let activeTypeFilter = 'all';
  let activeGenreFilter = 'all';
  let activeSearchQuery = '';
  let featuredHeroItem = null;
  let currentTheaterState = {
    type: 'movie',
    id: '693134',
    season: 1,
    episode: 1,
    server: 'vidfun-direct'
  };

  function switchTab(tabName) {
    navTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    tabSections.forEach((sec) => {
      sec.classList.toggle('active', sec.id === `tab-${tabName}`);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  brandHome.addEventListener('click', () => switchTab('catalog'));

  /**
   * Load Catalog from /api/catalog
   */
  async function fetchCatalog() {
    try {
      const res = await fetch('/api/catalog');
      const data = await res.json();
      if (!data.ok) return;

      catalogItems = data.items || [];

      // Populate Genre Filter
      const genres = data.genres || [];
      genreFilter.innerHTML =
        `<option value="all">All Genres</option>` +
        genres.map((g) => `<option value="${g}">${g}</option>`).join('');

      // Set Hero Item
      featuredHeroItem = catalogItems.find((i) => i.featured) || catalogItems[0];
      if (featuredHeroItem) {
        updateHeroBanner(featuredHeroItem);
      }

      renderCatalogGrid();
    } catch (err) {
      catalogGrid.innerHTML = `<p>Error loading catalog: ${err.message}</p>`;
    }
  }

  function updateHeroBanner(item) {
    heroBackdrop.style.backgroundImage = `url('${item.backdrop}')`;
    heroMetaBadge.textContent = `${item.year} • ${(item.genres || []).join(', ').toUpperCase()} • ★ ${item.rating}`;
    heroTitle.textContent = item.title;
    heroSynopsis.textContent = item.synopsis;
    heroDirectEmbedLink.href = item.embedUrl;

    heroWatchBtn.onclick = () => {
      openInTheater({
        type: item.type,
        id: item.tmdbId,
        season: 1,
        episode: 1
      });
    };

    heroEmbedBtn.onclick = () => {
      pgType.value = item.type;
      pgId.value = item.tmdbId;
      pgTvFields.classList.toggle('hidden', item.type !== 'tv');
      updatePlayground();
      switchTab('playground');
    };
  }

  function renderCatalogGrid() {
    let filtered = [...catalogItems];

    if (activeTypeFilter !== 'all') {
      filtered = filtered.filter((i) => i.type === activeTypeFilter);
    }
    if (activeGenreFilter !== 'all') {
      filtered = filtered.filter(
        (i) =>
          Array.isArray(i.genres) &&
          i.genres.some((g) => g.toLowerCase() === activeGenreFilter.toLowerCase())
      );
    }
    if (activeSearchQuery) {
      const q = activeSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          String(i.tmdbId).toLowerCase().includes(q) ||
          String(i.imdbId).toLowerCase().includes(q) ||
          (Array.isArray(i.genres) && i.genres.some((g) => g.toLowerCase().includes(q)))
      );
    }

    if (filtered.length === 0 && activeSearchQuery) {
      // Allow dynamic resolution of any arbitrary TMDB or IMDb ID
      const qTrim = activeSearchQuery.trim();
      catalogGrid.innerHTML = `
        <div class="card-panel" style="grid-column: 1 / -1; text-align:center;">
          <h3>Instant Dynamic Stream Resolution for ID "${qTrim}"</h3>
          <p style="color:#94a3b8;margin-bottom:14px;">
            Even if an ID isn't in the local preset list, VidFun dynamically resolves any TMDB or IMDb ID across all servers!
          </p>
          <div style="display:flex;justify-content:center;gap:12px;">
            <button type="button" class="btn-primary dyn-play-btn" data-type="movie" data-id="${qTrim}">
              ▶ Play as Movie (#${qTrim})
            </button>
            <button type="button" class="btn-secondary dyn-play-btn" data-type="tv" data-id="${qTrim}">
              📺 Play as TV Show S1E1 (#${qTrim})
            </button>
          </div>
        </div>
      `;
      catalogGrid.querySelectorAll('.dyn-play-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          openInTheater({
            type: btn.getAttribute('data-type'),
            id: btn.getAttribute('data-id'),
            season: 1,
            episode: 1
          });
        });
      });
      return;
    }

    catalogGrid.innerHTML = filtered
      .map(
        (item) => `
      <article class="media-card" data-type="${item.type}" data-id="${item.tmdbId}">
        <div class="poster-wrap">
          <img src="${item.poster}" alt="${item.title}" loading="lazy" />
          <div class="poster-overlay">
            <div class="play-circle">▶</div>
          </div>
        </div>
        <div class="card-body">
          <div class="card-title" title="${item.title}">${item.title}</div>
          <div class="card-meta">
            <span>${item.type === 'tv' ? 'TV Series' : 'Movie'} • ${item.year}</span>
            <span style="color:#fbbf24;font-weight:700;">★ ${item.rating}</span>
          </div>
        </div>
      </article>
    `
      )
      .join('');

    catalogGrid.querySelectorAll('.media-card').forEach((card) => {
      card.addEventListener('click', () => {
        openInTheater({
          type: card.getAttribute('data-type'),
          id: card.getAttribute('data-id'),
          season: 1,
          episode: 1
        });
      });
    });
  }

  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      activeTypeFilter = pill.getAttribute('data-type');
      renderCatalogGrid();
    });
  });

  genreFilter.addEventListener('change', () => {
    activeGenreFilter = genreFilter.value;
    renderCatalogGrid();
  });

  globalSearchInput.addEventListener('input', () => {
    activeSearchQuery = globalSearchInput.value.trim();
    switchTab('catalog');
    renderCatalogGrid();
  });

  quickIdPlayBtn.addEventListener('click', () => {
    const val = globalSearchInput.value.trim() || '693134';
    openInTheater({ type: 'movie', id: val, season: 1, episode: 1 });
  });

  /**
   * Open Media Item in the Theater Watch Player Tab
   */
  async function openInTheater({ type = 'movie', id = '693134', season = 1, episode = 1, server = 'vidfun-direct' }) {
    currentTheaterState = { type, id, season, episode, server };
    switchTab('theater');

    const embedPath =
      type === 'tv'
        ? `/embed/tv/${encodeURIComponent(id)}/${season}/${episode}?server=${encodeURIComponent(server)}&autoplay=1`
        : `/embed/movie/${encodeURIComponent(id)}?server=${encodeURIComponent(server)}&autoplay=1`;

    theaterIframe.src = embedPath;
    theaterStandaloneLink.href = embedPath;

    const fullEmbedUrl = `${window.location.origin}${
      type === 'tv' ? `/embed/tv/${id}/${season}/${episode}` : `/embed/movie/${id}`
    }`;
    const iframeSnippet = `<iframe src="${fullEmbedUrl}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
    theaterIframeCode.textContent = iframeSnippet;

    // Fetch resolved sources for metadata, server pills, TV episodes, and direct stream URLs
    const apiEndpoint =
      type === 'tv'
        ? `/api/sources/tv/${encodeURIComponent(id)}/${season}/${episode}`
        : `/api/sources/movie/${encodeURIComponent(id)}`;

    try {
      const res = await fetch(apiEndpoint);
      const data = await res.json();
      if (!data.ok) return;

      const m = data.media;
      theaterTypeBadge.textContent = m.type === 'tv' ? `TV SERIES • S${m.season}E${m.episode}` : 'MOVIE';
      theaterIdsBadge.textContent = `TMDB #${m.tmdbId} • ${m.imdbId}`;
      theaterTitle.textContent =
        m.type === 'tv' && m.episodeInfo
          ? `${m.title} — S${m.season}E${m.episode}: ${m.episodeInfo.title}`
          : m.title;
      theaterSubmeta.textContent = `${m.year} • ${m.duration || 'HD'} • ${(m.genres || []).join(', ')} • ★ ${m.rating}`;
      theaterSynopsis.textContent =
        (m.episodeInfo && m.episodeInfo.synopsis) || m.synopsis || '';

      // Render Server Switcher Pills
      theaterServerPills.innerHTML = (data.providers || [])
        .map(
          (p) => `
        <button type="button" class="srv-pill ${p.id === server ? 'active' : ''}" data-srv="${p.id}">
          ${p.shortName || p.name}
        </button>
      `
        )
        .join('');

      theaterServerPills.querySelectorAll('.srv-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          const srv = btn.getAttribute('data-srv');
          currentTheaterState.server = srv;
          theaterServerPills.querySelectorAll('.srv-pill').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          // Send PostMessage to iframe player to switch server without full page reload
          if (theaterIframe.contentWindow) {
            theaterIframe.contentWindow.postMessage({ command: 'setServer', server: srv }, '*');
          }
        });
      });

      // Render Direct Stream Sources Sidebar
      theaterDirectStreams.innerHTML = (data.directSources || [])
        .map(
          (ds) => `
        <div class="stream-row-card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${ds.label}</strong>
            <span class="pill-glass">${ds.type.toUpperCase()}</span>
          </div>
          <code>${ds.url}</code>
        </div>
      `
        )
        .join('');

      // Render TV Seasons & Episodes Sidebar if TV Show
      if (m.type === 'tv' && Array.isArray(m.seasons)) {
        theaterTvPanel.classList.remove('hidden');
        theaterSeasonSelect.innerHTML = m.seasons
          .map(
            (s) =>
              `<option value="${s.seasonNumber}" ${Number(s.seasonNumber) === Number(m.season) ? 'selected' : ''}>${s.name || `Season ${s.seasonNumber}`}</option>`
          )
          .join('');

        const renderSeasonEps = (seasonNum) => {
          const sObj =
            m.seasons.find((s) => Number(s.seasonNumber) === Number(seasonNum)) || m.seasons[0];
          const eps = (sObj && sObj.episodes) || [];
          theaterEpisodeList.innerHTML = eps
            .map(
              (ep) => `
            <button type="button" class="sidebar-ep-item ${Number(m.season) === Number(sObj.seasonNumber) && Number(m.episode) === Number(ep.episodeNumber) ? 'active' : ''}" data-s="${sObj.seasonNumber}" data-e="${ep.episodeNumber}">
              <div style="font-weight:700;font-size:13px;">E${ep.episodeNumber} • ${ep.title}</div>
              <div style="font-size:11.5px;color:#94a3b8;">${ep.duration || '45m'}</div>
            </button>
          `
            )
            .join('');

          theaterEpisodeList.querySelectorAll('.sidebar-ep-item').forEach((btn) => {
            btn.addEventListener('click', () => {
              openInTheater({
                type: 'tv',
                id: m.tmdbId,
                season: Number(btn.getAttribute('data-s')),
                episode: Number(btn.getAttribute('data-e')),
                server: currentTheaterState.server
              });
            });
          });
        };

        renderSeasonEps(m.season);
        theaterSeasonSelect.onchange = () => renderSeasonEps(Number(theaterSeasonSelect.value));
      } else {
        theaterTvPanel.classList.add('hidden');
      }
    } catch (_) {}
  }

  theaterCopyIframeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(theaterIframeCode.textContent || '').catch(() => {});
    copyToast.classList.remove('hidden');
    setTimeout(() => copyToast.classList.add('hidden'), 2000);
  });

  /**
   * TAB 3: Embed & Player API Playground
   */
  pgType.addEventListener('change', () => {
    pgTvFields.classList.toggle('hidden', pgType.value !== 'tv');
  });

  document.querySelectorAll('.pg-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      pgType.value = btn.getAttribute('data-type');
      pgId.value = btn.getAttribute('data-id');
      if (btn.getAttribute('data-s')) pgSeason.value = btn.getAttribute('data-s');
      if (btn.getAttribute('data-e')) pgEpisode.value = btn.getAttribute('data-e');
      pgTvFields.classList.toggle('hidden', pgType.value !== 'tv');
      updatePlayground();
    });
  });

  async function updatePlayground() {
    const type = pgType.value;
    const id = pgId.value.trim() || '693134';
    const s = pgSeason.value || 1;
    const e = pgEpisode.value || 1;
    const server = pgServer.value;
    const color = pgColor.value.trim().replace(/^#/, '');
    const sub = pgSub.value;
    const autoplay = pgAutoplay.checked;

    const query = new URLSearchParams();
    if (server && server !== 'vidfun-direct') query.set('server', server);
    if (color && color !== 'e50914') query.set('color', color);
    if (sub && sub !== 'en') query.set('sub', sub);
    if (autoplay) query.set('autoplay', '1');

    const qs = query.toString() ? `?${query.toString()}` : '';
    const relEmbedUrl =
      type === 'tv' ? `/embed/tv/${id}/${s}/${e}${qs}` : `/embed/movie/${id}${qs}`;
    const absEmbedUrl = `${window.location.origin}${relEmbedUrl}`;

    pgPreviewIframe.src = relEmbedUrl;
    pgCodeOutput.textContent = `<!-- VidFun Responsive Embed Player -->\n<iframe\n  src="${absEmbedUrl}"\n  width="100%"\n  height="100%"\n  frameborder="0"\n  allowfullscreen\n  allow="autoplay; encrypted-media; picture-in-picture"\n></iframe>\n\n# Direct Sources API Endpoint:\ncurl "${window.location.origin}/api/sources/${type === 'tv' ? `tv/${id}/${s}/${e}` : `movie/${id}`}"`;

    try {
      const apiRes = await fetch(
        type === 'tv' ? `/api/sources/tv/${id}/${s}/${e}` : `/api/sources/movie/${id}`
      );
      const json = await apiRes.json();
      pgJsonOutput.textContent = JSON.stringify(json, null, 2);
    } catch (err) {
      pgJsonOutput.textContent = `Error fetching API JSON: ${err.message}`;
    }
  }

  pgApplyBtn.addEventListener('click', updatePlayground);
  pgCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(pgCodeOutput.textContent || '').catch(() => {});
    pgCopyBtn.textContent = 'Copied!';
    setTimeout(() => (pgCopyBtn.textContent = 'Copy Snippet'), 1800);
  });

  /**
   * TAB 4: Scraper & JS Unpacker Studio
   */
  document.querySelectorAll('.scrape-url-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      scrapeUrlInput.value = btn.getAttribute('data-url');
      scrapeRawHtml.value = '';
      runScraperStudio(false);
    });
  });

  loadSampleScrapeBtn.addEventListener('click', async () => {
    const res = await fetch('/api/scrape?sample=1');
    const data = await res.json();
    if (data.sampleHtml) {
      scrapeRawHtml.value = data.sampleHtml;
    }
    renderScrapeStudioOutput(data);
  });

  clearScrapeHtmlBtn.addEventListener('click', () => {
    scrapeRawHtml.value = '';
  });

  runScrapeBtn.addEventListener('click', () => runScraperStudio(false));

  async function runScraperStudio(useSample = false) {
    scrapeResultsContainer.innerHTML = `<p>Running VidSrc &amp; P.A.C.K.E.R. stream extractor...</p>`;
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: scrapeUrlInput.value.trim(),
          rawHtml: scrapeRawHtml.value.trim() || undefined,
          sample: useSample
        })
      });
      const data = await res.json();
      renderScrapeStudioOutput(data);
    } catch (err) {
      scrapeResultsContainer.innerHTML = `<p style="color:#f87171;">Scraper Error: ${err.message}</p>`;
    }
  }

  function renderScrapeStudioOutput(data) {
    if (!data || !data.ok) {
      scrapeResultsContainer.innerHTML = `<p style="color:#f87171;">${(data && data.error) || 'Scrape failed'}</p>`;
      return;
    }

    const streamsHtml =
      data.streams && data.streams.length
        ? data.streams
            .map(
              (s) => `
          <div class="stream-row-card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="min-width:0;flex:1;">
              <strong>${s.type.toUpperCase()} • ${s.quality}</strong>
              <code>${s.url}</code>
            </div>
            <button type="button" class="btn-primary btn-sm play-extracted-in-theater" data-url="${s.url}">
              ▶ Play Stream
            </button>
          </div>
        `
            )
            .join('')
        : `<p style="color:#94a3b8;font-size:13px;">No direct .m3u8/.mp4 streams found.</p>`;

    const serversHtml =
      data.servers && data.servers.length
        ? data.servers
            .map(
              (srv) => `
          <div class="stream-row-card">
            <strong>${srv.name}</strong>
            <code>Decoded: ${srv.decodedUrl || srv.rcpUrl}</code>
          </div>
        `
            )
            .join('')
        : `<p style="color:#94a3b8;font-size:13px;">No server hash nodes found.</p>`;

    const unpackedHtml =
      data.unpackedPreview && data.unpackedPreview.length
        ? `<pre class="code-pre" style="margin-top:6px;">${data.unpackedPreview.join('\n\n')}</pre>`
        : `<p style="color:#94a3b8;font-size:13px;">No packed eval(function(p,a,c,k,e,d)...) blocks detected.</p>`;

    scrapeResultsContainer.innerHTML = `
      ${
        data.networkNote
          ? `<div style="background:rgba(245,158,11,0.14);border:1px solid #f59e0b;padding:10px 12px;border-radius:9px;margin-bottom:14px;font-size:12.5px;color:#fcd34d;">${data.networkNote}</div>`
          : ''
      }
      <div style="margin-bottom:14px;">
        <h4 style="font-size:13px;color:#cbd5e1;margin-bottom:6px;">Extracted Direct Streams (${(data.streams || []).length})</h4>
        <div class="direct-streams-list">${streamsHtml}</div>
      </div>
      <div style="margin-bottom:14px;">
        <h4 style="font-size:13px;color:#cbd5e1;margin-bottom:6px;">Discovered Server Hash Nodes (${(data.servers || []).length})</h4>
        <div class="direct-streams-list">${serversHtml}</div>
      </div>
      <div>
        <h4 style="font-size:13px;color:#cbd5e1;margin-bottom:6px;">Unpacked P.A.C.K.E.R. Scripts (${data.unpackedScriptCount || 0})</h4>
        ${unpackedHtml}
      </div>
    `;

    scrapeResultsContainer.querySelectorAll('.play-extracted-in-theater').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const streamUrl = btn.getAttribute('data-url');
        // Save temporary custom stream and open in theater
        const res = await fetch('/api/custom/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `scraped-${Date.now()}`,
            title: data.title || 'Scraped Direct Stream',
            type: 'movie',
            streamUrl
          })
        });
        const created = await res.json();
        if (created && created.item) {
          await fetchCatalog();
          openInTheater({ type: 'movie', id: created.item.tmdbId });
        }
      });
    });
  }

  /**
   * TAB 5: Custom Media & Providers Manager
   */
  async function loadProvidersRegistry() {
    try {
      const res = await fetch('/api/providers');
      const data = await res.json();
      if (!data.ok) return;

      providersRegistryList.innerHTML = (data.providers || [])
        .map(
          (p) => `
        <div class="provider-reg-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong>${p.name}</strong>
            <span class="pill-glass">${p.badge || p.quality}</span>
          </div>
          <div style="font-family:monospace;font-size:11px;color:#94a3b8;">Movie: ${p.movieTemplate}</div>
          <div style="font-family:monospace;font-size:11px;color:#94a3b8;">TV: ${p.tvTemplate}</div>
        </div>
      `
        )
        .join('');
    } catch (_) {}
  }

  customMediaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('cm-title').value.trim(),
      type: document.getElementById('cm-type').value,
      tmdbId: document.getElementById('cm-tmdb').value.trim() || String(Date.now()).slice(-6),
      year: Number(document.getElementById('cm-year').value) || 2025,
      streamUrl: document.getElementById('cm-stream').value.trim(),
      customEmbedUrl: document.getElementById('cm-embed').value.trim(),
      synopsis: document.getElementById('cm-synopsis').value.trim()
    };

    const res = await fetch('/api/custom/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok && data.item) {
      await fetchCatalog();
      openInTheater({
        type: data.item.type,
        id: data.item.tmdbId,
        season: 1,
        episode: 1
      });
    }
  });

  customProviderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('cp-name').value.trim(),
      badge: document.getElementById('cp-badge').value.trim() || 'CUSTOM',
      movieTemplate: document.getElementById('cp-movie-tpl').value.trim(),
      tvTemplate: document.getElementById('cp-tv-tpl').value.trim()
    };

    const res = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      await loadProvidersRegistry();
      customProviderForm.reset();
    }
  });

  // Initial Boot
  fetchCatalog();
  openInTheater({ type: 'movie', id: '693134', season: 1, episode: 1 });
  switchTab('catalog');
  updatePlayground();
  runScraperStudio(true);
  loadProvidersRegistry();
})();
