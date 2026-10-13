/**
 * Local Media Utilities:
 * - Dynamic WebVTT (.vtt) subtitle generation for English, Spanish, and French
 * - Dynamic SVG cinematic poster & backdrop artwork generation (works 100% offline)
 * - Dynamic HLS (.m3u8) master playlist wrapper
 */

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a valid WebVTT subtitle track for a given title and language
 */
function generateWebVtt({ title = 'VidFun Stream', lang = 'en', season, episode }) {
  const epLabel = season && episode ? ` (S${season}:E${episode})` : '';
  const fullTitle = `${title}${epLabel}`;

  const translations = {
    en: [
      ['00:00:00.500', '00:00:04.500', `♪ [Cinematic Intro Music] ♪\nNow playing: ${fullTitle}`],
      ['00:00:05.000', '00:00:10.000', `Streaming via VidFun Direct HD Player — Multi-Source Embed Engine.`],
      ['00:00:10.500', '00:00:16.000', `"Every story begins with a single spark in the dark."`],
      ['00:00:16.500', '00:00:22.500', `[Ambient soundscape intensifies]\n"We have to keep moving before the signal fades."`],
      ['00:00:23.000', '00:00:30.000', `"Check the coordinates. The transmission came from Sector 7."`],
      ['00:00:30.500', '00:00:38.000', `"Are you seeing this? The entire horizon is lighting up."`],
      ['00:00:38.500', '00:00:46.000', `[Dramatic orchestral swell]\n"Hold on tight—there's no turning back now!"`],
      ['00:00:46.500', '00:00:55.000', `"Systems stabilized. Full resolution lock achieved."`],
      ['00:00:55.500', '00:01:10.000', `♪ [Main Theme Continues] ♪\n${fullTitle} — VidFun Player API`]
    ],
    es: [
      ['00:00:00.500', '00:00:04.500', `♪ [Música Cinematográfica de Introducción] ♪\nReproduciendo: ${fullTitle}`],
      ['00:00:05.000', '00:00:10.000', `Transmitiendo mediante VidFun Direct HD Player.`],
      ['00:00:10.500', '00:00:16.000', `"Toda historia comienza con una sola chispa en la oscuridad."`],
      ['00:00:16.500', '00:00:22.500', `[El sonido ambiental se intensifica]\n"Debemos seguir avanzando antes de que se pierda la señal."`],
      ['00:00:23.000', '00:00:30.000', `"Revisa las coordenadas. La transmisión vino del Sector 7."`],
      ['00:00:30.500', '00:00:38.000', `"¿Estás viendo esto? Todo el horizonte se está iluminando."`],
      ['00:00:38.500', '00:00:46.000', `[Crescendo orquestal dramático]\n"¡Sujétate fuerte, ya no hay vuelta atrás!"`],
      ['00:00:46.500', '00:00:55.000', `"Sistemas estabilizados. Sincronización completa alcanzada."`],
      ['00:00:55.500', '00:01:10.000', `♪ [Continúa el Tema Principal] ♪\n${fullTitle} — VidFun Player API`]
    ],
    fr: [
      ['00:00:00.500', '00:00:04.500', `♪ [Musique Cinématographique d'Introduction] ♪\nLecture en cours : ${fullTitle}`],
      ['00:00:05.000', '00:00:10.000', `Diffusé via VidFun Direct HD Player.`],
      ['00:00:10.500', '00:00:16.000', `« Chaque histoire commence par une simple étincelle dans l'obscurité. »`],
      ['00:00:16.500', '00:00:22.500', `[Ambiance sonore intense]\n« Nous devons continuer avant que le signal ne disparaisse. »`],
      ['00:00:23.000', '00:00:30.000', `« Vérifiez les coordonnées. La transmission vient du Secteur 7. »`],
      ['00:00:30.500', '00:00:38.000', `« Tu vois ça ? Tout l'horizon s'illumine. »`],
      ['00:00:38.500', '00:00:46.000', `[Montée orchestrale dramatique]\n« Accrochez-vous — impossible de faire demi-tour ! »`],
      ['00:00:46.500', '00:00:55.000', `« Systèmes stabilisés. Verrouillage haute définition activé. »`],
      ['00:00:55.500', '00:01:10.000', `♪ [Le Thème Principal Continue] ♪\n${fullTitle} — VidFun Player API`]
    ]
  };

  const cues = translations[lang] || translations.en;
  let vtt = 'WEBVTT\n\n';
  cues.forEach(([start, end, text], idx) => {
    vtt += `${idx + 1}\n${start} --> ${end}\n${text}\n\n`;
  });
  return vtt;
}

/**
 * Generate a sleek SVG cinematic poster for any Movie or TV show
 */
function generatePosterSvg(item) {
  const title = escapeXml(item.title || 'Untitled');
  const year = escapeXml(item.year || '2025');
  const rating = escapeXml(item.rating || '8.5');
  const typeLabel = item.type === 'tv' ? 'TV SERIES' : 'MOVIE';
  const genre = escapeXml((item.genres && item.genres[0]) || 'Sci-Fi');
  const accent1 = item.accent1 || '#e50914';
  const accent2 = item.accent2 || '#6366f1';
  const accent3 = item.accent3 || '#0f172a';

  // Split title into lines of ~16 chars
  const words = title.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > 16 && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  const displayLines = lines.slice(0, 3);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent1}" stop-opacity="0.88"/>
      <stop offset="48%" stop-color="${accent2}" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="${accent3}" stop-opacity="1"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="32%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0%" y1="30%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#07090e" stop-opacity="0"/>
      <stop offset="68%" stop-color="#07090e" stop-opacity="0.86"/>
      <stop offset="100%" stop-color="#07090e" stop-opacity="0.98"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="#07090e"/>
  <rect width="600" height="900" fill="url(#bg)"/>
  <circle cx="300" cy="290" r="240" fill="url(#glow)"/>
  <g stroke="rgba(255,255,255,0.08)" stroke-width="1.5" fill="none">
    <circle cx="300" cy="290" r="170"/>
    <circle cx="300" cy="290" r="115"/>
    <path d="M 80 290 L 520 290 M 300 70 L 300 510"/>
  </g>
  <!-- Play Emblem -->
  <circle cx="300" cy="290" r="56" fill="rgba(10,14,26,0.55)" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
  <polygon points="286,264 286,316 328,290" fill="#ffffff" opacity="0.92"/>
  <rect width="600" height="900" fill="url(#fade)"/>
  <!-- Top Badges -->
  <rect x="36" y="36" width="130" height="36" rx="8" fill="rgba(10,14,23,0.75)" stroke="rgba(255,255,255,0.18)"/>
  <text x="101" y="60" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="1.5">${typeLabel}</text>
  <rect x="470" y="36" width="94" height="36" rx="8" fill="rgba(245,158,11,0.2)" stroke="#f59e0b"/>
  <text x="517" y="60" fill="#fbbf24" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" text-anchor="middle">★ ${rating}</text>
  <!-- Title & Metadata -->
  <text x="42" y="640" fill="${accent1}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" letter-spacing="2.5">${genre.toUpperCase()} • ${year}</text>
  ${displayLines
    .map(
      (line, idx) =>
        `<text x="42" y="${696 + idx * 54}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="46" font-weight="800" letter-spacing="-0.5">${line}</text>`
    )
    .join('\n  ')}
  <text x="42" y="860" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600" letter-spacing="1">VIDFUN HD STREAM • TMDB #${escapeXml(item.tmdbId)}</text>
</svg>`;
}

/**
 * Generate a sleek 16:9 SVG backdrop for any Movie or TV show
 */
function generateBackdropSvg(item) {
  const title = escapeXml(item.title || 'Untitled');
  const accent1 = item.accent1 || '#e50914';
  const accent2 = item.accent2 || '#6366f1';
  const accent3 = item.accent3 || '#090d16';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent3}"/>
      <stop offset="50%" stop-color="${accent2}" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="${accent1}" stop-opacity="0.8"/>
    </linearGradient>
    <radialGradient id=" flare" cx="72%" cy="42%" r="48%">
      <stop offset="0%" stop-color="${accent1}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vignette" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#06080f" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#06080f" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="#06080f"/>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <circle cx="920" cy="300" r="420" fill="url(#flare)"/>
  <g stroke="rgba(255,255,255,0.06)" stroke-width="2" fill="none">
    <circle cx="920" cy="300" r="260"/>
    <circle cx="920" cy="300" r="180"/>
    <circle cx="920" cy="300" r="100"/>
    <line x1="560" y1="300" x2="1280" y2="300"/>
    <line x1="920" y1="0" x2="920" y2="660"/>
  </g>
  <rect width="1280" height="720" fill="url(#vignette)"/>
  <text x="920" y="315" fill="rgba(255,255,255,0.07)" font-family="system-ui, -apple-system, sans-serif" font-size="110" font-weight="900" text-anchor="middle">${title.toUpperCase()}</text>
</svg>`;
}

module.exports = {
  generateWebVtt,
  generatePosterSvg,
  generateBackdropSvg
};
