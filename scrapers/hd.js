// HD video finder: one endpoint, every supported site. Returns the BEST quality direct link plus every other quality,
// sorted from highest to lowest, so apps never have to settle for the blurry copy.
// (Direct links come from the platforms' own public data; Vercel never streams the file.)
import { HttpError, fetchT, cached, param } from '../system/util.js';
import { UA, safeUrl } from './_web.js';
import { guard, ytId, ytPlayer, ytFallback, tiktok, social } from './download.js';
import { twitter } from './more_dl.js';

const TIP = 'WhatsApp recompresses every video sent as "Video" or posted as a Status, which is why it turns blurry. '
  + 'To keep the full quality, send the downloaded file as a DOCUMENT (paper-clip > Document) or share the link instead.';

const pack = (platform, title, list, extra = {}) => {
  const qualities = [...list].filter((x) => x?.url).sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));
  if (!qualities.length) throw new HttpError(404, 'No downloadable video found (private, removed, or the site refused this server).');
  return { platform, title: title || null, best: qualities[0], qualities, whatsappTip: TIP, ...extra };
};
const host = (raw) => { try { return new URL(String(raw || '').trim()).hostname.replace(/^(www|m|mobile|web)\./, ''); } catch { throw new HttpError(400, 'url must be a full link (https://...).'); } };
const on = (h, ...d) => d.some((x) => h === x || h.endsWith('.' + x));

// Backup path (YouTube blocked this server): public mirrors give every quality; cobalt / Apify give one file.
async function ytBackup(p, env, id) {
  const f = await ytFallback(env, id, 'video');
  const m = f.mirrors, q = (x) => ({ ...x });
  if (m) {
    const r = pack('youtube', m.title, m.video.length ? m.video : m.videoOnly.map(q));
    const top = [...m.videoOnly].sort((a, b) => b.height - a.height)[0], audio = [...m.audio].sort((a, b) => b.bitrate - a.bitrate)[0] || null;
    return { ...r, ...(top && top.height > (r.best.height || 0) ? { highestVideoOnly: top, note: `${top.quality} exists but has no sound: merge highestVideoOnly + bestAudio with ffmpeg.` } : {}), bestAudio: audio, via: 'mirror' };
  }
  return pack('youtube', f.title, [{ quality: f.height ? f.height + 'p' : 'video', height: f.height || 0, mime: 'video/mp4', hasAudio: true, filesize: f.filesize, url: f.url }], { via: 'backup downloader' });
}
async function yt(p, env = {}) {
  const id = ytId(p.url);
  let d; try { d = await ytPlayer(id); } catch { return ytBackup(p, env, id); }
  const st = d.playabilityStatus?.status;
  if (st === 'ERROR' || st === 'UNPLAYABLE') throw new HttpError(404, 'Video not found or not available.');
  const sd = d.streamingData || {};
  if (st === 'LOGIN_REQUIRED' || ![...(sd.formats || []), ...(sd.adaptiveFormats || [])].some((f) => f.url)) return ytBackup(p, env, id);
  const q = (f, hasAudio) => ({ quality: f.qualityLabel || (f.height ? f.height + 'p' : f.audioQuality || 'audio'), height: f.height || 0, width: f.width || null, fps: f.fps || null, mime: String(f.mimeType || '').split(';')[0], bitrate: f.bitrate || 0, filesize: Number(f.contentLength) || null, hasAudio, url: f.url });
  const full = (sd.formats || []).filter((f) => f.url && /^video\/mp4/.test(f.mimeType || '')).map((f) => q(f, true));
  const only = (sd.adaptiveFormats || []).filter((f) => f.url && /^video\/mp4/.test(f.mimeType || '')).map((f) => q(f, false));
  const audio = (sd.adaptiveFormats || []).filter((f) => f.url && /^audio\/mp4/.test(f.mimeType || '')).map((f) => q(f, true)).sort((a, b) => b.bitrate - a.bitrate)[0] || null;
  // `best` = highest quality that already has sound. Higher qualities on YouTube come as video-only streams and must be merged with `bestAudio` (ffmpeg).
  const r = pack('youtube', d.videoDetails?.title, full.length ? full : only);
  const top = [...only].sort((a, b) => b.height - a.height)[0];
  return { ...r, ...(top && top.height > (r.best.height || 0) ? { highestVideoOnly: top, bestAudio: audio, note: `${top.quality} exists but has no sound: merge highestVideoOnly + bestAudio with ffmpeg.` } : {}), bestAudio: audio };
}

async function tt(p) {
  const o = await tiktok({ ...p, type: 'video' });
  return pack('tiktok', o.download.title, [{ quality: 'HD (original upload)', height: 1080, mime: 'video/mp4', hasAudio: true, url: o.download.url }]);
}

async function tw(p) {
  const t = await twitter(p);
  if (!t.videos.length) throw new HttpError(404, 'This post has no public video.');
  return pack('twitter', t.text, t.videos.map((v) => ({ quality: v.height ? v.height + 'p' : 'video', height: v.height || 0, width: v.width || null, mime: 'video/mp4', hasAudio: true, url: v.url })));
}

// Facebook / Instagram: look for the page's own HD file first, fall back to the normal public preview file.
const grab = (html, key) => { const m = html.match(new RegExp('"' + key + '":"([^"]+)"')); if (!m) return null; try { return JSON.parse('"' + m[1] + '"'); } catch { return null; } };
async function fb(p, platform, label, hosts) {
  const url = safeUrl(p.url, hosts), list = [];
  const found = await cached('hd:' + platform + ':' + url, 600, async () => {
    try {
      const r = await fetchT(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow' }, 15000);
      const html = r.ok ? await r.text() : '';
      return { hd: grab(html, 'browser_native_hd_url') || grab(html, 'playable_url_quality_hd') || grab(html, 'hd_src'), sd: grab(html, 'browser_native_sd_url') || grab(html, 'playable_url') || grab(html, 'sd_src') };
    } catch { return {}; }
  });
  if (found.hd) list.push({ quality: 'HD', height: 720, mime: 'video/mp4', hasAudio: true, url: found.hd });
  if (found.sd) list.push({ quality: 'SD', height: 360, mime: 'video/mp4', hasAudio: true, url: found.sd });
  let title = null;
  try { const o = await social(platform, label, hosts)({ ...p, type: 'video' }); title = o.download.title; if (!list.some((x) => x.url === o.download.url)) list.push({ quality: 'Public preview file', height: 1, mime: 'video/mp4', hasAudio: true, url: o.download.url }); }
  catch (e) { if (!list.length) throw e; }
  return pack(platform, title, list);
}

async function hdVideo(p, env = {}) {
  guard(p);
  const h = host(p.url);
  if (on(h, 'youtube.com', 'youtu.be')) return yt(p, env);
  if (on(h, 'tiktok.com')) return tt(p);
  if (on(h, 'twitter.com', 'x.com')) return tw(p);
  if (on(h, 'facebook.com', 'fb.watch')) return fb(p, 'facebook', 'Facebook', ['facebook.com', 'fb.watch']);
  if (on(h, 'instagram.com')) return fb(p, 'instagram', 'Instagram', ['instagram.com']);
  throw new HttpError(400, 'Supported links: YouTube, TikTok, Facebook, Instagram and X (Twitter).');
}

export default [
  { path: '/api/video/hd', category: 'Social', name: 'HD Video Downloader', cost: 2, isNew: true, desc: 'Best-quality video link for YouTube, TikTok, Facebook, Instagram and X, with every quality listed (no WhatsApp-style blur)',
    params: [param('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube / TikTok / Facebook / Instagram / X link'), param('rightsConfirmed', 'true', 'Must be true: you own the media or have permission to download it')], run: hdVideo }
];
