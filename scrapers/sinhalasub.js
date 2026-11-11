// SinhalaSub API integration. Ported from the supplied working v5 scraper.
// Uses the existing PASIYA API fetch/error/parameter helpers; no existing system files are replaced.
import { HttpError, fetchT, stripHtml, param } from '../system/util.js';

const BASE_URL = 'https://sinhalasub.lk';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

function absoluteUrl(value, base = BASE_URL) {
  try {
    const u = new URL(value, base);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}
function isSinhalaSubUrl(value) {
  const u = absoluteUrl(value);
  if (!u) return false;
  const host = new URL(u).hostname.toLowerCase();
  return host === 'sinhalasub.lk' || host.endsWith('.sinhalasub.lk');
}
function isLandingPage(value) {
  const u = absoluteUrl(value);
  if (!u || !isSinhalaSubUrl(u)) return false;
  return /^\/links\/[^/]+\/?$/i.test(new URL(u).pathname);
}
async function getHtml(url) {
  let response;
  try {
    response = await fetchT(url, { headers: HEADERS, redirect: 'follow' }, 15000);
  } catch (e) {
    throw e;
  }
  if (!response.ok) throw new HttpError(response.status >= 400 ? 502 : response.status, `Upstream server returned HTTP ${response.status}.`);
  return { html: await response.text(), finalUrl: response.url || url, status: response.status };
}
function attrs(tag) {
  const out = {};
  for (const m of String(tag || '').matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}
function decodeText(s) {
  return stripHtml(String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, ''));
}
function findTitle(html) {
  const og = html.match(/<meta\b(?=[^>]*property=["']og:title["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>/i);
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeText(og?.[1] || h1?.[1] || title?.[1] || '') || null;
}
function extractPublicMediaUrl(html, pageUrl) {
  const source = String(html || '')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const candidates = source.match(/https?:[^"'\s<>]+?\.(?:mp4|mkv|avi|mov|m4v)(?:\?[^"'\s<>]*)?/gi) || [];
  for (const candidate of candidates) {
    const url = absoluteUrl(candidate.replace(/[),;]+$/g, ''), pageUrl);
    if (url && /\.(mp4|mkv|avi|mov|m4v)$/i.test(new URL(url).pathname)) return url;
  }
  const patterns = source.match(/https?:\/\/[^"'\s<>]+\/(?:storage|dl|download|files|stream)\/[^"'\s<>]+/gi) || [];
  for (const match of patterns) {
    const url = absoluteUrl(match.replace(/[),;]+$/g, ''), pageUrl);
    if (url) return url;
  }
  const cdn = source.match(/https?:\/\/[^"'\s<>]+\.net\/[^"'\s<>]+/i);
  if (cdn) {
    const url = absoluteUrl(cdn[0], pageUrl);
    if (url && !new URL(url).hostname.endsWith('sinhalasub.lk')) return url;
  }
  return null;
}
async function searchMovies(p) {
  const query = String(p.q || '').trim();
  if (!query) throw new HttpError(400, 'Search query "q" is required.');
  if (query.length > 120) throw new HttpError(400, 'Search query is too long.');
  const { html } = await getHtml(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
  const results = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(m[1]);
    const href = absoluteUrl(a.href);
    const title = (a.title || decodeText(m[2])).replace(/\s+/g, ' ').trim();
    if (!href || !isSinhalaSubUrl(href) || !new URL(href).pathname.includes('/movies/') || title.length <= 3 || seen.has(href)) continue;
    const imgTag = m[2].match(/<img\b[^>]*>/i)?.[0] || '';
    const img = attrs(imgTag);
    const poster = absoluteUrl(img['data-src'] || img.src || img['data-lazy-src'] || '');
    seen.add(href);
    results.push({ title, url: href, poster });
  }
  return { creator: '@pasidueshan', success: true, query, results };
}
async function getMovieDetails(p) {
  const url = absoluteUrl(p.url);
  if (!url || !isSinhalaSubUrl(url) || !new URL(url).pathname.includes('/movies/')) {
    throw new HttpError(400, 'A valid SinhalaSub movie page URL is required.');
  }
  const { html, finalUrl } = await getHtml(url);
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0]));
  const og = meta.find(a => a.property?.toLowerCase() === 'og:image');
  const desc = meta.find(a => a.property?.toLowerCase() === 'og:description');
  const posterFallback = html.match(/<(?:img)\b[^>]*(?:class=["'][^"']*(?:poster|thumbnail)[^"']*["'])[^>]*>/i);
  const posterAttr = attrs(posterFallback?.[0] || '');
  const downloadLinks = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(m[1]);
    const href = absoluteUrl(a.href, finalUrl);
    if (!href || !isLandingPage(href) || seen.has(href)) continue;
    seen.add(href);
    downloadLinks.push({ text: decodeText(m[2]) || 'Download Link', url: href });
  }
  return {
    creator: '@pasidueshan',
    success: true,
    query: url,
    result: {
      page: finalUrl,
      title: findTitle(html),
      poster: absoluteUrl(og?.content || posterAttr.src || posterAttr['data-src'] || ''),
      synopsis: decodeText(desc?.content || '') || null,
      downloadLinks
    }
  };
}
async function resolvePublicDownload(p) {
  const url = absoluteUrl(p.url);
  if (!url || !isLandingPage(url)) throw new HttpError(400, 'A valid SinhalaSub /links/ page URL is required.');
  const { html, finalUrl } = await getHtml(url);
  const postIdMatch = html.match(/(?:post_id|postId)["'\s:=]+([0-9]{3,})/i);
  const input = [...html.matchAll(/<(?:input)\b[^>]*>/gi)].map(m => attrs(m[0]));
  const postId = input.find(a => ['post_id', 'postId'].includes(a.name))?.value
    || html.match(/data-post-id=["']([^"']+)["']/i)?.[1]
    || postIdMatch?.[1]
    || null;
  const downloadUrl = extractPublicMediaUrl(html, finalUrl);
  const fileName = downloadUrl ? decodeURIComponent(new URL(downloadUrl).pathname.split('/').pop()) : null;
  return {
    creator: '@pasidueshan',
    success: true,
    query: url,
    result: { page: finalUrl, title: findTitle(html), postId, waitTime: 6, fileName, downloadUrl, found: Boolean(downloadUrl) }
  };
}
export default [
  { path: '/api/movie/search', category: 'Movie', name: 'SinhalaSub search', cost: 1, desc: 'Search SinhalaSub movies', params: [param('q', 'Avatar', 'Movie search query')], run: searchMovies },
  { path: '/api/movie/details', category: 'Movie', name: 'SinhalaSub details', cost: 1, desc: 'Get SinhalaSub movie details and download link pages', params: [param('url', 'https://sinhalasub.lk/movies/example/', 'SinhalaSub movie page URL')], run: getMovieDetails },
  { path: '/api/movie/download', category: 'Movie', name: 'SinhalaSub download', cost: 1, desc: 'Resolve a public download URL from a SinhalaSub link page', params: [param('url', 'https://sinhalasub.lk/links/example/', 'SinhalaSub link-page URL')], run: resolvePublicDownload }
];
