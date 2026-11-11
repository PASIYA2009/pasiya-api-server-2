// SinhalaSub movie catalog integration.
// Search and details expose page metadata. The download endpoint returns the
// source's link page only; it does not extract or proxy copyrighted media files.
import { HttpError, fetchT, stripHtml, param } from '../system/util.js';

const BASE = 'https://sinhalasub.lk';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml'
};

function safeUrl(value, base = BASE) {
  try {
    const u = new URL(value, base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.href;
  } catch { return null; }
}
function sourceUrl(value) {
  const u = safeUrl(value);
  if (!u) return null;
  const host = new URL(u).hostname.toLowerCase();
  return host === 'sinhalasub.lk' || host.endsWith('.sinhalasub.lk') ? u : null;
}
async function page(url) {
  const r = await fetchT(url, { headers: HEADERS, redirect: 'follow' }, 15000);
  if (!r.ok) throw new HttpError(502, `SinhalaSub returned HTTP ${r.status}.`);
  return { html: await r.text(), finalUrl: r.url || url };
}
function attr(tag, name) {
  const re = new RegExp("(?:^|\\\\s)" + name + "\\\\s*=\\\\s*[\"']([^\"']*)[\"']", 'i');
  return (tag.match(re) || [])[1] || '';
}
function textOf(s) { return stripHtml(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')); }
function titleFrom(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return textOf(og?.[1] || h1?.[1] || t?.[1] || '') || null;
}
function isLinkPage(value) {
  const u = sourceUrl(value);
  return !!u && /^\/links\/[^/]+\/?$/i.test(new URL(u).pathname);
}
async function search(p) {
  const q = String(p.q || '').trim();
  if (!q || q.length > 120) throw new HttpError(400, 'q is required (maximum 120 characters).');
  const url = `${BASE}/?s=${encodeURIComponent(q)}`;
  const { html } = await page(url);
  const results = [], seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = sourceUrl(m[1]);
    if (!href || !new URL(href).pathname.includes('/movies/')) continue;
    const title = textOf(attr(m[0].slice(0, m[0].indexOf('>') + 1), 'title') || m[2]);
    if (title.length < 3 || seen.has(href)) continue;
    seen.add(href);
    const img = m[2].match(/<img\b[^>]*>/i)?.[0] || '';
    const poster = safeUrl(attr(img, 'data-src') || attr(img, 'src') || attr(img, 'data-lazy-src'));
    results.push({ title, url: href, poster });
    if (results.length >= 30) break;
  }
  return { query: q, count: results.length, results };
}
async function details(p) {
  const url = sourceUrl(p.url);
  if (!url || !new URL(url).pathname.includes('/movies/')) throw new HttpError(400, 'A valid SinhalaSub movie page URL is required.');
  const { html, finalUrl } = await page(url);
  const posterTag = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)/i);
  const descTag = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i);
  const links = [], seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = safeUrl(m[1], finalUrl);
    if (!href || !isLinkPage(href) || seen.has(href)) continue;
    seen.add(href);
    links.push({ text: textOf(m[2]) || 'SinhalaSub link page', url: href });
  }
  return {
    page: finalUrl, title: titleFrom(html),
    poster: safeUrl(posterTag?.[1] || ''),
    synopsis: textOf(descTag?.[1] || '') || null,
    downloadLinks: links
  };
}
async function downloadPage(p) {
  const url = sourceUrl(p.url);
  if (!url || !isLinkPage(url)) throw new HttpError(400, 'A valid SinhalaSub /links/ page URL is required.');
  const { html, finalUrl } = await page(url);
  return {
    page: finalUrl,
    title: titleFrom(html),
    available: true,
    downloadUrl: null,
    message: 'This endpoint returns the source link page only. Use an official or rights-authorized download option on that page.'
  };
}

export default [
  { path: '/api/movie/search', category: 'Movie', name: 'SinhalaSub search', cost: 1, desc: 'Search SinhalaSub movie titles and posters', params: [param('q', 'Avatar', 'Movie search query')], run: search },
  { path: '/api/movie/details', category: 'Movie', name: 'SinhalaSub details', cost: 1, desc: 'Get movie details and source link-page references', params: [param('url', 'https://sinhalasub.lk/movies/example/', 'SinhalaSub movie page URL')], run: details },
  { path: '/api/movie/download', category: 'Movie', name: 'SinhalaSub download', cost: 1, desc: 'Check a SinhalaSub link page and return its page reference', params: [param('url', 'https://sinhalasub.lk/links/example/', 'SinhalaSub link-page URL')], run: downloadPage }
];
