// More keyless downloader endpoints: Streamable, Vimeo, Reddit. Each returns direct file links (Vercel/Workers never stream the file).
// Same rightsConfirmed rule as every other download endpoint. Best effort: public posts / videos only.
import { HttpError, fetchT, cached, param } from '../system/util.js';
import { UA, safeUrl } from './_web.js';
import { guard } from './download.js';

const RIGHTS = param('rightsConfirmed', 'true', 'Must be true: you own the media or have permission to download it');
const abs = (u) => (String(u || '').startsWith('//') ? 'https:' + u : u);
const byHeight = (list) => [...list].filter((x) => x?.url).sort((a, b) => (b.height || 0) - (a.height || 0));
const getJson = async (url, headers = {}, ms = 15000) => {
  const r = await fetchT(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, redirect: 'follow' }, ms);
  return { r, d: await r.json().catch(() => null) };
};

// ---- Streamable: public JSON by shortcode ----
async function streamable(p) {
  guard(p);
  const u = new URL(safeUrl(p.url, ['streamable.com']));
  const code = u.pathname.split('/').filter(Boolean).pop();
  if (!/^[a-z0-9]{3,12}$/i.test(code || '')) throw new HttpError(400, 'Use a link like https://streamable.com/abc123.');
  const d = await cached('st:' + code, 600, async () => {
    const { r, d } = await getJson('https://api.streamable.com/videos/' + code);
    if (r.status === 404) throw new HttpError(404, 'Video not found or removed.');
    if (!r.ok || !d?.files) throw new HttpError(502, 'Streamable is not answering right now.');
    return d;
  });
  const qualities = byHeight(Object.entries(d.files).filter(([, f]) => f?.url).map(([k, f]) => ({ quality: f.height ? f.height + 'p' : k, label: k, height: f.height || 0, width: f.width || null, filesize: f.size || null, mime: 'video/mp4', hasAudio: true, url: abs(f.url) })));
  if (!qualities.length) throw new HttpError(404, 'No downloadable file found for this video.');
  return { platform: 'streamable', title: d.title || null, thumbnail: abs(d.thumbnail_url) || null, best: qualities[0], qualities };
}

// ---- Vimeo: public player config (progressive MP4 files, with sound) ----
async function vimeo(p) {
  guard(p);
  const u = new URL(safeUrl(p.url, ['vimeo.com']));
  const id = u.pathname.match(/\/(\d{5,12})(?:\/|$)/)?.[1];
  if (!id) throw new HttpError(400, 'Use a link like https://vimeo.com/123456789.');
  const d = await cached('vm:' + id, 600, async () => {
    const { r, d } = await getJson(`https://player.vimeo.com/video/${id}/config`, { Referer: 'https://vimeo.com/' });
    if (r.status === 404) throw new HttpError(404, 'Video not found.');
    if (r.status === 403) throw new HttpError(403, 'This Vimeo video is private or embed-restricted.');
    if (!r.ok || !d?.request?.files) throw new HttpError(502, 'Vimeo is not answering right now.');
    return d;
  });
  const prog = d.request.files.progressive || [];
  const qualities = byHeight(prog.map((f) => ({ quality: f.quality || (f.height ? f.height + 'p' : 'video'), height: f.height || 0, width: f.width || null, fps: f.fps || null, mime: f.mime || 'video/mp4', hasAudio: true, url: f.url })));
  if (!qualities.length) throw new HttpError(404, 'No direct MP4 file for this video (it may only offer streaming).');
  return { platform: 'vimeo', id, title: d.video?.title || null, uploader: d.video?.owner?.name || null, duration: d.video?.duration || 0, thumbnail: d.video?.thumbs?.base || null, best: qualities[0], qualities };
}

// ---- Reddit: public post JSON. Reddit hosts video and sound separately (video-only + audio file). ----
async function reddit(p) {
  guard(p);
  const u = new URL(safeUrl(p.url, ['reddit.com', 'redd.it']));
  const clean = u.hostname.endsWith('redd.it') ? u.toString() : u.origin + u.pathname.replace(/\/+$/, '') + '.json?raw_json=1';
  const post = await cached('rd:' + clean, 600, async () => {
    const { r, d } = await getJson(clean);
    if (r.status === 404) throw new HttpError(404, 'Post not found or removed.');
    if (r.status === 403 || r.status === 429) throw new HttpError(503, 'Reddit refused this server right now. Try again later.');
    const x = Array.isArray(d) ? d[0]?.data?.children?.[0]?.data : null;
    if (!r.ok || !x) throw new HttpError(502, 'Reddit is not answering right now (use a full post link: reddit.com/r/.../comments/...).');
    return x;
  });
  const rv = post.secure_media?.reddit_video || post.media?.reddit_video || post.crosspost_parent_list?.[0]?.secure_media?.reddit_video;
  if (!rv?.fallback_url) throw new HttpError(404, 'This post has no Reddit-hosted video.');
  const video = rv.fallback_url.split('?')[0];
  const base = video.replace(/\/[^/]+$/, '');
  return {
    platform: 'reddit', title: post.title || null, subreddit: post.subreddit_name_prefixed || null, author: post.author || null,
    video: { quality: (rv.height || 0) + 'p', height: rv.height || 0, width: rv.width || null, hasAudio: false, duration: rv.duration || 0, url: video },
    audio: rv.has_audio === false ? null : { url: base + '/DASH_AUDIO_128.mp4', fallbackUrl: base + '/DASH_audio.mp4' },
    hls: rv.hls_url || null,
    note: 'Reddit stores video and sound separately: download `video` and `audio`, then merge with ffmpeg. `hls` is a ready streaming playlist that already has sound.'
  };
}

export default [
  { path: '/api/streamable/dl', category: 'Social', name: 'Streamable DL', cost: 2, isNew: true, desc: 'Direct MP4 links (every quality) for a public Streamable video', params: [param('url', 'https://streamable.com/moo', 'Streamable link'), RIGHTS], run: streamable },
  { path: '/api/vimeo/dl', category: 'Social', name: 'Vimeo DL', cost: 2, isNew: true, desc: 'Direct MP4 links (360p to 1080p) for a public Vimeo video', params: [param('url', 'https://vimeo.com/76979871', 'Vimeo link'), RIGHTS], run: vimeo },
  { path: '/api/reddit/dl', category: 'Social', name: 'Reddit Video DL', cost: 2, isNew: true, desc: 'Video + audio file links for a Reddit-hosted video post', params: [param('url', 'https://www.reddit.com/r/videos/comments/abc123/example/', 'Reddit post link'), RIGHTS], run: reddit }
];
