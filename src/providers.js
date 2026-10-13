/**
 * Provider registry — the single place to edit when a domain rotates.
 *
 * Researched 2026-07 (see README "Provider research"):
 *  - VidLink   https://vidlink.pro/movie/{tmdb} · /tv/{tmdb}/{s}/{e}   (TMDB only, documented params)
 *  - Videasy   https://player.videasy.net/movie/{tmdb} · /tv/{tmdb}/{s}/{e}
 *  - VidFast   https://vidfast.pro/movie/{tmdb} · /tv/{tmdb}/{s}/{e}
 *  - VidSrc.cc https://vidsrc.cc/v2/embed/movie/{id} · /v2/embed/tv/{id}/{s}/{e}
 *  - VidSrc    https://vidsrc.xyz/embed/movie/{id} · /embed/tv/{id}/{s}-{e}  (+ .in/.pm/.net mirrors, RCP chain)
 *  - VidSrcMe  https://vidsrcme.ru/embed/movie/{id} · /embed/tv/{id}/{s}/{e} (vsembed backend, RCP chain)
 *  - VidCore   https://vidcore.org/embed/movie/{tmdb} · /embed/tv/{tmdb}/{s}/{e}
 *  - AutoEmbed https://player.autoembed.cc/embed/movie/{tmdb} · /embed/tv/{tmdb}/{s}/{e}
 *  - SuperEmbed https://multiembed.mov/?video_id={id}&tmdb=1 (+ &s=&e=)
 *  - 2Embed    https://www.2embed.cc/embed/{imdb} · /embedtv/{imdb}&s={s}&e={e}
 *  - Embed.su  https://embed.su/embed/movie/{id} · /embed/tv/{id}/{s}/{e}
 *
 * `scrape`:
 *   'vidsrc'  -> server-side RCP/ProRCP chain scraping (see src/scraper.js)
 *   'generic' -> one-shot fetch + unpack of the embed page (usually JS-gated)
 *   null      -> iframe-only in our player; the provider resolves the stream client-side
 *
 * `idTypes`: which IDs the provider actually accepts. Passing a TMDB id to an
 * IMDb-only endpoint (or vice-versa) is the #1 cause of "not playing", so
 * unsupported combinations are reported, never silently built.
 */

const PROVIDERS = [
  {
    id: 'vidlink',
    name: 'VidLink',
    idTypes: ['tmdb'],
    prefer: 'tmdb',
    scrape: null,
    movie: 'https://vidlink.pro/movie/{tmdb}',
    tv: 'https://vidlink.pro/tv/{tmdb}/{s}/{e}',
    params: { color: 'primaryColor', autoplay: 'autoplay', start: 'startAt', next: 'nextbutton' },
    notes: 'TMDB only. Clean player, documented at vidlink.pro.'
  },
  {
    id: 'videasy',
    name: 'Videasy',
    idTypes: ['tmdb'],
    prefer: 'tmdb',
    scrape: null,
    movie: 'https://player.videasy.net/movie/{tmdb}',
    tv: 'https://player.videasy.net/tv/{tmdb}/{s}/{e}',
    params: { autoplay: 'autoplay' },
    notes: 'TMDB only.'
  },
  {
    id: 'vidfast',
    name: 'VidFast',
    idTypes: ['tmdb'],
    prefer: 'tmdb',
    scrape: null,
    movie: 'https://vidfast.pro/movie/{tmdb}',
    tv: 'https://vidfast.pro/tv/{tmdb}/{s}/{e}',
    params: { autoplay: 'autoplay' },
    notes: 'TMDB only. Mirror: vidfast.vc'
  },
  {
    id: 'vidsrc-cc',
    name: 'VidSrc.cc (v2)',
    idTypes: ['tmdb', 'imdb'],
    prefer: 'tmdb',
    scrape: 'generic',
    domains: ['https://vidsrc.cc'],
    movie: 'https://vidsrc.cc/v2/embed/movie/{id}',
    tv: 'https://vidsrc.cc/v2/embed/tv/{id}/{s}/{e}',
    params: {},
    notes: 'VidSrc v2 surface.'
  },
  {
    id: 'vidsrc',
    name: 'VidSrc (.xyz)',
    idTypes: ['tmdb', 'imdb'],
    prefer: 'tmdb',
    scrape: 'vidsrc',
    domains: ['https://vidsrc.xyz', 'https://vidsrc.in', 'https://vidsrc.pm', 'https://vidsrc.net'],
    movie: 'https://vidsrc.xyz/embed/movie/{id}',
    tv: 'https://vidsrc.xyz/embed/tv/{id}/{s}-{e}',
    params: {},
    notes: 'Scrapeable: embed -> .server[data-hash] -> /rcp/{hash} -> /prorcp/{hash} -> .m3u8'
  },
  {
    id: 'vidsrcme',
    name: 'VidSrcMe (.ru)',
    idTypes: ['tmdb', 'imdb'],
    prefer: 'tmdb',
    scrape: 'vidsrc',
    domains: ['https://vidsrcme.ru', 'https://vidsrc-embed.ru'],
    movie: 'https://vidsrcme.ru/embed/movie/{id}',
    tv: 'https://vidsrcme.ru/embed/tv/{id}/{s}/{e}',
    params: {},
    notes: 'vsembed backend, same RCP chain as VidSrc.'
  },
  {
    id: 'vidcore',
    name: 'VidCore',
    idTypes: ['tmdb'],
    prefer: 'tmdb',
    scrape: null,
    movie: 'https://vidcore.org/embed/movie/{tmdb}',
    tv: 'https://vidcore.org/embed/tv/{tmdb}/{s}/{e}',
    params: { color: 'theme' },
    notes: 'TMDB only.'
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    idTypes: ['tmdb'],
    prefer: 'tmdb',
    scrape: null,
    movie: 'https://player.autoembed.cc/embed/movie/{tmdb}',
    tv: 'https://player.autoembed.cc/embed/tv/{tmdb}/{s}/{e}',
    params: {},
    notes: 'TMDB only.'
  },
  {
    id: 'multiembed',
    name: 'SuperEmbed (MultiEmbed)',
    idTypes: ['tmdb', 'imdb'],
    prefer: 'tmdb',
    scrape: null,
    movie: 'https://multiembed.mov/?video_id={id}&tmdb=1',
    tv: 'https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}',
    params: {},
    notes: 'video_id is IMDb unless &tmdb=1 is present (handled in fillTemplate).'
  },
  {
    id: '2embed',
    name: '2Embed',
    idTypes: ['imdb', 'tmdb'],
    prefer: 'imdb',
    scrape: null,
    domains: ['https://www.2embed.cc'],
    movie: 'https://www.2embed.cc/embed/{id}',
    tv: 'https://www.2embed.cc/embedtv/{id}&s={s}&e={e}',
    params: {},
    notes: 'Works best with IMDb ids.'
  },
  {
    id: 'embedsu',
    name: 'Embed.su',
    idTypes: ['tmdb', 'imdb'],
    prefer: 'tmdb',
    scrape: 'generic',
    movie: 'https://embed.su/embed/movie/{id}',
    tv: 'https://embed.su/embed/tv/{id}/{s}/{e}',
    params: {},
    notes: 'Use www.embed.su if the apex stops resolving.'
  }
];

// Extra providers can be injected without code edits:
// EXTRA_PROVIDERS='[{"id":"mine","name":"Mine","idTypes":["tmdb"],"movie":"https://x/movie/{tmdb}","tv":"https://x/tv/{tmdb}/{s}/{e}"}]'
function getProviders() {
  let extra = [];
  if (process.env.EXTRA_PROVIDERS) {
    try {
      const parsed = JSON.parse(process.env.EXTRA_PROVIDERS);
      if (Array.isArray(parsed)) extra = parsed;
    } catch (_) { /* ignore malformed env */ }
  }
  return [...PROVIDERS, ...extra];
}

function fillTemplate(template, { tmdbId, imdbId, season, episode, idValue }) {
  const id = idValue || tmdbId || imdbId || '';
  let url = String(template)
    .replace(/\{tmdb\}/g, encodeURIComponent(tmdbId || ''))
    .replace(/\{imdb\}/g, encodeURIComponent(imdbId || ''))
    .replace(/\{id\}/g, encodeURIComponent(id))
    .replace(/\{s\}/g, encodeURIComponent(season || 1))
    .replace(/\{e\}/g, encodeURIComponent(episode || 1));
  // SuperEmbed: &tmdb=1 is only correct when the id actually is a TMDB id.
  if (url.includes('multiembed.mov') && !tmdbId) url = url.replace('&tmdb=1', '');
  return url;
}

/**
 * Build one provider target for a title. Returns available:false (with a
 * human reason) instead of a guaranteed-broken URL when the provider does
 * not accept the kind of id we have.
 */
function buildProviderTarget(provider, { type, tmdbId, imdbId, season = 1, episode = 1 }) {
  const have = { tmdb: tmdbId || null, imdb: imdbId || null };
  const usable = (provider.idTypes || ['tmdb']).filter((k) => have[k]);
  const base = {
    id: provider.id,
    name: provider.name,
    scrape: provider.scrape || null,
    notes: provider.notes || ''
  };
  if (!usable.length) {
    return {
      ...base,
      available: false,
      embedUrl: null,
      reason: `Needs a ${provider.idTypes.join(' or ')} id, but only ${tmdbId ? 'TMDB' : 'IMDb'} was given and no TMDB_API_KEY is set to convert it.`
    };
  }
  const template = type === 'tv' ? provider.tv : provider.movie;
  if (!template) return { ...base, available: false, embedUrl: null, reason: `No ${type} endpoint.` };
  // {id} resolves to the provider's preferred id kind.
  const preferred = provider.prefer && have[provider.prefer] ? have[provider.prefer] : have[usable[0]];
  const embedUrl = fillTemplate(template, { tmdbId, imdbId, idValue: preferred, season, episode });
  return { ...base, available: true, embedUrl, usedId: preferred };
}

/** Append player-behaviour params using each provider's own param names. */
function withPlayerParams(provider, embedUrl, { autoplay, color, start } = {}) {
  if (!embedUrl || !provider.params) return embedUrl;
  const u = new URL(embedUrl);
  const p = provider.params;
  if (p.color && color) u.searchParams.set(p.color, String(color).replace('#', ''));
  if (p.autoplay && autoplay) u.searchParams.set(p.autoplay, provider.id === 'vidlink' ? 'true' : '1');
  if (p.start && start) u.searchParams.set(p.start, String(Math.floor(start)));
  if (p.next) u.searchParams.set(p.next, 'true');
  return u.toString();
}

module.exports = { PROVIDERS, getProviders, buildProviderTarget, withPlayerParams, fillTemplate };
