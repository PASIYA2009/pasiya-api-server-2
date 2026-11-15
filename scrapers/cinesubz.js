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
  const text = `${item.text} ${u.pathname} ${u.hostname}`.toLowerCase();
  return /download|watch|drive|mega|mediafire|pixeldrain|telegram|stream|1080p|720p|480p|\.(mp4|mkv|avi|zip|rar)(?:$|\?)/.test(text);
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
  const links = extractAnchors(html, finalUrl).filter(looksLikeDownloadLink);
  const unique = [...new Map(links.map((x) => [x.url, x])).values()];
  const synopsis = metaValue(meta, 'og:description') || metaValue(meta, 'description');
  return {
    success: true, site: 'CineSubz',
    result: {
      page: finalUrl,
      title: pageTitle(html),
      poster: imageFrom(html, finalUrl),
      synopsis: synopsis ? cleanText(synopsis) : null,
      releaseDate: metaValue(meta, 'article:published_time'),
      downloadLinks: unique
    }
  };
}

async function download(p) {
  const url = absoluteUrl(p.url);
  if (!url || !isCineSubzUrl(url)) throw new HttpError(400, 'A valid CineSubz page or publicly accessible link page URL is required.');
  const { html, finalUrl } = await getHtml(url);
  const links = extractAnchors(html, finalUrl).filter((x) => !isCineSubzUrl(x.url) && looksLikeDownloadLink(x));
  const unique = [...new Map(links.map((x) => [x.url, x])).values()];
  const mediaMatches = [...html.matchAll(/https?:\\?\/\\?\/[^\s"'<>\\]+?\.(?:mp4|mkv|avi|mov|m4v)(?:\?[^\s"'<>\\]*)?/gi)]
    .map((m) => absoluteUrl(m[0].replace(/\\\//g, '/').replace(/&amp;/g, '&'), finalUrl))
    .filter(Boolean);
  const media = [...new Set(mediaMatches)].map((u) => ({ text: 'Direct media', url: u }));
  const results = [...new Map([...unique, ...media].map((x) => [x.url, x])).values()];
  return { success: true, site: 'CineSubz', result: { page: finalUrl, title: pageTitle(html), count: results.length, links: results } };
}

export default [
  { path: '/api/cinesubz/search', category: 'Movie', name: 'CineSubz Search', cost: 1, isNew: true, desc: 'Search public CineSubz movie and TV pages', params: [param('q', 'Avatar', 'Movie or series title'), param('limit', '12', 'Maximum results', false)], run: search },
  { path: '/api/cinesubz/details', category: 'Movie', name: 'CineSubz Details', cost: 1, isNew: true, desc: 'Get public CineSubz title metadata and available link pages', params: [param('url', 'https://cinesubz.net/example-movie/', 'CineSubz movie or series page URL')], run: details },
  { path: '/api/cinesubz/download', category: 'Movie', name: 'CineSubz Links', cost: 1, isNew: true, desc: 'List download or watch links publicly exposed on a CineSubz page', params: [param('url', 'https://cinesubz.net/example-movie/', 'CineSubz page or public link page URL')], run: download }
];
