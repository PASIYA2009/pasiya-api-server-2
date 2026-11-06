// More downloader / info endpoints (all keyless, public sources). Each returns direct links; Vercel never streams the file.
// YouTube / TikTok / Facebook / Instagram reuse the same code as /api/scraper/<site>/download (so they share the same rightsConfirmed rule).
import { HttpError, fetchT, cached, param } from '../system/util.js';
import { UA, safeUrl, page, meta } from './_web.js';
import { youtube, tiktok, social, ytId, guard, out } from './download.js';

const RIGHTS = param('rightsConfirmed', 'true', 'Must be true: you own the media or have permission to download it');
const withType = (fn, type) => (p) => fn({ ...p, type });

// ---- YouTube thumbnails: plain image links on YouTube's own image host (no key, always works for public videos) ----
async function ytThumb(p) {
  const id = ytId(p.url);
  const sizes = [['maxres', 'maxresdefault', '1280x720'], ['sd', 'sddefault', '640x480'], ['hq', 'hqdefault', '480x360'], ['mq', 'mqdefault', '320x180'], ['default', 'default', '120x90']];
  return { id, thumbnails: sizes.map(([name, f, res]) => ({ name, resolution: res, url: `https://i.ytimg.com/vi/${id}/${f}.jpg` })), note: 'maxres only exists for HD videos; use hq as a safe default.' };
}

// ---- X / Twitter: public post media through the open fxtwitter API ----
export async function twitter(p) {
  guard(p);
  const url = new URL(safeUrl(p.url, ['twitter.com', 'x.com', 'mobile.twitter.com']));
  const m = url.pathname.match(/^\/([\w]{1,15})\/status\/(\d{5,25})/);
  if (!m) throw new HttpError(400, 'Use a post link like https://x.com/user/status/123456789.');
  const t = await cached('tw:' + m[2], 600, async () => {
    const r = await fetchT(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, { headers: { 'User-Agent': UA } }, 15000);
    if (r.status === 404) throw new HttpError(404, 'Post not found or not public.');
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.tweet) throw new HttpError(502, 'The X lookup service is not answering right now.');
    return d.tweet;
  });
  const videos = (t.media?.videos || []).map((v) => ({ url: v.url, thumbnail: v.thumbnail_url || null, width: v.width || null, height: v.height || null, type: v.type || 'video' }));
  const photos = (t.media?.photos || []).map((x) => ({ url: x.url }));
  if (!videos.length && !photos.length) throw new HttpError(404, 'This post has no public video or photo.');
  return { platform: 'twitter', author: t.author?.screen_name || m[1], text: t.text || null, videos, photos };
}

// ---- Pinterest: the pin page's own preview tags (original-size image, video when the pin has one) ----
async function pinterest(p) {
  guard(p);
  const url = safeUrl(p.url, ['pinterest.com', 'pin.it']);
  const info = await cached('pin:' + url, 900, async () => {
    const html = await page(url);
    const image = meta(html, 'og:image'), video = meta(html, 'og:video:secure_url') || meta(html, 'og:video') || meta(html, 'twitter:player:stream');
    if (!image && !video) throw new HttpError(404, 'No public media found on this pin (private, removed or login required).');
    return { title: meta(html, 'og:title'), description: meta(html, 'og:description'), image: image ? image.replace(/\/\d+x\d*\//, '/originals/') : null, video };
  });
  return { platform: 'pinterest', ...info };
}

// ---- Pixeldrain: official public API (file info + direct link) ----
async function pixeldrain(p) {
  const raw = String(p.url || p.id || '').trim();
  const id = raw.match(/pixeldrain\.(?:com|net|dev)\/(?:u|api\/file)\/([A-Za-z0-9]{6,16})/)?.[1] || (/^[A-Za-z0-9]{6,16}$/.test(raw) ? raw : null);
  if (!id) throw new HttpError(400, 'Use a Pixeldrain file link like https://pixeldrain.com/u/abc12345 (or just the id).');
  const f = await cached('pd:' + id, 600, async () => {
    const r = await fetchT(`https://pixeldrain.com/api/file/${id}/info`, { headers: { 'User-Agent': UA } }, 12000);
    if (r.status === 404) throw new HttpError(404, 'File not found or removed.');
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw new HttpError(502, d.message || 'Pixeldrain is not answering right now.');
    return d;
  });
  return { id, name: f.name, size: f.size, mimeType: f.mime_type, views: f.views ?? null, downloads: f.downloads ?? null, uploaded: f.date_upload || null, page: `https://pixeldrain.com/u/${id}`, download: `https://pixeldrain.com/api/file/${id}?download`, thumbnail: `https://pixeldrain.com/api/file/${id}/thumbnail` };
}

// ---- Spotify: public track / album / playlist details through Spotify's official oEmbed (metadata only, no audio) ----
async function spotify(p) {
  const url = safeUrl(p.url, ['spotify.com']);
  if (!/\/(track|album|playlist|episode|show|artist)\//.test(url)) throw new HttpError(400, 'Use a Spotify track / album / playlist link.');
  const o = await cached('sp:' + url, 3600, async () => {
    const r = await fetchT('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { headers: { 'User-Agent': UA } }, 12000);
    if (r.status === 404 || r.status === 400) throw new HttpError(404, 'Not found on Spotify.');
    if (!r.ok) throw new HttpError(502, 'Spotify is not answering right now.');
    return r.json();
  });
  return { title: o.title, thumbnail: o.thumbnail_url, type: url.match(/\/(track|album|playlist|episode|show|artist)\//)[1], url, embedHtml: o.html, note: 'Metadata only. Spotify audio is DRM protected and is not downloadable.' };
}

const L = (ex) => [param('url', ex, 'Public link'), RIGHTS];
export default [
  { path: '/api/yt/mp4-dl', category: 'Social', name: 'YouTube MP4 DL', cost: 2, isNew: true, desc: 'Direct MP4 link for a public YouTube video (best available quality)', params: [param('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube link'), RIGHTS], run: withType(youtube, 'video') },
  { path: '/api/yt/mp3-dl', category: 'Social', name: 'YouTube MP3 DL', cost: 2, isNew: true, desc: 'Direct audio link (m4a) for a public YouTube video', params: [param('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube link'), RIGHTS], run: withType(youtube, 'audio') },
  { path: '/api/yt/thumbnail-dl', category: 'Social', name: 'YouTube Thumbnail DL', cost: 0, isNew: true, desc: 'All thumbnail sizes (max-res to small) with direct image links', params: [param('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube link')], run: ytThumb },
  { path: '/api/tiktok/dl', category: 'Social', name: 'TikTok DL', cost: 2, isNew: true, desc: 'Direct links for a public TikTok video (HD) or its MP3 (type=audio)', params: [...L('https://www.tiktok.com/@scout2015/video/6718335390845095173'), param('type', 'video', 'video or audio', false)], run: tiktok },
  { path: '/api/facebook/dl', category: 'Social', name: 'Facebook DL', cost: 2, isNew: true, desc: 'Direct link for a public Facebook video', params: L('https://www.facebook.com/watch/?v=10153231379946729'), run: social('facebook', 'Facebook', ['facebook.com', 'fb.watch']) },
  { path: '/api/instagram/dl', category: 'Social', name: 'Instagram DL', cost: 2, isNew: true, desc: 'Direct link for a public Instagram reel / video', params: L('https://www.instagram.com/p/fA9uwTtkSN/'), run: social('instagram', 'Instagram', ['instagram.com']) },
  { path: '/api/pinterest/dl', category: 'Social', name: 'Pinterest DL', cost: 2, isNew: true, desc: 'Pinterest pin image (original size) or video link', params: L('https://www.pinterest.com/pin/99360735500167749/'), run: pinterest },
  { path: '/api/twitter', category: 'Social', name: 'Twitter Video', cost: 2, isNew: true, desc: 'Download videos and photos from a public X / Twitter post', params: L('https://x.com/jack/status/20'), run: twitter },
  { path: '/api/pixeldrain', noProbe: true, category: 'Files', name: 'Pixeldrain', cost: 0, isNew: true, desc: 'File info and direct download link for a Pixeldrain file', params: [param('url', 'https://pixeldrain.com/u/abc12345', 'Pixeldrain file link or id')], run: pixeldrain },
  { path: '/api/spotify', category: 'Search', name: 'Spotify Info', cost: 0, isNew: true, desc: 'Public track / album / playlist details and cover (metadata only)', params: [param('url', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'Spotify link')], run: spotify }
];
