# VidFun — Movie & TV Embed API (with its own scraping player)

**Not a streaming site.** There is no catalog, no browsing, no accounts.
VidFun is two things:

1. **An embed API** — `/embed/movie/{id}` and `/embed/tv/{id}/{season}/{episode}` (TMDB or IMDb id) that you drop in an `<iframe>` anywhere.
2. **Its own player + scraper** — your server scrapes direct `.m3u8`/`.mp4` streams out of upstream embed pages and plays them in a native HLS player. When scraping can't expose a stream, the same player falls back to provider iframes. Nothing is faked: no demo clips standing in for movies, no placeholder "streams".

## Why movies/TV weren't playing before (v1 post-mortem)

| Bug | Effect |
|---|---|
| Every catalog title was mapped to the same public **test clips** (Sintel, Big Buck Bunny, Mux test HLS) | You never got the actual movie; several test manifests are dead/CORS-blocked now → black player |
| On any stall the player fell back to a **canvas animation synthesizer** | Looked alive, played nothing |
| Provider list was stale (`vidsrc.to`, `vidsrc.icu`, … have rotated/blocked embeds) and **TMDB ids were sent to IMDb-only endpoints and vice-versa** | Iframes loaded error pages |
| Scraper returned a **simulated sample result** when a fetch failed | API claimed success while returning a Mux test stream |
| HLS proxy only rewrote bare segment lines, not `URI="…"` key/rendition attributes | Encrypted/multi-rendition HLS broke mid-playlist |

v2 fixes all of these; when something genuinely can't be scraped you get an explicit per-provider error, not a fake success.

## Run

```bash
npm install
npm start          # http://localhost:3000
```

Open `/` for a small API playground (builder + JSON viewer) — that's the entire frontend besides the player.

Optional but recommended: set `TMDB_API_KEY` in `.env` (free at themoviedb.org). Without it, numeric ids are treated as TMDB and `tt…` ids as IMDb, and providers needing the other kind are marked *unavailable for this id* instead of breaking. With it, ids are converted and titles/posters/season-episode counts are filled in.

## Embed API

```html
<iframe src="https://your-host/embed/movie/550" width="100%" height="100%"
        frameborder="0" allowfullscreen
        allow="autoplay; encrypted-media; picture-in-picture"></iframe>
```

| URL | Meaning |
|---|---|
| `/embed/movie/{tmdbId}` · `/embed/movie/{imdbId}` | Movie (e.g. `550`, `tt0137523`) |
| `/embed/tv/{id}/{season}/{episode}` | TV episode — also `{s}-{e}` style and `/v2/embed/…` |
| `?server=vidlink` | Start on a specific provider (ids from `/api/providers`) |
| `?autoplay=1` `?color=e50914` `?t=120` | Autoplay, accent color, start position (s) |
| `?autonext=1` | TV: auto-advance to the next episode on end |

**Player behaviour:** scrape → play direct stream (multi-quality HLS, subtitles, speed, PiP, keyboard) → on fatal error try the next scraped stream → fall back to provider iframes in order → only then show an error screen listing what each server said. Use the server dropdown (top right) to switch manually; TV shows get season/episode steppers.

## JSON API

```bash
GET /api/sources/movie/550
GET /api/sources/tv/1399/1/1          # add ?scrape=0 to skip scraping
GET /api/scrape?url=https://vidsrc.xyz/embed/movie/550
GET /api/providers · GET /api/health
GET /api/proxy/stream?url={m3u8}&referer={page}   # CORS/Referer proxy used by the player
```

`/api/sources/…` response (abridged):

```jsonc
{
  "ok": true, "type": "movie",
  "ids": { "tmdb": "550", "imdb": "tt0137523" },
  "direct": [ { "url": "https://…/master.m3u8", "proxiedUrl": "/api/proxy/stream?url=…",
                "type": "hls", "quality": "1080p", "provider": "vidsrc", "verified": true } ],
  "subtitles": [ { "url": "https://…/en.vtt", "lang": "en", "label": "English" } ],
  "providers": [ { "id": "vidlink", "available": true, "embedUrl": "https://vidlink.pro/movie/550", "mode": "iframe" },
                 { "id": "2embed", "available": false, "reason": "Needs a imdb id…" } ],
  "scrapeReport": [ { "provider": "vidsrc", "ok": true, "streams": 1, "trace": [ … ] } ]
}
```

## How scraping works

For the VidSrc family (`vidsrc.xyz` + mirrors, `vidsrcme.ru`), `src/scraper.js` follows the real chain server-side:

```
GET /embed/movie/{id}
  └─ .server[data-hash] elements + <iframe id="player_iframe" src="//{host}/rcp/{hash}">
GET {host}/rcp/{hash}            ← host discovered from the iframe, not hardcoded
  └─ <iframe src="{host}/prorcp/{hash}">   (srcrcp also handled)
GET {host}/prorcp/{hash}
  └─ Dean Edwards packed JS (src/unpacker.js) + file:/sources regexes
     → master.m3u8 / .mp4 + .vtt subtitles  → verified with a live probe → player (via proxy)
```

Everything else (VidLink, Videasy, VidFast, …) is a client-side JS app whose server HTML contains no stream — those are honestly classified `iframe` mode. Results are cached 10 min (`SOURCES_CACHE_TTL_MS`).

## Providers (researched July 2026)

Researched against the providers' own docs and current aggregator lists
([vidlink.pro](https://vidlink.pro), [vidcore.org](https://vidcore.org),
[LyeDevGit/free-streaming-apis](https://github.com/LyeDevGit/free-streaming-apis),
[vidsrcme.ru/api](https://vidsrcme.ru/api/), and open extractors such as CloudStream's
VidSrcTo/Vidplay and DivineChile/vidsrc-scraper):

| Provider | Movie / TV URL | IDs | Scraped? |
|---|---|---|---|
| VidLink | `vidlink.pro/movie/{tmdb}` · `/tv/{tmdb}/{s}/{e}` | TMDB | iframe |
| Videasy | `player.videasy.net/movie/{tmdb}` · `/tv/{tmdb}/{s}/{e}` | TMDB | iframe |
| VidFast | `vidfast.pro/movie/{tmdb}` · `/tv/{tmdb}/{s}/{e}` | TMDB | iframe |
| VidSrc.cc v2 | `vidsrc.cc/v2/embed/movie/{id}` · `/v2/embed/tv/{id}/{s}/{e}` | both | generic |
| VidSrc | `vidsrc.xyz/embed/movie/{id}` · `/embed/tv/{id}/{s}-{e}` | both | **RCP chain** |
| VidSrcMe | `vidsrcme.ru/embed/movie/{id}` · `/embed/tv/{id}/{s}/{e}` | both | **RCP chain** |
| VidCore | `vidcore.org/embed/movie/{tmdb}` · `/embed/tv/{tmdb}/{s}/{e}` | TMDB | iframe |
| AutoEmbed | `player.autoembed.cc/embed/movie/{tmdb}` | TMDB | iframe |
| SuperEmbed | `multiembed.mov/?video_id={id}&tmdb=1` (+`&s=&e=`) | both | iframe |
| 2Embed | `2embed.cc/embed/{imdb}` · `/embedtv/{imdb}&s=&e=` | IMDb-first | iframe |
| Embed.su | `embed.su/embed/movie/{id}` · `/embed/tv/{id}/{s}/{e}` | both | generic |

These domains rotate constantly — that's why the registry lives in **one file, `src/providers.js`** (also extensible at runtime via the `EXTRA_PROVIDERS` env JSON, no code edits). Availability also depends on your server's network/geography; `scrapeReport[].trace` in the JSON shows exactly where a chain stopped.

## Layout

```
server.js            Express app (CORS + frame-ancestors *, hls.js vendored locally)
src/providers.js     Provider registry + URL building + per-provider param names  ← edit this when domains move
src/scraper.js       RCP/ProRCP chain, HTML parser, stream verifier
src/unpacker.js      Dean Edwards P.A.C.K.E.R. unpacker + media URL extractor
src/resolve.js       Scrape orchestration, verification, caching
src/tmdb.js          ID parsing + optional TMDB conversion/metadata
src/routes/api.js    /api/* (sources, scrape, proxy)
src/routes/embed.js  /embed/*, /v2/embed/*
public/embed.html + js/embed-player.js + css/embed.css   The player
public/index.html    API docs + playground (the only "site" page)
test/verify.js       npm test
```

## Notes

Only embed/scrape content you have the rights to distribute. Upstream providers inject their own ads in iframe mode; direct (scraped) mode plays in VidFun's clean player. Some providers geo-block or bot-check datacenter IPs — if `scrapeReport` shows fetch failures for every provider while embeds work in a browser, run VidFun from a residential connection.
