/**
 * JavaScript P.A.C.K.E.R. Unpacker & Media Stream Extractor
 * Decodes Dean Edwards packed scripts (`eval(function(p,a,c,k,e,d)...)`),
 * Base64-encoded payloads, and extracts HLS (.m3u8), MP4 (.mp4), WebVTT (.vtt),
 * and nested iframe sources from embed pages.
 */

/**
 * Detect whether text contains Dean Edwards packed JS code
 * @param {string} text
 * @returns {boolean}
 */
function detectPacked(text) {
  if (!text || typeof text !== 'string') return false;
  return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)/.test(text);
}

/**
 * Unpack a single Dean Edwards packed block
 * @param {string} payload - p
 * @param {number} radix - a
 * @param {number} count - c
 * @param {string[]} symtab - k
 * @returns {string}
 */
function unpackBlock(payload, radix, count, symtab) {
  const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function unbase(str, base) {
    if (base <= 36) {
      return parseInt(str, base);
    }
    let result = 0;
    const dict = ALPHABET.slice(0, base);
    for (let i = 0; i < str.length; i++) {
      const idx = dict.indexOf(str[i]);
      if (idx === -1) return NaN;
      result = result * base + idx;
    }
    return result;
  }

  return payload.replace(/\b[0-9a-zA-Z]+\b/g, (word) => {
    const index = unbase(word, radix);
    if (!Number.isNaN(index) && index < count && symtab[index]) {
      return symtab[index];
    }
    return word;
  });
}

/**
 * Unpack all packed JS blocks found in a string
 * @param {string} source
 * @returns {string[]} Array of unpacked JS strings
 */
function unpackAll(source) {
  if (!source || typeof source !== 'string') return [];
  const results = [];
  const regex =
    /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)\s*\{[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/g;

  let match;
  while ((match = regex.exec(source)) !== null) {
    try {
      const payload = match[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
      const radix = parseInt(match[3], 10);
      const count = parseInt(match[4], 10);
      const symtab = match[6].split('|');
      const unpacked = unpackBlock(payload, radix, count, symtab);
      results.push(unpacked);
    } catch (err) {
      // Ignore malformed block
    }
  }
  return results;
}

/**
 * Decode VidSrc-style XOR / Base64 encoded hashes when present
 * @param {string} encoded
 * @returns {string|null}
 */
function tryDecodeBase64Url(encoded) {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    const cleaned = encoded.trim().replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
    if (/^https?:\/\//i.test(decoded) || /^\/\//.test(decoded)) {
      return decoded.startsWith('//') ? `https:${decoded}` : decoded;
    }
  } catch (_) {
    // Ignore invalid base64
  }
  return null;
}

/**
 * Extract all media URLs (.m3u8, .mp4, .webm, .vtt, .srt) from arbitrary HTML/JS text
 * @param {string} rawText
 * @param {string} [baseUrl]
 * @returns {{ streams: Array<{url: string, type: string, quality: string}>, subtitles: Array<{url: string, lang: string, label: string}>, unpackedScripts: string[] }}
 */
function extractMediaFromText(rawText, baseUrl = '') {
  if (!rawText || typeof rawText !== 'string') {
    return { streams: [], subtitles: [], unpackedScripts: [] };
  }

  const unpackedScripts = unpackAll(rawText);
  const combinedText = [rawText, ...unpackedScripts].join('\n');

  // Unescape JSON-escaped slashes like https:\/\/example.com\/master.m3u8
  const normalizedText = combinedText.replace(/\\\//g, '/');

  const seenStreams = new Set();
  const streams = [];
  const seenSubs = new Set();
  const subtitles = [];

  function resolveUrl(candidate) {
    if (!candidate) return null;
    const trimmed = candidate.trim().replace(/['"\\<>)+,;]+$/g, '');
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (baseUrl && trimmed.startsWith('/')) {
      try {
        return new URL(trimmed, baseUrl).toString();
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  function inferQuality(url, context = '') {
    const combined = `${url} ${context}`;
    if (/2160p|4k/i.test(combined)) return '4K';
    if (/1080p|fhd/i.test(combined)) return '1080p';
    if (/720p|hd/i.test(combined)) return '720p';
    if (/480p|sd/i.test(combined)) return '480p';
    if (/360p/i.test(combined)) return '360p';
    return 'Auto';
  }

  // 1. Match HLS (.m3u8) URLs
  const m3u8Regex = /(?:https?:\/\/|\/\/)[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
  let match;
  while ((match = m3u8Regex.exec(normalizedText)) !== null) {
    const url = resolveUrl(match[0]);
    if (url && !seenStreams.has(url)) {
      seenStreams.add(url);
      streams.push({
        url,
        type: 'hls',
        quality: inferQuality(url)
      });
    }
  }

  // 2. Match direct MP4 / WebM URLs
  const mp4Regex = /(?:https?:\/\/|\/\/)[^\s"'<>\\]+?\.(?:mp4|webm)(?:\?[^\s"'<>\\]*)?/gi;
  while ((match = mp4Regex.exec(normalizedText)) !== null) {
    const url = resolveUrl(match[0]);
    if (url && !seenStreams.has(url)) {
      seenStreams.add(url);
      streams.push({
        url,
        type: url.includes('.webm') ? 'webm' : 'mp4',
        quality: inferQuality(url)
      });
    }
  }

  // 3. Match JWPlayer / Plyr `file: "..."` or `sources: [{ file: "..." }]`
  const filePropRegex = /(?:file|src|source|hls|streamUrl)\s*["']?\s*:\s*["']((?:https?:\/\/|\/\/)[^"']+)["']/gi;
  while ((match = filePropRegex.exec(normalizedText)) !== null) {
    const url = resolveUrl(match[1]);
    if (!url) continue;
    if (/\.(?:vtt|srt)(?:\?|$)/i.test(url)) {
      if (!seenSubs.has(url)) {
        seenSubs.add(url);
        subtitles.push({
          url,
          lang: 'en',
          label: 'English'
        });
      }
    } else if (/\.(?:m3u8|mp4|webm|mpd)(?:\?|$)/i.test(url) || /master|playlist|manifest|stream/i.test(url)) {
      if (!seenStreams.has(url)) {
        seenStreams.add(url);
        streams.push({
          url,
          type: url.includes('.mp4') ? 'mp4' : 'hls',
          quality: inferQuality(url)
        });
      }
    }
  }

  // 4. Match Subtitles (.vtt / .srt)
  const subRegex = /(?:https?:\/\/|\/\/)[^\s"'<>\\]+?\.(?:vtt|srt)(?:\?[^\s"'<>\\]*)?/gi;
  while ((match = subRegex.exec(normalizedText)) !== null) {
    const url = resolveUrl(match[0]);
    if (url && !seenSubs.has(url)) {
      seenSubs.add(url);
      subtitles.push({
        url,
        lang: /es|spa|spanish/i.test(url) ? 'es' : /fr|fre|french/i.test(url) ? 'fr' : 'en',
        label: /es|spa|spanish/i.test(url) ? 'Spanish' : /fr|fre|french/i.test(url) ? 'French' : 'English'
      });
    }
  }

  return {
    streams,
    subtitles,
    unpackedScripts
  };
}

module.exports = {
  detectPacked,
  unpackBlock,
  unpackAll,
  tryDecodeBase64Url,
  extractMediaFromText
};
