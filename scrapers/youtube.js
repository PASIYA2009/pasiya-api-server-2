// YouTube: search + public video details (scraped from public pages / oEmbed). Downloads live in download.js.
import { HttpError, fetchT, cached, clamp, param } from '../system/util.js';
import { UA, safeUrl, page } from './_web.js';

const HOSTS = ['youtube.com', 'youtu.be'];
function jsonAfter(html, marker) { // JSON object that follows `marker =` in an inline script
  const i = html.indexOf(marker); if (i < 0) return null;
  const s = html.indexOf('{', i); let depth = 0, str = false, esc = false;
  for (let k = s; k < html.length; k++) {
    const c = html[k];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(s, k + 1)); } catch { return null; } }
  }
  return null;
}
function walk(o, key, out = [], max = 25) {
  if (!o || typeof o !== 'object' || out.length >= max) return out;
  if (Array.isArray(o)) { for (const x of o) walk(x, key, out, max); return out; }
  if (o[key]) out.push(o[key]);
  for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, key, out, max);
  return out;
}
const num = (t) => Number(String(t || '').replace(/[^\d]/g, '')) || 0;
const secs = (t) => String(t || '').split(':').reverse().reduce((a, x, i) => a + Number(x) * 60 ** i, 0) || 0;

async function search(p) {
  const query = String(p.query || p.q || '').trim();
  if (!query || query.length > 200) throw new HttpError(400, 'query is required (max 200 characters).');
  const limit = clamp(p.limit, 1, 10, 5);
  const data = await cached('yts:' + query.toLowerCase(), 900, async () => {
    const html = await page('https://www.youtube.com/results?hl=en&search_query=' + encodeURIComponent(query));
    const vids = walk(jsonAfter(html, 'ytInitialData'), 'videoRenderer', [], 20);
    if (!vids.length) throw new HttpError(502, 'YouTube did not return results right now. Try again shortly.');
    return vids.map((v) => ({
      id: v.videoId, title: v.title?.runs?.map((r) => r.text).join('') || 'Unknown title', url: 'https://www.youtube.com/watch?v=' + v.videoId,
      duration: secs(v.lengthText?.simpleText), uploader: v.ownerText?.runs?.[0]?.text || null, views: num(v.viewCountText?.simpleText),
      published: v.publishedTimeText?.simpleText || null, thumbnail: v.thumbnail?.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
    }));
  });
  return { platform: 'youtube', query, results: data.slice(0, limit).map((v, i) => ({ number: i + 1, ...v })) };
}

async function details(p) {
  const url = safeUrl(p.url, HOSTS);
  const info = await cached('ytd:' + url, 3600, async () => {
    const r = await fetchT('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { headers: { 'User-Agent': UA } }, 12000);
    if ([400, 401, 404].includes(r.status)) throw new HttpError(404, 'Video not found or not public.');
    if (!r.ok) throw new HttpError(502, 'YouTube is not answering right now.');
    const o = await r.json();
    const out = { id: null, title: o.title, description: null, uploader: o.author_name, uploaderUrl: o.author_url, duration: 0, views: 0, likes: 0, webpageUrl: url, thumbnail: o.thumbnail_url, platform: 'Youtube' };
    try { // best-effort extras from the watch page
      const pr = jsonAfter(await page(url), 'ytInitialPlayerResponse')?.videoDetails;
      if (pr) Object.assign(out, { id: pr.videoId, description: pr.shortDescription || null, duration: Number(pr.lengthSeconds) || 0, views: Number(pr.viewCount) || 0 });
    } catch { /* oEmbed data is enough */ }
    return out;
  });
  return { platform: 'youtube', info };
}

export default [
  { path: '/api/scraper/youtube/search', remote: 'youtube/search', category: 'Social', name: 'YouTube search', cost: 1, desc: 'Search public YouTube videos', params: [param('query', 'sinhala songs', 'Search text'), param('limit', '5', 'Max 10', false)], run: search },
  { path: '/api/scraper/youtube/details', remote: 'youtube/details', category: 'Social', name: 'YouTube details', cost: 1, desc: 'Public video metadata', params: [param('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Public page / video URL')], run: details }
];
