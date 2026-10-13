/**
 * Runtime & Persistent Custom Store
 * Stores user-added movies, TV shows, custom stream URLs, and custom scraper providers.
 */
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'custom_data.json');

const defaultData = {
  customMedia: [],
  customProviders: [],
  settings: {
    defaultServer: 'vidfun-direct',
    defaultThemeColor: '#e50914',
    autoplay: false,
    enableProxy: true,
    tmdbApiKey: process.env.TMDB_API_KEY || ''
  }
};

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        customMedia: Array.isArray(parsed.customMedia) ? parsed.customMedia : [],
        customProviders: Array.isArray(parsed.customProviders) ? parsed.customProviders : [],
        settings: { ...defaultData.settings, ...(parsed.settings || {}) }
      };
    }
  } catch (err) {
    // Fallback to default in-memory state
  }
  return JSON.parse(JSON.stringify(defaultData));
}

let state = loadStore();

function saveStore() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    // Ignore write errors on read-only filesystems
  }
}

function getCustomMedia() {
  return state.customMedia;
}

function addCustomMedia(item) {
  const id = String(item.id || item.tmdbId || Date.now());
  const type = item.type === 'tv' ? 'tv' : 'movie';
  const streamUrl = item.streamUrl || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const isHls = streamUrl.includes('.m3u8');

  const newEntry = {
    id,
    tmdbId: String(item.tmdbId || id),
    imdbId: item.imdbId || `tt${id.padStart(7, '0')}`,
    type,
    title: item.title || `Custom ${type.toUpperCase()} #${id}`,
    year: Number(item.year) || new Date().getFullYear(),
    duration: item.duration || (type === 'tv' ? '45m' : '2h 05m'),
    rating: String(item.rating || '8.5'),
    ageRating: item.ageRating || 'PG-13',
    genres: Array.isArray(item.genres)
      ? item.genres
      : String(item.genres || 'Custom, Sci-Fi')
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean),
    director: item.director || 'Custom Source',
    cast: Array.isArray(item.cast) ? item.cast : ['Custom Cast'],
    synopsis: item.synopsis || 'Custom user-added stream in VidFun.',
    featured: Boolean(item.featured),
    trending: true,
    accent1: item.accent1 || '#e50914',
    accent2: item.accent2 || '#6366f1',
    accent3: '#090d16',
    customEmbedUrl: item.customEmbedUrl || '',
    streams: {
      hls: isHls ? streamUrl : 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      mp4_1080: !isHls ? streamUrl : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      mp4_720: !isHls ? streamUrl : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      mp4_480: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
    },
    seasons:
      type === 'tv'
        ? item.seasons || [
            {
              seasonNumber: 1,
              name: 'Season 1',
              episodes: [
                {
                  episodeNumber: 1,
                  title: 'Episode 1',
                  duration: '45m',
                  synopsis: 'Episode 1 stream',
                  streams: {
                    hls: isHls ? streamUrl : 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                    mp4_1080: !isHls ? streamUrl : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
                    mp4_720: !isHls ? streamUrl : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
                    mp4_480: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                  }
                }
              ]
            }
          ]
        : undefined
  };

  state.customMedia = [
    newEntry,
    ...state.customMedia.filter((m) => !(m.id === id && m.type === type))
  ];
  saveStore();
  return newEntry;
}

function removeCustomMedia(id) {
  const before = state.customMedia.length;
  state.customMedia = state.customMedia.filter((m) => String(m.id) !== String(id));
  saveStore();
  return state.customMedia.length < before;
}

function getCustomProviders() {
  return state.customProviders;
}

function addCustomProvider(provider) {
  const id =
    provider.id ||
    String(provider.name || 'custom-provider')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
  const entry = {
    id,
    name: provider.name || 'Custom Provider',
    badge: provider.badge || 'CUSTOM',
    quality: provider.quality || '1080p',
    movieTemplate: provider.movieTemplate || 'https://vidsrc.xyz/embed/movie/{id}',
    tvTemplate: provider.tvTemplate || 'https://vidsrc.xyz/embed/tv/{id}/{s}-{e}',
    mode: provider.mode || 'iframe',
    enabled: provider.enabled !== false
  };
  state.customProviders = [
    entry,
    ...state.customProviders.filter((p) => p.id !== id)
  ];
  saveStore();
  return entry;
}

function getSettings() {
  return state.settings;
}

function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  saveStore();
  return state.settings;
}

module.exports = {
  getCustomMedia,
  addCustomMedia,
  removeCustomMedia,
  getCustomProviders,
  addCustomProvider,
  getSettings,
  updateSettings
};
