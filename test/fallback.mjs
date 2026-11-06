// Offline test for the new YouTube backup chain and Apify-first social routing. Run: node test/fallback.mjs
import { youtube } from '../scrapers/download.js';
import hd from '../scrapers/hd.js';
import apify from '../scrapers/apify.js';
let fail = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++; };
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
let calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url || input); calls.push(url);
  if (url.includes('youtube.com/youtubei/v1/player')) return j({ playabilityStatus: { status: 'LOGIN_REQUIRED' } });
  if (url.includes('pipedapi.kavin.rocks/streams/')) return j({}, 500);
  if (url.includes('pipedapi.adminforge.de/streams/')) return j({ title: 'Mirror vid', videoStreams: [{ url: 'https://m/360.mp4', mimeType: 'video/mp4', quality: '360p', height: 360, videoOnly: false }, { url: 'https://m/720.mp4', mimeType: 'video/mp4', quality: '720p', height: 720, videoOnly: false }, { url: 'https://m/1080.mp4', mimeType: 'video/mp4', quality: '1080p', height: 1080, videoOnly: true }], audioStreams: [{ url: 'https://m/a.m4a', mimeType: 'audio/mp4', bitrate: 128000 }] });
  if (url.includes('api.apify.com')) {
    const body = JSON.parse(init.body);
    if (url.includes('youtube-video-downloader')) return j([{ status: 'SUCCESS', title: 'Apify vid', downloadUrl: 'https://apify/x.mp4', ext: 'mp4', fileSizeMb: 2, resolution: '720p' }]);
    return j([{ from: 'apify', body }]);
  }
  return j({}, 403);
};
const P = { url: 'https://youtu.be/dQw4w9WgXcQ', rightsConfirmed: 'true' };
let r = await youtube(P, {});
ok('mirror gives best sound-included mp4', r.download.url === 'https://m/720.mp4');
r = await youtube({ ...P, type: 'audio' }, {});
ok('mirror audio', r.download.url === 'https://m/a.m4a' && r.download.type === 'audio');
// mirrors dead -> Apify
const dead = globalThis.fetch;
globalThis.fetch = async (input, init) => { const u = String(input?.url || input); return u.includes('pipedapi') || u.includes('inv.') || u.includes('yewtu') || u.includes('invidious') ? j({}, 500) : dead(input, init); };
r = await youtube({ ...P, url: 'https://youtu.be/aaaaaaaaaaa' }, { APIFY_TOKEN: 't' });
ok('apify downloader backup', r.download.url === 'https://apify/x.mp4');
let e; try { await youtube({ ...P, url: 'https://youtu.be/bbbbbbbbbbb' }, {}); } catch (x) { e = x; }
ok('nothing works -> clear 503', e?.status === 503 && /COBALT_API_URL/.test(e.message));
globalThis.fetch = dead;
const hdep = hd[0]; const h = await hdep.run({ ...P, url: 'https://youtu.be/cccccccccc1' }, {});
ok('HD endpoint lists qualities via mirror', h.best.height === 720 && h.highestVideoOnly?.height === 1080 && h.bestAudio?.url === 'https://m/a.m4a');
// Apify-first for instagram hashtag / tiktok comments
calls = [];
const ep = (p) => apify.find((x) => x.path === p);
let res = await ep('/api/social/instagram/hashtag').run({ tag: 'srilanka' }, { APIFY_TOKEN: 't' });
ok('instagram hashtag uses Apify first', res.items[0].from === 'apify' && calls.every((c) => c.includes('apify')));
res = await ep('/api/social/tiktok/comments').run({ url: 'https://www.tiktok.com/@a/video/1' }, { APIFY_TOKEN: 't' });
ok('tiktok comments uses Apify first', res.items[0].from === 'apify');
console.log(fail ? 'FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
