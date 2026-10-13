/**
 * ID normalisation + optional TMDB metadata.
 *
 * TMDB_API_KEY is OPTIONAL:
 *  - Without it, a numeric id is treated as TMDB and a tt-prefixed id as IMDb.
 *    Providers that need the other kind are reported unavailable (honestly)
 *    instead of receiving a wrong-kind id and failing inside the iframe.
 *  - With it (free key from themoviedb.org), IMDb<->TMDB conversion and
 *    title / season-episode counts are fetched from the TMDB API and cached.
 */

const cache = new Map();
const TTL = 60 * 60 * 1000;

function parseId(raw) {
  const v = String(raw || '').trim();
  if (/^tt\d{5,10}$/i.test(v)) return { kind: 'imdb', imdbId: v.toLowerCase(), tmdbId: null };
  if (/^\d{1,9}$/.test(v)) return { kind: 'tmdb', tmdbId: v, imdbId: null };
  return { kind: null, tmdbId: null, imdbId: null };
}

async function tmdb(pathname) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const hit = cache.get(pathname);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const sep = pathname.includes('?') ? '&' : '?';
  const res = await fetch(`https://api.themoviedb.org/3${pathname}${sep}api_key=${key}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  cache.set(pathname, { at: Date.now(), data });
  return data;
}

/**
 * Resolve { tmdbId, imdbId, meta } for any accepted id.
 * meta: { title, year, overview, poster, backdrop, seasons: [{season, episodes}] } | null
 */
async function resolveIds({ type = 'movie', id, season, episode }) {
  const parsed = parseId(id);
  let { tmdbId, imdbId } = parsed;
  let meta = null;

  if (process.env.TMDB_API_KEY) {
    try {
      if (imdbId && !tmdbId) {
        const found = await tmdb(`/find/${imdbId}?external_source=imdb_id`);
        const hit = found && (type === 'tv' ? found.tv_results : found.movie_results)?.[0];
        if (hit) tmdbId = String(hit.id);
      }
      if (tmdbId) {
        const d = await tmdb(`/${type === 'tv' ? 'tv' : 'movie'}/${tmdbId}?append_to_response=external_ids`);
        if (d) {
          imdbId = imdbId || d.external_ids?.imdb_id || d.imdb_id || null;
          meta = {
            title: d.title || d.name || null,
            year: (d.release_date || d.first_air_date || '').slice(0, 4) || null,
            overview: d.overview || null,
            poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
            backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
            seasons: Array.isArray(d.seasons)
              ? d.seasons.map((s) => ({ season: s.season_number, episodes: s.episode_count, name: s.name }))
              : []
          };
        }
      }
    } catch (_) { /* metadata is best-effort; playback must not depend on it */ }
  }

  return { tmdbId: tmdbId || null, imdbId: imdbId || null, meta };
}

module.exports = { parseId, resolveIds };
