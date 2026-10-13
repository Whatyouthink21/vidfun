/**
 * Provider Registry & URL Builders for VidFun, VidSrc equivalents, and Custom Providers
 */
const { getCustomProviders } = require('../data/customStore');

const BUILTIN_PROVIDERS = [
  {
    id: 'vidfun-direct',
    name: 'VidFun Direct (Native HLS/MP4)',
    shortName: 'VidFun Direct',
    badge: 'DIRECT HD • NO ADS',
    quality: '1080p / HLS',
    mode: 'direct',
    description: 'Built-in custom HTML5 + HLS.js player with multi-quality streams, WebVTT subtitles, PiP, and instant playback.',
    movieTemplate: '/embed/movie/{id}?mode=direct',
    tvTemplate: '/embed/tv/{id}/{s}/{e}?mode=direct'
  },
  {
    id: 'vidsrc-xyz',
    name: 'VidSrc XYZ (vidsrc.xyz)',
    shortName: 'VidSrc.xyz',
    badge: 'VIDSRC',
    quality: '1080p',
    mode: 'hybrid',
    domains: ['https://vidsrc.xyz', 'https://vidsrc.in', 'https://vidsrc.pm', 'https://vidsrc.net'],
    description: 'Primary VidSrc embed & RCP/ProRCP scraper provider supporting TMDB & IMDb IDs.',
    movieTemplate: 'https://vidsrc.xyz/embed/movie/{id}',
    tvTemplate: 'https://vidsrc.xyz/embed/tv/{id}/{s}-{e}'
  },
  {
    id: 'vidsrc-icu',
    name: 'VidSrc ICU (vidsrc.icu)',
    shortName: 'VidSrc.icu',
    badge: 'VIDSRC ICU',
    quality: '1080p',
    mode: 'hybrid',
    domains: ['https://vidsrc.icu'],
    description: 'Fast multi-audio VidSrc ICU embed server with automatic mirror switching.',
    movieTemplate: 'https://vidsrc.icu/embed/movie/{id}',
    tvTemplate: 'https://vidsrc.icu/embed/tv/{id}/{s}/{e}'
  },
  {
    id: 'vidsrc-cc',
    name: 'VidSrc CC v2 (vidsrc.cc)',
    shortName: 'VidSrc.cc',
    badge: 'VIDSRC V2',
    quality: '1080p',
    mode: 'hybrid',
    domains: ['https://vidsrc.cc'],
    description: 'VidSrc v2 embed player with high-bitrate HLS streams and subtitle tracks.',
    movieTemplate: 'https://vidsrc.cc/v2/embed/movie/{id}',
    tvTemplate: 'https://vidsrc.cc/v2/embed/tv/{id}/{s}/{e}'
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc TO (vidsrc.to)',
    shortName: 'VidSrc.to',
    badge: 'VIDSRC TO',
    quality: '1080p',
    mode: 'hybrid',
    domains: ['https://vidsrc.to', 'https://vidsrc.me'],
    description: 'Classic VidSrc.to / VidSrc.me multi-server aggregator (Vidplay, Filemoon, Streamwish).',
    movieTemplate: 'https://vidsrc.to/embed/movie/{id}',
    tvTemplate: 'https://vidsrc.to/embed/tv/{id}/{s}/{e}'
  },
  {
    id: 'multiembed',
    name: 'SuperEmbed (multiembed.mov)',
    shortName: 'SuperEmbed',
    badge: 'MULTI',
    quality: '1080p',
    mode: 'hybrid',
    domains: ['https://multiembed.mov', 'https://streamingnow.mov'],
    description: 'SuperEmbed / MultiEmbed aggregator with VIP HLS servers and TMDB/IMDb lookup.',
    movieTemplate: 'https://multiembed.mov/?video_id={id}&tmdb=1',
    tvTemplate: 'https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}'
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed (autoembed.cc)',
    shortName: 'AutoEmbed',
    badge: 'AUTO',
    quality: '1080p',
    mode: 'hybrid',
    domains: ['https://player.autoembed.cc'],
    description: 'AutoEmbed multi-source player with automatic fallback across 6+ stream hosts.',
    movieTemplate: 'https://player.autoembed.cc/embed/movie/{id}',
    tvTemplate: 'https://player.autoembed.cc/embed/tv/{id}/{s}/{e}'
  },
  {
    id: '2embed',
    name: '2Embed (2embed.cc)',
    shortName: '2Embed',
    badge: '2EMBED',
    quality: 'HD',
    mode: 'hybrid',
    domains: ['https://www.2embed.cc', 'https://2embed.org'],
    description: '2Embed movie and TV episode embed API supporting both TMDB and IMDb identifiers.',
    movieTemplate: 'https://www.2embed.cc/embed/{id}',
    tvTemplate: 'https://www.2embed.cc/embedtv/{id}&s={s}&e={e}'
  }
];

function getAllProviders() {
  const custom = getCustomProviders();
  return [...BUILTIN_PROVIDERS, ...custom];
}

function formatProviderUrl(template, { id, tmdbId, imdbId, season = 1, episode = 1 }) {
  const effectiveId = tmdbId || id || imdbId;
  let url = String(template || '')
    .replace(/\{id\}/g, encodeURIComponent(effectiveId))
    .replace(/\{tmdbId\}/g, encodeURIComponent(tmdbId || effectiveId))
    .replace(/\{imdbId\}/g, encodeURIComponent(imdbId || effectiveId))
    .replace(/\{s\}/g, encodeURIComponent(season))
    .replace(/\{season\}/g, encodeURIComponent(season))
    .replace(/\{e\}/g, encodeURIComponent(episode))
    .replace(/\{episode\}/g, encodeURIComponent(episode));

  // If the ID is an IMDb ID (starts with tt) and using multiembed, omit &tmdb=1
  if (/^tt\d+/i.test(effectiveId) && url.includes('multiembed.mov')) {
    url = url.replace('&tmdb=1', '');
  }
  return url;
}

function buildProviderTargets({ type = 'movie', id, tmdbId, imdbId, season = 1, episode = 1 }) {
  const isTv = type === 'tv' || type === 'series';
  return getAllProviders().map((provider) => {
    const template = isTv ? provider.tvTemplate : provider.movieTemplate;
    const targetUrl = formatProviderUrl(template, { id, tmdbId, imdbId, season, episode });
    return {
      id: provider.id,
      name: provider.name,
      shortName: provider.shortName || provider.name,
      badge: provider.badge || 'SERVER',
      quality: provider.quality || '1080p',
      mode: provider.mode || 'hybrid',
      description: provider.description || '',
      embedUrl: targetUrl
    };
  });
}

module.exports = {
  BUILTIN_PROVIDERS,
  getAllProviders,
  formatProviderUrl,
  buildProviderTargets
};
