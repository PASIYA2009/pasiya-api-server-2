// Download links for public videos, with NO key and NO yt-dlp, straight from the platforms' public data.
// Each endpoint returns a direct link to the file on the platform's own CDN (Vercel never streams the video itself).
// Best effort: sites change, and YouTube may refuse Vercel's datacenter IPs. For maximum reliability, host the separate
// yt-dlp service (pasiya-scraper-api) and set SCRAPER_URL + SCRAPER_SHARED_SECRET: when set, it answers these instead.
import { HttpError, fetchT, cached, param } from '../system/util.js';
import { UA, safeUrl, ogDetails } from './_web.js';

const truthy = (v) => v === true || v === 'true' || v === '1' || v === 1;
export const guard = (p) => { if (!truthy(p.rightsConfirmed)) throw new HttpError(400, 'Set rightsConfirmed=true only if you own the media or have permission to download it.'); return p.type === 'audio' ? 'audio' : 'video'; };
const safeName = (s) => String(s || 'media').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'media';
export const out = (platform, title, type, ext, url) => ({ platform, download: { title: title || null, filename: `${safeName(title)}.${ext}`, type, ext, filesize: null, url, expiresInSec: null } });

// ---- TikTok: public tikwm.com lookup (free, no key) ----
export async function tiktok(p) {
  const type = guard(p), url = safeUrl(p.url, ['tiktok.com']);
  const d = await cached('dl:tt:' + url, 600, async () => {
    const r = await fetchT('https://www.tikwm.com/api/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, body: new URLSearchParams({ url, hd: '1' }) }, 20000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.code !== 0 || !j.data) throw new HttpError(404, 'Video not found, private, or the lookup service refused it.');
    return j.data;
  });
  const file = type === 'audio' ? d.music : d.hdplay || d.play;
  if (!file) throw new HttpError(404, 'No downloadable file found for this video.');
  return out('tiktok', d.title, type, type === 'audio' ? 'mp3' : 'mp4', file.startsWith('http') ? file : 'https://www.tikwm.com' + file);
}

// ---- Facebook / Instagram: the public video file named in the page's own preview tags ----
export const social = (platform, label, hosts) => async (p) => {
  const type = guard(p), url = safeUrl(p.url, hosts);
  const info = await cached('dl:' + platform + ':' + url, 600, () => ogDetails(url, label));
  if (!info.video) throw new HttpError(404, 'No public video file found (private post, photo post, or login required).');
  if (type === 'audio') throw new HttpError(400, 'Audio-only is not available for this platform. Use type=video.');
  return out(platform, info.title, 'video', 'mp4', info.video);
};

// ---- YouTube: the app-client player API returns direct stream links for most public videos ----
export function ytId(raw) {
  const u = new URL(safeUrl(raw, ['youtube.com', 'youtu.be']));
  const id = u.hostname.endsWith('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1];
  if (!/^[\w-]{11}$/.test(id || '')) throw new HttpError(400, 'Could not find a video id in this YouTube link.');
  return id;
}
// YouTube blocks datacenter IPs for some app clients, so several official app clients are tried one after the other (the first one that gives playable links wins).
const YT_CLIENTS = [
  { id: '28', ver: '1.60.19', ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip', ctx: { clientName: 'ANDROID_VR', clientVersion: '1.60.19', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L', hl: 'en', gl: 'US' } },
  { id: '5', ver: '19.45.4', ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)', ctx: { clientName: 'IOS', clientVersion: '19.45.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.1.0.22B83', hl: 'en', gl: 'US' } },
  { id: '3', ver: '19.09.37', ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip', ctx: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' } }
];
const hasLinks = (d) => [...(d.streamingData?.formats || []), ...(d.streamingData?.adaptiveFormats || [])].some((f) => f.url);
export const ytPlayer = (id) => cached('dl:yt:' + id, 600, async () => {
  let blocked = null;
  for (const c of YT_CLIENTS) {
    try {
      const r = await fetchT('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': c.id, 'X-YouTube-Client-Version': c.ver },
        body: JSON.stringify({ videoId: id, contentCheckOk: true, racyCheckOk: true, context: { client: c.ctx } })
      }, 9000);
      if (!r.ok) continue;
      const d = await r.json();
      if (d.playabilityStatus?.status === 'OK' && hasLinks(d)) return d;
      if (d.playabilityStatus?.status === 'ERROR' || d.playabilityStatus?.status === 'UNPLAYABLE') return d; // real "not available": no need to try other clients
      blocked = blocked || d; // LOGIN_REQUIRED (bot check) or no links: try the next client
    } catch { /* next client */ }
  }
  if (blocked) return blocked;
  throw new HttpError(502, 'YouTube is not answering right now.');
});
// Optional third-party fallback: a cobalt server (self-hosted or any instance you have a key for). Set COBALT_API_URL (+ COBALT_API_KEY).
async function cobalt(env, url, type) {
  const r = await fetchT(env.COBALT_API_URL.replace(/\/$/, '') + '/', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(env.COBALT_API_KEY ? { Authorization: 'Api-Key ' + env.COBALT_API_KEY } : {}) },
    body: JSON.stringify({ url, downloadMode: type === 'audio' ? 'audio' : 'auto', videoQuality: '720' })
  }, 20000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url || !['tunnel', 'redirect'].includes(d.status)) throw new HttpError(502, 'Cobalt fallback failed: ' + (d.error?.code || 'HTTP ' + r.status));
  return d;
}

// ---- YouTube backups when YouTube refuses this server's IP (bot check) ----
// 1) public Piped / Invidious mirrors (no key)  2) cobalt (COBALT_API_URL)  3) Apify downloader actor (APIFY_TOKEN, uses your Apify credits)
const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee', 'https://pipedapi.leptons.xyz'];
const INVIDIOUS = ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de'];
const getJson = async (u) => { try { const r = await fetchT(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 9000); if (r.ok) return await r.json().catch(() => null); } catch { /* next */ } return null; };
const fmt = (o) => ({ quality: o.quality, height: o.height || 0, mime: o.mime, bitrate: o.bitrate || 0, hasAudio: !!o.hasAudio, filesize: o.filesize || null, url: o.url });
async function ytMirrors(id) {
  for (const h of PIPED) {
    const d = await getJson(`${h}/streams/${id}`);
    if (!d || (!d.videoStreams?.length && !d.audioStreams?.length)) continue;
    const vs = (d.videoStreams || []).filter((s) => s.url && /^video\/mp4/.test(s.mimeType || ''));
    return {
      title: d.title,
      video: vs.filter((s) => !s.videoOnly).map((s) => fmt({ quality: s.quality, height: s.height, mime: 'video/mp4', bitrate: s.bitrate, hasAudio: true, url: s.url })),
      videoOnly: vs.filter((s) => s.videoOnly).map((s) => fmt({ quality: s.quality, height: s.height, mime: 'video/mp4', bitrate: s.bitrate, hasAudio: false, url: s.url })),
      audio: (d.audioStreams || []).filter((s) => s.url && /^audio\/mp4/.test(s.mimeType || '')).map((s) => fmt({ quality: s.quality || 'audio', mime: 'audio/mp4', bitrate: s.bitrate, hasAudio: true, url: s.url }))
    };
  }
  for (const h of INVIDIOUS) {
    const d = await getJson(`${h}/api/v1/videos/${id}?local=true`);
    if (!d || (!d.formatStreams?.length && !d.adaptiveFormats?.length)) continue;
    const ad = d.adaptiveFormats || [];
    return {
      title: d.title,
      video: (d.formatStreams || []).filter((s) => s.url && /mp4/.test(s.container || s.type || '')).map((s) => fmt({ quality: s.qualityLabel || s.quality, height: parseInt(s.resolution || s.qualityLabel) || 0, mime: 'video/mp4', hasAudio: true, url: s.url })),
      videoOnly: ad.filter((s) => s.url && /^video\/mp4/.test(s.type || '')).map((s) => fmt({ quality: s.qualityLabel, height: parseInt(s.resolution || s.qualityLabel) || 0, mime: 'video/mp4', bitrate: Number(s.bitrate) || 0, hasAudio: false, url: s.url })),
      audio: ad.filter((s) => s.url && /^audio\/mp4/.test(s.type || '')).map((s) => fmt({ quality: 'audio', mime: 'audio/mp4', bitrate: Number(s.bitrate) || 0, hasAudio: true, url: s.url }))
    };
  }
  return null;
}
async function ytApify(env, id, type) {
  const { runActor } = await import('./apify.js');
  const items = await runActor(env.YT_APIFY_ACTOR || 'mrdoe~youtube-video-downloader', { startUrls: [{ url: `https://www.youtube.com/watch?v=${id}` }], quality: type === 'audio' ? 'audio' : '720p', maxItems: 1, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] } }, env, 300, 120);
  const it = items.find((x) => x.downloadUrl && (!x.status || x.status === 'SUCCESS'));
  if (!it) throw new HttpError(502, 'Apify downloader gave no file' + (items[0]?.error ? ': ' + items[0].error : '.'));
  return { title: it.title, url: it.downloadUrl, ext: it.ext || (type === 'audio' ? 'mp3' : 'mp4'), filesize: it.fileSizeMb ? Math.round(it.fileSizeMb * 1048576) : null, height: parseInt(it.resolution) || 0 };
}
// One entry point for "the direct player failed": returns { title, url, ext, filesize } for ONE file (type video|audio).
export async function ytFallback(env, id, type) {
  const m = await ytMirrors(id);
  if (m) {
    const pick = type === 'audio' ? [...m.audio].sort((a, b) => b.bitrate - a.bitrate)[0] : [...m.video].sort((a, b) => b.height - a.height)[0];
    if (pick) return { title: m.title, url: pick.url, ext: type === 'audio' ? 'm4a' : 'mp4', filesize: pick.filesize, height: pick.height, mirrors: m };
  }
  const errs = [];
  if (env.COBALT_API_URL) { try { const c = await cobalt(env, `https://www.youtube.com/watch?v=${id}`, type); return { title: null, url: c.url, ext: type === 'audio' ? 'mp3' : 'mp4', filesize: null }; } catch (e) { errs.push(e.message); } }
  if (env.APIFY_TOKEN) { try { return await ytApify(env, id, type); } catch (e) { errs.push(e.message); } }
  throw new HttpError(503, 'YouTube blocked this server and no backup worked' + (errs.length ? ' (' + errs.join('; ') + ')' : '') + '. Set COBALT_API_URL or SCRAPER_URL, or add APIFY_TOKEN (Apify downloader backup).');
}
export async function youtube(p, env = {}) {
  const type = guard(p), id = ytId(p.url);
  const fallback = async () => { const f = await ytFallback(env, id, type); const o = out('youtube', f.title, type, f.ext, f.url); o.download.filesize = f.filesize || null; return o; };
  let d;
  try { d = await ytPlayer(id); } catch { return fallback(); }
  const st = d.playabilityStatus?.status;
  if (st === 'ERROR' || st === 'UNPLAYABLE') throw new HttpError(404, 'Video not found or not available.');
  const sd = d.streamingData || {}, title = d.videoDetails?.title;
  let pick;
  if (type === 'audio') pick = (sd.adaptiveFormats || []).filter((f) => f.url && /^audio\/mp4/.test(f.mimeType || '')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  else pick = (sd.formats || []).filter((f) => f.url && /^video\/mp4/.test(f.mimeType || '')).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  if (!pick) return fallback();
  const o = out('youtube', title, type, type === 'audio' ? 'm4a' : 'mp4', pick.url);
  o.download.filesize = Number(pick.contentLength) || null;
  return o;
}

const DL = (ex) => [param('url', ex, 'Public video link'), param('rightsConfirmed', 'true', 'Must be true: you own the media or have permission to download it'), param('type', 'video', 'video or audio', false)];
const dl = (site, name, ex, what, run) => ({ path: `/api/scraper/${site}/download`, remote: `${site}/download`, category: 'Social', name: `${name} download`, cost: 2, desc: `Download link for ${what}`, params: DL(ex), run });

export default [
  dl('youtube', 'YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'a public video (video or audio)', youtube),
  dl('tiktok', 'TikTok', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', 'a public TikTok video (video or audio)', tiktok),
  dl('facebook', 'Facebook', 'https://www.facebook.com/watch/?v=10153231379946729', 'a public Facebook video', social('facebook', 'Facebook', ['facebook.com', 'fb.watch'])),
  dl('instagram', 'Instagram', 'https://www.instagram.com/p/fA9uwTtkSN/', 'a public Instagram reel / video', social('instagram', 'Instagram', ['instagram.com']))
];
