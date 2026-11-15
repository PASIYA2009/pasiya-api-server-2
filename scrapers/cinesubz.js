// CineSubz public-page scraper for Cloudflare Workers.
// Reads publicly exposed page metadata and links; it does not bypass logins,
// paywalls, CAPTCHA, DRM, or other access controls.
import { HttpError, fetchT, stripHtml, decodeEntities, param } from '../system/util.js';

const BASE_URL = 'https://cinesubz.net';
const ALLOWED_HOSTS = new Set(['cinesubz.net', 'cinesubz.org', 'cinesubz.co', 'cinesubz.lk']);
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

function absoluteUrl(value, base = BASE_URL) {
  try {
    const u = new URL(decodeEntities(String(value || '').trim()), base);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}
function isCineSubzUrl(value) {
  const u = absoluteUrl(value);
  if (!u) return false;
  const host = new URL(u).hostname.toLowerCase();
  return ALLOWED_HOSTS.has(host) || [...ALLOWED_HOSTS].some((h) => host.endsWith('.' + h));
}
function attrs(tag) {
  const out = {};
  for (const m of String(tag || '').matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}
function cleanText(s) {
  return stripHtml(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')).trim();
}
function metaTags(html) { return [...String(html).matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0])); }
function metaValue(meta, key) {
  const x = meta.find((a) => (a.property || a.name || '').toLowerCase() === key.toLowerCase());
  return x?.content || null;
}
function pageTitle(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(metaValue(metaTags(html), 'og:title') || h1?.[1] || title?.[1] || '') || null;
}
function imageFrom(html, base) {
  const meta = metaTags(html);
  const og = metaValue(meta, 'og:image') || metaValue(meta, 'twitter:image');
  if (og) return absoluteUrl(og, base);
  const img = html.match(/<img\b[^>]*(?:class=["'][^"']*(?:poster|thumbnail|wp-post-image)[^"']*["'])?[^>]*>/i)?.[0];
  const a = attrs(img || '');
  return absoluteUrl(a['data-src'] || a['data-lazy-src'] || a.src || '', base);
}
async function getHtml(url) {
  let response;
  try { response = await fetchT(url, { headers: HEADERS, redirect: 'follow' }, 15000); }
  catch (e) { throw new HttpError(502, e?.message || 'Could not connect to CineSubz.'); }
  if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 502, `CineSubz returned HTTP ${response.status}.`);
  const finalUrl = response.url || url;
  if (!isCineSubzUrl(finalUrl)) throw new HttpError(502, 'CineSubz redirected to an unsupported host.');
  return { html: await response.text(), finalUrl };
}
function extractAnchors(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(m[1]);
    const url = absoluteUrl(a.href, base);
    if (!url) continue;
    out.push({ url, text: cleanText(a.title || m[2]) || 'Open link', rel: a.rel || '' });
  }
  return out;
}
function isMoviePage(url) {
  if (!isCineSubzUrl(url)) return false;
  const path = new URL(url).pathname.toLowerCase();
  return path.length > 1 && !/^\/(wp-admin|wp-json|category|tag|page|search)(\/|$)/.test(path);
}
function looksLikeDownloadLink(item) {
  const u = new URL(item.url);
  const text = `${item.text || ''} ${u.pathname} ${u.search} ${u.hostname}`.toLowerCase();
  return /download|watch|server|mirror|link|drive|mega|mediafire|pixeldrain|telegram|stream|1080p|720p|480p|4k|\.(mp4|mkv|avi|mov|m4v|zip|rar)(?:$|\?)/.test(text)
    || /\/(?:links?|download|watch|go|out|redirect)(?:\/|$)/i.test(u.pathname)
    || /(?:download|url|link|file)=/i.test(u.search);
}

// CineSubz pages may expose a download button as an anchor, data-* attribute,
// iframe, or URL embedded in page data rather than a conventional download anchor.
function extractPublicLinkCandidates(html, base) {
  const found = [];
  const add = (raw, text = 'Open link') => {
    const url = absoluteUrl(String(raw || '').replace(/\\\//g, '/'), base);
    if (url) found.push({ url, text: cleanText(text) || 'Open link' });
  };

  for (const item of extractAnchors(html, base)) {
    if (looksLikeDownloadLink(item)) add(item.url, item.text);
  }

  const tagPattern = /<(?:a|button|iframe|form)\b[^>]*>/gi;
  for (const match of String(html).matchAll(tagPattern)) {
    const a = attrs(match[0]);
    const label = a.title || a['aria-label'] || a.value || a.name || a.class || '';
    for (const key of ['href', 'src', 'data-href', 'data-url', 'data-link', 'data-download', 'action']) {
      if (!a[key]) continue;
      const url = absoluteUrl(a[key], base);
      if (url && looksLikeDownloadLink({ url, text: label })) add(url, label);
    }
    if (a.onclick) {
      const urls = a.onclick.match(/https?:\/\/[^\s"'<>]+/gi) || [];
      for (const value of urls) add(value, label);
    }
  }

  const source = String(html).replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const embedded = source.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  for (const value of embedded) {
    const url = absoluteUrl(value.replace(/[),;]+$/g, ''), base);
    if (url && looksLikeDownloadLink({ url, text: '' })) add(url, 'Download link');
  }

  return [...new Map(found.map((item) => [item.url, item])).values()];
}

async function search(p) {
  const q = String(p.q || p.query || '').trim();
  if (!q) throw new HttpError(400, 'Search query "q" is required.');
  if (q.length > 120) throw new HttpError(400, 'Search query is too long (max 120 characters).');
  const limit = Math.max(1, Math.min(30, Number.parseInt(p.limit, 10) || 12));
  const { html, finalUrl } = await getHtml(`${BASE_URL}/?s=${encodeURIComponent(q)}`);
  const results = [], seen = new Set();
  for (const item of extractAnchors(html, finalUrl)) {
    if (!isCineSubzUrl(item.url) || !isMoviePage(item.url) || seen.has(item.url)) continue;
    const title = item.text.replace(/\s+/g, ' ').trim();
    if (title.length < 2 || /^(read more|view|details)$/i.test(title)) continue;
    seen.add(item.url);
    results.push({ title, url: item.url, poster: imageFrom(html.slice(Math.max(0, html.indexOf(item.text) - 500), html.indexOf(item.text) + 1200), finalUrl) });
    if (results.length >= limit) break;
  }
  return { success: true, site: 'CineSubz', query: q, count: results.length, results };
}

async function details(p) {
  const url = absoluteUrl(p.url);
  if (!url || !isCineSubzUrl(url) || !isMoviePage(url)) throw new HttpError(400, 'A valid CineSubz movie page URL is required.');
  const { html, finalUrl } = await getHtml(url);
  const meta = metaTags(html);
  const unique = extractPublicLinkCandidates(html, finalUrl);
  const synopsis = metaValue(meta, 'og:description') || metaValue(meta, 'description');
  return {
    success: true, site: 'CineSubz',
    result: {
      page: finalUrl,
      title: pageTitle(html),
      poster: imageFrom(html, finalUrl),
      synopsis: synopsis ? cleanText(synopsis) : null,
      releaseDate: metaValue(meta, 'article:published_time'),
      downloadLinks: unique,
      links: unique,
      downloadLinkCount: unique.length
    }
  };
}

function isSafePublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1' || h === '::') return false;
  // Block obvious private, loopback, link-local and reserved IPv4 destinations.
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = v4.slice(1).map(Number);
    if (a.some((n) => n > 255) || a[0] === 0 || a[0] === 10 || a[0] === 127 ||
      (a[0] === 169 && a[1] === 254) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
      (a[0] === 192 && a[1] === 168) || a[0] >= 224) return false;
  }
  return true;
}
const MEDIA_EXT = /\.(?:mp4|mkv|avi|mov|m4v|webm|mp3|m4a|aac|wav|zip|rar|7z)(?:$|[?#])/i;
const MEDIA_TYPE = /^(?:video\/|audio\/|application\/(?:octet-stream|x-rar|zip|x-7z-compressed))/i;

async function inspectPublicUrl(raw) {
  let current = absoluteUrl(raw);
  if (!current || !isSafePublicUrl(current)) return null;
  // If the supplied URL is already a public file URL, it is the direct link.
  if (MEDIA_EXT.test(current)) return { url: current, contentType: null, filename: null };

  for (let hop = 0; hop < 6; hop++) {
    if (!isSafePublicUrl(current)) return null;
    let response;
    try {
      response = await fetchT(current, {
        method: 'GET',
        headers: { ...HEADERS, Range: 'bytes=0-0' },
        redirect: 'manual'
      }, 12000);
    } catch { return null; }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      try { await response.body?.cancel(); } catch {}
      if (!location) return null;
      current = absoluteUrl(location, current);
      if (!current) return null;
      if (MEDIA_EXT.test(current)) return { url: current, contentType: null, filename: null };
      continue;
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
    const disposition = response.headers.get('content-disposition') || '';
    const finalUrl = response.url || current;
    if (MEDIA_EXT.test(finalUrl) || MEDIA_TYPE.test(contentType) || /attachment/i.test(disposition)) {
      try { await response.body?.cancel(); } catch {}
      return { url: finalUrl, contentType: contentType || null, filename: (disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i) || [])[1] || null };
    }

    // Read text-like pages and follow only links exposed in their HTML.
    let html = '';
    if (!contentType || /^(?:text\/html|application\/xhtml\+xml|text\/plain)$/i.test(contentType)) {
      try { html = await response.text(); } catch {}
    } else {
      try { await response.body?.cancel(); } catch {}
      return null;
    }
    if (!html || !/(?:<html|<a\b|<iframe\b|<form\b|<script\b)/i.test(html)) return null;
    const landed = finalUrl;
    if (!isSafePublicUrl(landed)) return null;
    const candidates = extractPublicLinkCandidates(html, landed)
      .filter((x) => x.url !== landed)
      .sort((a, b) => Number(MEDIA_EXT.test(b.url)) - Number(MEDIA_EXT.test(a.url)));
    for (const candidate of candidates.slice(0, 8)) {
      const found = await inspectPublicUrl(candidate.url);
      if (found) return { ...found, sourcePage: landed, label: candidate.text };
    }
    return null;
  }
  return null;
}

async function download(p) {
  const raw = String(p.url || p.link || '').trim();
  const url = absoluteUrl(raw);
  if (!url || !isSafePublicUrl(url)) throw new HttpError(400, 'A valid public HTTP/HTTPS download or link-page URL is required.');

  const direct = await inspectPublicUrl(url);
  if (!direct) {
    throw new HttpError(404, 'No direct public media/file URL was found. The link may require JavaScript, login, CAPTCHA, or a manual confirmation step.');
  }
  const ext = (new URL(direct.url).pathname.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || null;
  return {
    success: true,
    site: 'CineSubz',
    result: {
      page: url,
      directDownload: direct.url,
      downloadUrl: direct.url,
      filename: direct.filename,
      contentType: direct.contentType,
      extension: ext,
      isDirect: true
    }
  };
}

export default [
  { path: '/api/cinesubz/search', category: 'Movie', name: 'CineSubz Search', cost: 1, isNew: true, desc: 'Search public CineSubz movie and TV pages', params: [param('q', 'Avatar', 'Movie or series title'), param('limit', '12', 'Maximum results', false)], run: search },
  { path: '/api/cinesubz/details', category: 'Movie', name: 'CineSubz Details', cost: 1, isNew: true, desc: 'Get public CineSubz title metadata and available link pages', params: [param('url', 'https://cinesubz.net/example-movie/', 'CineSubz movie or series page URL')], run: details },
  { path: '/api/cinesubz/download', category: 'Movie', name: 'CineSubz Direct Download', cost: 1, isNew: true, desc: 'Resolve a public download link page to its direct media/file URL', params: [param('url', 'https://example.com/public-download-link', 'CineSubz download link or public link-page URL')], run: download }
];
