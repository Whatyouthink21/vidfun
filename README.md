# 🎬 VidFun — Movie & TV Video Player, Multi-Server Embed API & Scraper Engine

**VidFun** is a self-hosted Movie & TV Show streaming platform, standalone iframe **Video Player Embed API** (compatible with VidSrc URL conventions), and **Stream Scraper / JS P.A.C.K.E.R. Unpacker** that runs locally out-of-the-box.

---

## ✨ Features

1. **Drop-In Video Player Embed API (`/embed/movie/:id` & `/embed/tv/:id/:s/:e`)**
   - Works with **TMDB IDs** (e.g., `693134`, `1396`, `550`) and **IMDb IDs** (e.g., `tt15239678`, `tt0903747`).
   - Compatible with standard VidSrc URL patterns (`/embed/movie/:id`, `/embed/tv/:id/:season/:episode`, `/embed/tv/:id/:season-:episode`, `/v2/embed/...`).
   - Built-in **Server Switcher** inside the player:
     - **VidFun Direct (Native HTML5 + HLS.js Player)**: Multi-quality adaptive HLS (`.m3u8`) and MP4 (`1080p`, `720p`, `480p`), WebVTT closed captions (`en`, `es`, `fr`), playback speed (`0.5x`–`2x`), Picture-in-Picture, keyboard shortcuts, and an offline local HD stream synthesizer fallback.
     - **Upstream Embed Providers**: `VidSrc.xyz`, `VidSrc.icu`, `VidSrc.cc v2`, `VidSrc.to`, `SuperEmbed (multiembed.mov)`, `AutoEmbed`, and `2Embed`.
   - Built-in **TV Season & Episode Drawer** and **Next Episode** button directly inside the embed player.

2. **VidSrc & Generic Embed Stream Scraper (`/api/scrape`)**
   - Parses VidSrc-style server hash nodes (`.server[data-hash]`), `#player_iframe` RCP chains, `<video>` tags, and embedded iframes.
   - Includes a **Dean Edwards P.A.C.K.E.R. Unpacker** (`eval(function(p,a,c,k,e,d)...)`) and Base64 URL hunter to extract obfuscated `.m3u8`, `.mp4`, and `.vtt` URLs from player scripts.
   - Includes a **CORS Stream & HLS Manifest Proxy** (`/api/proxy/stream?url=...`) that rewrites relative `.m3u8` segment URLs with custom `Referer` and `User-Agent` headers.

3. **Full Web Streaming Portal & API Playground (`/`)**
   - Browse Movies & TV Shows with genre filters and instant search / TMDB & IMDb ID lookup.
   - **Theater Watch Player** with live server switching, TV episode selector, and 1-click `<iframe>` snippet copy.
   - **Interactive Embed API Builder** and **Scraper & Unpacker Studio**.
   - **Custom Sources Manager** to add your own movies, shows, `.m3u8`/`.mp4` streams, or custom upstream provider templates.

---

## 🚀 Run Locally

### Option 1: Node.js (Recommended)

```bash
# 1. Install dependencies
npm install

# 2. Start the server (default: http://localhost:3000)
npm start

# Or run in development watch mode:
npm run dev
```

Then open **http://localhost:3000** in your browser.

### Option 2: Docker / Docker Compose

```bash
docker compose up --build
```

---

## 🔗 Embed Player URL Reference

### Movie Embed URLs
- `http://localhost:3000/embed/movie/693134` *(TMDB ID)*
- `http://localhost:3000/embed/movie/tt15239678` *(IMDb ID)*
- `http://localhost:3000/embed/movie?tmdb=693134`

### TV Show Embed URLs
- `http://localhost:3000/embed/tv/1396/1/1` *(TMDB ID, Season 1, Episode 1)*
- `http://localhost:3000/embed/tv/1396/1-1` *(VidSrc.xyz hyphen style)*
- `http://localhost:3000/embed/tv?tmdb=1396&season=1&episode=1`

### Embed Query Parameters
| Parameter | Example | Description |
| :--- | :--- | :--- |
| `server` | `?server=vidfun-direct` | Default server (`vidfun-direct`, `vidsrc-xyz`, `vidsrc-icu`, `vidsrc-cc`, `vidsrc-to`, `multiembed`, `autoembed`, `2embed`) |
| `autoplay` | `?autoplay=1` | Automatically start playback on load |
| `color` | `?color=e50914` | Custom hex accent color for player controls |
| `sub` | `?sub=en` | Default subtitle language (`en`, `es`, `fr`, `off`) |
| `t` | `?t=120` | Start playback at timestamp (in seconds) |

### HTML `<iframe>` Snippet
```html
<iframe
  src="http://localhost:3000/embed/movie/693134?autoplay=1&color=e50914"
  width="100%"
  height="100%"
  frameborder="0"
  allowfullscreen
  allow="autoplay; encrypted-media; picture-in-picture"
></iframe>
```

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server health, counts, and available endpoints |
| `GET` | `/api/catalog` | List & filter Movies and TV Shows (`?type=movie\|tv&genre=...&q=...`) |
| `GET` | `/api/search?q=...` | Search catalog or dynamically resolve any TMDB/IMDb ID |
| `GET` | `/api/sources/movie/:id` | Resolve direct HLS/MP4 streams, subtitles & provider embeds for a Movie |
| `GET` | `/api/sources/tv/:id/:s/:e` | Resolve direct HLS/MP4 streams, subtitles & provider embeds for a TV Episode |
| `GET` | `/api/scrape?url=...` | Scrape an embed URL (or `?sample=1`) for `.m3u8`/`.mp4` streams & unpack JS |
| `POST` | `/api/scrape` | Scrape a URL or raw HTML payload (`{ url, rawHtml }`) |
| `GET` | `/api/proxy/stream?url=...` | CORS proxy for `.m3u8` HLS manifests, segments, and subtitles |
| `GET` | `/api/providers` | List all configured stream & embed providers |
| `POST` | `/api/providers` | Register a custom upstream provider URL template |
| `POST` | `/api/custom/media` | Add a custom Movie or TV Show with custom stream URLs |

---

## 🧪 Running Tests

```bash
npm test
```
