// YouTube per-quality direct links: 144p, 240p, 360p, 480p, 720p, 1080p (+ best audio) in ONE call.
// Links come from the same sources as /api/yt/mp4-dl (player API first, public mirrors / cobalt / Apify as backup).
// Note: YouTube serves 480p and above mostly as VIDEO-ONLY files. Those rows have hasAudio=false and need `audio` merged (ffmpeg).
import { HttpError, param } from '../system/util.js';
import { guard, ytId, ytPlayer, ytFallback } from './download.js';

const TARGETS = [144, 240, 360, 480, 720, 1080];
const RIGHTS = param('rightsConfirmed', 'true', 'Must be true: you own the media or have permission to download it');

const row = (f, hasAudio) => ({
  quality: (f.height || 0) + 'p', height: f.height || 0, fps: f.fps || null,
  mime: String(f.mimeType || f.mime || 'video/mp4').split(';')[0], hasAudio,
  filesize: Number(f.contentLength || f.filesize) || null, url: f.url
});

// Best file for each wanted height: a file WITH sound is preferred, otherwise the video-only file (flagged).
function pickQualities(full, only) {
  const out = [];
  for (const h of TARGETS) {
    const withSound = full.filter((x) => x.height === h).sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];
    const silent = only.filter((x) => x.height === h).sort((a, b) => (b.fps || 0) - (a.fps || 0) || (b.filesize || 0) - (a.filesize || 0))[0];
    const pick = withSound || silent;
    if (pick) out.push({ ...pick, needsAudioMerge: !pick.hasAudio });
  }
  return out;
}

async function ytQuality(p, env = {}) {
  guard(p);
  const id = ytId(p.url);
  let title = null, full = [], only = [], audio = null, via = 'player';

  let d = null;
  try { d = await ytPlayer(id); } catch (e) { if (e?.code === 'YOUTUBE_ACCESS_RESTRICTED') throw e; }
  const st = d?.playabilityStatus?.status;
  if (st === 'ERROR' || st === 'UNPLAYABLE') throw new HttpError(404, 'Video not found or not available.');
  const sd = d?.streamingData || {};
  const mp4 = (f) => f.url && /^video\/mp4/.test(f.mimeType || '');

  if (d && [...(sd.formats || []), ...(sd.adaptiveFormats || [])].some((f) => f.url)) {
    title = d.videoDetails?.title || null;
    full = (sd.formats || []).filter(mp4).map((f) => row(f, true));
    only = (sd.adaptiveFormats || []).filter(mp4).map((f) => row(f, false));
    const a = (sd.adaptiveFormats || []).filter((f) => f.url && /^audio\/mp4/.test(f.mimeType || '')).sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0))[0];
    if (a) audio = { quality: 'audio', mime: 'audio/mp4', bitrate: a.bitrate || 0, filesize: Number(a.contentLength) || null, url: a.url };
  } else {
    via = 'backup';
    const f = await ytFallback(env, id, 'video'); // throws a clear 503 when every backup failed
    const m = f.mirrors;
    if (m) {
      title = m.title;
      const nm = (x, hasAudio) => row({ ...x, height: x.height || parseInt(x.quality) || 0 }, hasAudio);
      full = m.video.map((x) => nm(x, true));
      only = m.videoOnly.map((x) => nm(x, false));
      const a = [...m.audio].sort((x, y) => y.bitrate - x.bitrate)[0];
      if (a) audio = { quality: 'audio', mime: 'audio/mp4', bitrate: a.bitrate || 0, filesize: a.filesize || null, url: a.url };
    } else { // cobalt / Apify return ONE file only
      title = f.title;
      full = [row({ height: f.height || 720, mime: 'video/mp4', filesize: f.filesize, url: f.url }, true)];
    }
  }

  const qualities = pickQualities(full, only);
  if (!qualities.length) throw new HttpError(404, 'No downloadable MP4 qualities were found for this video.');
  const missing = TARGETS.filter((h) => !qualities.some((q) => q.height === h)).map((h) => h + 'p');
  return {
    platform: 'youtube', id, title, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, via,
    qualities, audio,
    ...(missing.length ? { unavailable: missing } : {}),
    note: 'Rows with needsAudioMerge=true are video-only (YouTube splits HD this way): download them together with `audio` and merge with ffmpeg. 360p / 720p rows (when listed with hasAudio=true) play with sound directly.'
  };
}

export default [
  { path: '/api/yt/quality', remote: undefined, category: 'Social', name: 'YouTube All Qualities', cost: 2, isNew: true,
    desc: 'Direct links for 144p, 240p, 360p, 480p, 720p and 1080p of a public YouTube video, plus the best audio file',
    params: [param('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube link'), RIGHTS], run: ytQuality }
];
