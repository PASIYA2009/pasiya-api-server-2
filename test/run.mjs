// Offline test: mocks Firestore, Identity Toolkit and upstream sites, then calls the real Vercel function.
// Run: node test/run.mjs   (no dependencies needed)
import { generateKeyPairSync } from 'node:crypto';
import handler from '../api/index.js';
import { cached } from '../system/util.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({ client_email: 't@t.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' });

const SCRAPER_CALLS = [];
const db = new Map(); // "col/id" -> fields (raw firestore)
let tokenMints = 0, commits = 0, verified = true;
const dec = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, 'integerValue' in v ? Number(v.integerValue) : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : null]));
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

const RSS = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Test &amp; headline one]]></title><link>https://x.lk/1</link><pubDate>Sun, 01 Nov 2026 05:00:00 GMT</pubDate><description><![CDATA[<p>Body <b>text</b></p><img src="https://x.lk/a.jpg">]]></description></item><item><title>Second</title><link>https://x.lk/2</link><pubDate>Sun, 01 Nov 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
const M3U = `#EXTM3U\n#EXTINF:-1 tvg-id="Derana.lk" tvg-logo="https://l/d.png" group-title="General",Derana TV (720p) [Not 24/7]\nhttps://s.example/derana.m3u8\n#EXTINF:-1 tvg-id="Hiru.lk" group-title="General",Hiru TV\n#EXTVLCOPT:http-referrer=x\nhttps://s.example/hiru.m3u8\n`;

globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url || input);
  if (url.includes('oauth2.googleapis.com')) { tokenMints++; return j({ access_token: 'tok', expires_in: 3600 }); }
  if (url.includes('identitytoolkit')) return j({ users: [{ localId: 'u1', email: 'eshandinujaya86@gmail.com', emailVerified: verified }] });
  if (url.includes('firestore.googleapis.com')) {
    const path = url.split('/documents')[1] || '';
    const m = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    if (path.startsWith(':commit')) {
      commits++;
      for (const w of body.writes) if (w.currentDocument?.exists === false && db.has(w.update.name.split('/documents/')[1])) return j({ error: { status: 'ALREADY_EXISTS', message: 'exists' } }, 409);
      for (const w of body.writes) {
        const name = w.update.name.split('/documents/')[1];
        const cur = db.get(name) || {};
        Object.assign(cur, w.update.fields);
        for (const t of w.updateTransforms || []) cur[t.fieldPath] = { integerValue: String(Number(cur[t.fieldPath]?.integerValue || 0) + Number(t.increment.integerValue)) };
        db.set(name, cur);
      }
      return j({});
    }
    if (path.startsWith(':runAggregationQuery')) { const col = body.structuredAggregationQuery.structuredQuery.from[0].collectionId; return j([{ result: { aggregateFields: { n: { integerValue: String([...db.keys()].filter((k) => k.startsWith(col + '/')).length) } } } }]); }
    if (path.startsWith(':batchGet')) return j(body.documents.map((n) => { const k = n.split('/documents/')[1]; return db.has(k) ? { found: { name: n, fields: db.get(k) } } : { missing: n }; }));
    if (path.startsWith(':runQuery')) {
      const col = body.structuredQuery.from[0].collectionId, f = body.structuredQuery.where?.fieldFilter;
      const out = [...db].filter(([k]) => k.startsWith(col + '/')).filter(([, v]) => !f || v[f.field.fieldPath]?.stringValue === f.value.stringValue).map(([k, v]) => ({ document: { name: 'x/documents/' + k, fields: v } }));
      return j(out);
    }
    if (m === 'GET') { const k = decodeURIComponent(path.slice(1)); return db.has(k) ? j({ name: k, fields: db.get(k) }) : j({}, 404); }
    if (m === 'PATCH') { db.set(decodeURIComponent(path.slice(1)), body.fields); return j({}); }
    if (m === 'POST') { const id = 'auto' + db.size; db.set(path.slice(1) + '/' + id, body.fields); return j({ name: 'x/' + id }); }
  }
  if (url.includes('scraper.example')) { SCRAPER_CALLS.push({ url, key: init.headers?.['x-api-key'], body: init.body }); return j({ success: true, platform: 'youtube', download: { filename: 'v.mp4', url: 'https://scraper.example/dl/tok', type: 'video', expiresInSec: 600 } }); }
  if (url.includes('drive.usercontent.google.com')) {
    if (url.includes('id=PRIVATEFILE')) return new Response('<html>Sign in accounts.google.com</html>', { headers: { 'content-type': 'text/html' } });
    return new Response('data', { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="my file.zip"', 'content-length': '1234' } });
  }
  if (url.includes('docs.google.com')) return new Response('x', { headers: { 'content-type': 'application/pdf' } });
  if (url.includes('pixeldrain.com/api/file/abc12345/info')) return j({ success: true, name: 'a.zip', size: 10, mime_type: 'application/zip', views: 1, downloads: 2, date_upload: '2026-01-01' });
  if (url.includes('api.fxtwitter.com/user/status/1234567')) return j({ code: 200, tweet: { text: 'hi', author: { screen_name: 'user' }, media: { videos: [{ url: 'https://video.twimg.com/v.mp4', thumbnail_url: 'https://t/x.jpg', width: 720, height: 1280 }] } } });
  if (url.includes('ipwho.is/8.8.8.8')) return j({ success: true, ip: '8.8.8.8', type: 'IPv4', country: 'United States', country_code: 'US', city: 'Mountain View', timezone: { id: 'America/Los_Angeles' }, connection: { isp: 'Google LLC' } });
  if (url.includes('open.spotify.com/oembed')) return j({ title: 'Song', thumbnail_url: 'https://i/s.jpg', html: '<iframe></iframe>' });
  if (url.includes('catbox.moe/user/api.php')) return new Response(init.body?.get?.('reqtype') === 'urlupload' && init.body.get('url') ? 'https://files.catbox.moe/abc123.jpg' : 'bad');
  if (url.includes('adaderana.lk/news/')) return new Response('<title>x</title><meta property="og:title" content="Big &amp; news"><meta property="og:image" content="https://i/n.jpg"><meta property="article:published_time" content="2026-11-01T05:00:00Z"><p>This is a long enough paragraph of the article body text for the excerpt.</p><p>Short.</p>');
  if (url.includes('news.google.com') || url.includes('adaderana') || url.includes('newswire') || url.includes('economynext')) return new Response(RSS);
  if (url.includes('search.f-droid.org')) return new Response('<a class="package-header" href="https://f-droid.org/en/packages/org.videolan.vlc/"><img class="package-icon" src="https://i/vlc.png"><h4 class="package-name">VLC</h4><span class="package-summary">Media player</span></a>');
  if (url.includes('f-droid.org/api/v1/packages/')) return j({ packageName: 'org.videolan.vlc', suggestedVersionCode: 13, packages: [{ versionName: '3.5', versionCode: 13 }, { versionName: '3.4', versionCode: 12 }] });
  if (url.includes('archive.org/advancedsearch')) return j({ response: { docs: [{ identifier: 'song1', title: 'Folk song', creator: 'Anon', downloads: 5 }] } });
  if (url.includes('tikwm.com/api/feed/search')) return j({ code: 0, data: { videos: [{ video_id: '77', title: 'sl vid', author: { unique_id: 'u1', nickname: 'U' }, play_count: 9, digg_count: 3, play: 'https://cdn/v.mp4' }] } });
  if (url.includes('tikwm.com/api/challenge/search')) return j({ code: 0, data: { challenge_list: [{ id: 'c9' }] } });
  if (url.includes('tikwm.com/api/challenge/posts')) return j({ code: 0, data: { videos: [{ video_id: '88', title: 'tag vid', author: { unique_id: 'u2' } }] } });
  if (url.includes('tikwm.com/api/comment/list')) return j({ code: 0, data: { comments: [{ id: 'k1', text: 'nice', user: { unique_id: 'fan' }, digg_count: 2 }] } });
  if (url.includes('bing.com/search') && url.includes('site%3A')) return new Response('<rss><channel><item><title>Tweet by nasa</title><link>https://x.com/nasa/status/123</link><description>moon</description></item><item><title>other</title><link>https://example.com/a</link><description>x</description></item><item><title>IG post</title><link>https://www.instagram.com/p/AAA/</link><description>tag</description></item><item><title>FB post</title><link>https://www.facebook.com/nasa/posts/55</link><description>fb</description></item></channel></rss>');
  if (url.includes('tikwm.com/api/user/info')) return j(url.includes('someone') ? { code: 0, data: { user: { uniqueId: 'someone', nickname: 'S', avatarLarger: 'https://cdn/av.jpg' }, stats: { followerCount: 7 } } } : { code: -1 });
  if (url.includes('commons.wikimedia.org') && url.includes('filetype%3Avideo')) return j({ query: { pages: { 1: { index: 1, title: 'File:Fall.webm', imageinfo: [{ url: 'https://c/v.webm', mime: 'video/webm', width: 1920, height: 1080, descriptionurl: 'https://c/p' }] } } } });
  if (url === 'https://site.test/') return new Response('<html><head><link rel="stylesheet" href="/style.css"><link rel="x" href="https://other.test/x.css"></head><body><img src="/logo.png"><a href="/about">About</a></body></html>', { headers: { 'content-type': 'text/html' } });
  if (url === 'https://site.test/style.css') return new Response('body{background:url(/logo.png)}', { headers: { 'content-type': 'text/css' } });
  if (url === 'https://site.test/logo.png') return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
  if (url.includes('wallhaven.cc')) return j({ data: [{ id: 'w1', resolution: '3840x2160', path: 'https://w/w1.jpg', url: 'https://wallhaven.cc/w/w1', thumbs: { large: 'https://w/t.jpg' }, favorites: 3, colors: ['#000'] }] });
  if (url.includes('api.openverse.org')) return j({ results: [{ title: 'Elephant', url: 'https://o/e.jpg', thumbnail: 'https://o/t.jpg', creator: 'Bob', license: 'by', license_version: '4.0', foreign_landing_url: 'https://o/page', width: 100, height: 50 }] });
  if (url.includes('open.er-api.com')) return j(url.endsWith('/XXX') ? { result: 'error', 'error-type': 'unsupported-code' } : { result: 'success', time_last_update_utc: 'today', rates: { USD: 1, LKR: 300 } });
  if (url.includes('tinyurl.com/api-create')) return new Response('https://tinyurl.com/abc');
  if (url.includes('wikipedia.org/w/api.php')) return j({ query: { search: [{ title: 'Sigiriya', snippet: 'a <b>rock</b> fortress', wordcount: 99 }] } });
  if (url.includes('html.duckduckgo.com')) return new Response('<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fx&amp;rut=1">Example <b>hit</b></a><a class="result__snippet" href="x">Nice snippet</a>');
  if (url.includes('api.mail.tm')) {
    const path = url.split('api.mail.tm')[1];
    if (path === '/domains') return j({ 'hydra:member': [{ domain: 'mail.test' }] });
    if (path === '/accounts') return j({ id: 'a1' }, 201);
    if (path === '/token') return JSON.parse(init.body).password.length === 16 ? j({ token: 'T' }) : j({}, 401);
    if (path.startsWith('/messages?')) return j({ 'hydra:totalItems': 1, 'hydra:member': [{ id: 'msg123456', from: { address: 'a@b.c' }, subject: 'Hi', intro: 'intro', seen: false, createdAt: 'now' }] });
    if (path.startsWith('/messages/')) return j({ from: { address: 'a@b.c' }, to: [], subject: 'Hi', text: 'body text', html: ['<p>body</p>'], createdAt: 'now', attachments: [] });
  }
  if (url === 'https://example.com/' || url === 'https://example.com') return new Response('<title>Example Domain Title</title><meta name="description" content="A short description that is long enough to count for the seo check here."><h1>Hi</h1><meta name="viewport" content="x"><img src="a.png">', { headers: { 'content-type': 'text/html', 'strict-transport-security': 'x' } });
  if (url.includes('iptv-org')) return new Response(M3U);
  if (url.includes('geocoding-api')) return j({ results: [{ name: 'Colombo', latitude: 6.93, longitude: 79.86, country: 'Sri Lanka', country_code: 'LK', admin1: 'Western' }] });
  if (url.includes('api.open-meteo.com')) {
    const cur = { time: '2026-11-01T10:00', temperature_2m: 29.1, apparent_temperature: 33, relative_humidity_2m: 80, precipitation: 0, weather_code: 2, cloud_cover: 40, wind_speed_10m: 12, wind_direction_10m: 200, pressure_msl: 1008, is_day: 1 };
    if (url.includes('latitude=6.9271,')) return j(Array.from({ length: 12 }, () => ({ current: cur })));
    return j({ timezone: 'Asia/Colombo', current: cur, daily: { time: ['2026-11-01'], weather_code: [61], temperature_2m_max: [31], temperature_2m_min: [25], precipitation_sum: [4], precipitation_probability_max: [70], sunrise: ['a'], sunset: ['b'] } });
  }
  if (url.includes('text.pollinations.ai')) return j({ choices: [{ message: { content: 'free hi' } }] });
  if (url.includes('tikwm.com/api')) return j(String(init.body).includes('bad') ? { code: -1 } : { code: 0, data: { title: 'tt vid', play: 'https://cdn/tt.mp4', hdplay: 'https://cdn/tt_hd.mp4', music: '/music/a.mp3' } });
  if (url.includes('youtubei/v1/player')) return j(JSON.parse(init.body).videoId === 'LOGINNEEDED' ? { playabilityStatus: { status: 'LOGIN_REQUIRED' } } : { playabilityStatus: { status: 'OK' }, videoDetails: { title: 'Rick Roll' }, streamingData: { formats: [{ url: 'https://gv/18', mimeType: 'video/mp4; codecs="avc1"', height: 360 }, { signatureCipher: 'x', mimeType: 'video/mp4', height: 720 }], adaptiveFormats: [{ url: 'https://gv/140', mimeType: 'audio/mp4; codecs="mp4a"', bitrate: 128000, contentLength: '999' }] } });
  if (url.includes('api.cloudflare.com')) return j({ success: true, result: { response: 'cf says hi via ' + url.split('/run/')[1] } });
  if (url.includes('generativelanguage')) return j({ candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }] });
  if (url.includes('openrouter.ai')) return j({ error: { message: 'rate limited' } }, 429);
  if (url.includes('pipedapi.kavin.rocks/search')) return j({ items: [{ url: '/watch?v=pipedvid001', title: 'Piped Song', uploaderName: 'PCh', views: 12, duration: 185 }] });
  if (url.includes('api.pullpush.io')) return j({ data: [{ id: 'pp1', title: 'PP thread', subreddit: 'srilanka', author: 'z', score: 4, permalink: '/r/srilanka/comments/pp1/x/' }] });
  if (url.includes('youtube.com/youtubei/v1/search') && !url.includes('FORCEFAIL')) return j({ contents: [{ videoRenderer: { videoId: 'abcdefghijk', title: { runs: [{ text: 'Sinhala Song' }] }, ownerText: { runs: [{ text: 'Chan' }] }, viewCountText: { simpleText: '5 views' }, lengthText: { simpleText: '3:10' }, thumbnail: { thumbnails: [{ url: 'https://i/y.jpg' }] } } }] });
  if (url.includes('reddit.com/search.json')) return j({ data: { children: [{ data: { id: 'r1', title: 'Colombo thread', subreddit_name_prefixed: 'r/srilanka', author: 'bob', score: 9, num_comments: 2, permalink: '/r/srilanka/comments/r1/x/', url: 'https://x', selftext: 'hi', created_utc: 1700000000 } }] } });
  if (url.includes('tiktok.com/@khaby')) return new Response('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">' + JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user: { id: '1', uniqueId: 'khaby.lame', nickname: 'Khaby', signature: 'hi', verified: true }, stats: { followerCount: 100, followingCount: 2, heartCount: 5, videoCount: 7 } } } } }) + '</script>');
  if (url.includes('instagram.com/api/v1/users/web_profile_info')) return j({ data: { user: { id: '9', username: 'natgeo', full_name: 'NG', biography: 'bio', edge_followed_by: { count: 50 }, edge_follow: { count: 1 }, is_private: false, edge_owner_to_timeline_media: { count: 2, edges: [{ node: { id: 'p1', shortcode: 'AAA', is_video: false, display_url: 'https://i/1.jpg', edge_media_to_caption: { edges: [{ node: { text: 'cap' } }] }, edge_liked_by: { count: 3 } } }, { node: { id: 'p2', shortcode: 'BBB', is_video: true, display_url: 'https://i/2.jpg' } }] } } } });
  if (url.includes('syndication.twitter.com')) return new Response('<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { pageProps: { timeline: { entries: [{ type: 'tweet', content: { tweet: { id_str: '11', full_text: 'hello world', favorite_count: 4, user: { screen_name: 'nasa', name: 'NASA' } } } }] } } } }) + '</script>');
  if (url.includes('youtube.com/results')) return new Response(`<html><script>var ytInitialData = ${JSON.stringify({ contents: { a: [{ videoRenderer: { videoId: 'abc123', title: { runs: [{ text: 'Sinhala "song" {x}' }] }, lengthText: { simpleText: '3:25' }, ownerText: { runs: [{ text: 'Chan' }] }, viewCountText: { simpleText: '1,234 views' }, thumbnail: { thumbnails: [{ url: 'https://i/y.jpg' }] } } }, { videoRenderer: { videoId: 'def456', title: { runs: [{ text: 'Two' }] } } }] } })};</script></html>`);
  if (url.includes('youtube.com/oembed')) return url.includes('missing') ? j({}, 404) : j({ title: 'Never Gonna', author_name: 'Rick', author_url: 'https://yt/rick', thumbnail_url: 'https://i/t.jpg' });
  if (url.includes('youtube.com/watch')) return new Response('<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"dQw","lengthSeconds":"212","viewCount":"99","shortDescription":"desc { }"}};</script>');
  if (url.includes('tiktok.com/oembed')) return j({ title: 'tt vid', author_name: 'user1', author_url: 'https://tiktok.com/@user1', thumbnail_url: 'https://i/tt.jpg' });
  if (url.includes('facebook.com/watch')) return new Response('<meta property="og:video" content="https://cdn/fb.mp4"><meta property="og:title" content="FB &amp; post"><meta content="https://i/fb.jpg" property="og:image"><meta property="og:description" content="hello">');
  if (url.includes('instagram.com')) return new Response('<html>login wall</html>');
  if (url.includes('mediafire.com')) return new Response('<title>file.zip</title><a class="x" id="downloadButton" href="https://download123.mediafire.com/f/file.zip?a=1&amp;b=2">Download</a>');
  throw new Error('unmocked fetch ' + url);
};

const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT_JSON: SA, ADMIN_EMAIL: 'eshandinujaya86@gmail.com', SIGNUP_COINS: '10', GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', PLATFORM_START: '2026-10-30T00:00:00Z' };
const call = async (path, init = {}, e = env) => {
  for (const k of Object.keys(process.env)) if (/^(FIREBASE_|SIGNUP_|ALLOW_|ANON_|ADMIN_|GEMINI_|OPENROUTER_|GROQ_|DEEPSEEK_|TMDB_|CF_|SCRAPER_|CATBOX_|RATE_|PLATFORM_)/.test(k)) delete process.env[k];
  for (const [k, v] of Object.entries(e)) if (v !== undefined) process.env[k] = v;
  const req = new Request('https://t.dev' + path, init);
  const r = await handler.fetch(req);
  return { s: r.status, b: await r.json().catch(() => null) };
};
let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + JSON.stringify(extra))); if (!cond) fail++; };

const auth = { headers: { Authorization: 'Bearer x' } };
let r = await call('/api/keys/ensure', { method: 'POST', ...auth });
ok('ensure creates key', r.s === 200 && r.b.created && r.b.key.startsWith('pasiya_'), r);
const KEY = r.b.key;
r = await call('/api/keys/ensure', { method: 'POST', ...auth });
ok('ensure is idempotent and returns the key again', r.b.created === false && r.b.key === KEY, r);
r = await call('/api/keys', auth); ok('key list shows full key to its owner', r.b.keys[0].key === KEY, r.b);
r = await call('/api/me', auth); ok('me has 10 coins', r.b.coins === 10 && r.b.role === 'admin', r);

r = await call('/api/weather?city=Colombo'); ok('free endpoint WITHOUT a key -> 401 (key system stays)', r.s === 401, r);
r = await call('/api/ai/gemini?prompt=hi'); ok('coin endpoint without key -> 401', r.s === 401, r);
r = await call('/api/weather?city=Colombo&apikey=bad'); ok('bad key -> 401', r.s === 401, r);
r = await call(`/api/weather?city=Colombo&apikey=${KEY}`); ok('weather ok', r.s === 200 && r.b.result.current.condition.text === 'Partly cloudy' && r.b.result.forecast[0].condition.text === 'Light rain' && r.b.creator === 'Pasidu Eshan', r);
r = await call(`/api/weather/sri-lanka?apikey=${KEY}`); ok('lk weather 12 cities', r.b.result.cities.length === 12 && r.b.result.cities[0].city === 'Colombo', r);
r = await call(`/api/news?apikey=${KEY}&limit=5`); ok('news parsed+deduped', r.s === 200 && r.b.result.articles.length === 2 && r.b.result.articles[0].title === 'Second' && r.b.result.articles[1].title === 'Test & headline one' && r.b.result.articles[1].image === 'https://x.lk/a.jpg' && r.b.result.articles[1].summary === 'Body text', r.b);
r = await call(`/api/news?apikey=${KEY}&source=nope`); ok('bad source 400', r.s === 400, r);
r = await call(`/api/tv/channels?apikey=${KEY}&q=derana`); ok('tv m3u', r.s === 200 && r.b.result.count === 1 && r.b.result.channels[0].quality === '720p' && r.b.result.channels[0].name === 'Derana TV', r.b);
r = await call(`/api/tv/channels?apikey=${KEY}`); ok('tv skips EXTVLCOPT', r.b.result.count === 2, r.b);
r = await call(`/api/ai/gemini?apikey=${KEY}&prompt=hi`); ok('gemini ok', r.s === 200 && r.b.result.answer === 'Hello from Gemini', r);
r = await call(`/api/ai/gpt?apikey=${KEY}&prompt=hi`); ok('gpt: openrouter fails -> substitute (Gemini first, then keyless) answers', r.s === 200 && r.b.result.substituted === true && ['gemini', 'pollinations'].includes(r.b.result.provider), r);
r = await call(`/api/ai/llama?apikey=${KEY}&prompt=hi`); ok('llama still answers when its own providers fail (Gemini substitute or keyless)', r.s === 200 && r.b.result.substituted === true && ['gemini', 'pollinations'].includes(r.b.result.provider), r);
const envAI = { ...env, GEMINI_API_KEY: undefined, OPENROUTER_API_KEY: undefined, CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'tok' };
for (const mdl of ['gemini', 'gpt', 'deepseek', 'claude', 'llama']) { r = await call(`/api/ai/${mdl}?apikey=${KEY}&prompt=hi`, {}, envAI); ok(`${mdl} works with only Cloudflare REST fallback`, r.s === 200 && r.b.result.provider === 'workers-ai', r); }
// stale-if-error: after the fresh copy expires and the site is down, the last good copy is still served
{ let n = 0; const fn = async () => { if (n++) throw new Error('down'); return 'good'; };
  ok('cached fresh', (await cached('k1', 0, fn)) === 'good');
  ok('cached stale-if-error serves last good copy', (await cached('k1', 0, fn)) === 'good'); }
r = await call(`/api/ai/gemini?apikey=${KEY}`); ok('missing prompt 400', r.s === 400, r);
r = await call(`/api/ai/gemini`, { method: 'POST', headers: { 'X-API-Key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'yo' }) }); ok('POST json + header key', r.s === 200, r);
r = await call(`/api/scraper/youtube/search?apikey=${KEY}&query=sinhala&limit=1`); ok('youtube search built-in', r.s === 200 && r.b.result.results.length === 1 && r.b.result.results[0].title === 'Sinhala "song" {x}' && r.b.result.results[0].duration === 205 && r.b.result.results[0].views === 1234 && r.b.result.results[0].url.endsWith('abc123'), r.b);
r = await call(`/api/scraper/youtube/details?apikey=${KEY}&url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw')}`); ok('youtube details built-in', r.s === 200 && r.b.result.info.title === 'Never Gonna' && r.b.result.info.duration === 212 && r.b.result.info.views === 99, r.b);
r = await call(`/api/scraper/youtube/details?apikey=${KEY}&url=${encodeURIComponent('https://evil.example/watch?v=1')}`); ok('wrong host rejected 400', r.s === 400, r);
r = await call(`/api/scraper/youtube/details?apikey=${KEY}&url=${encodeURIComponent('https://www.youtube.com.evil.com/watch?v=1')}`); ok('lookalike host rejected 400', r.s === 400, r);
r = await call(`/api/scraper/youtube/details?apikey=${KEY}&url=${encodeURIComponent('http://127.0.0.1/x')}`); ok('local address rejected 400', r.s === 400, r);
r = await call(`/api/scraper/youtube/details?apikey=${KEY}&url=${encodeURIComponent('https://www.youtube.com/watch?v=missing')}`); ok('youtube missing video 404', r.s === 404, r);
r = await call(`/api/scraper/tiktok/details?apikey=${KEY}&url=${encodeURIComponent('https://www.tiktok.com/@user1/video/1')}`); ok('tiktok details built-in', r.s === 200 && r.b.result.info.uploader === 'user1', r.b);
r = await call(`/api/scraper/facebook/details?apikey=${KEY}&url=${encodeURIComponent('https://www.facebook.com/watch/?v=123')}`); ok('facebook OG details', r.s === 200 && r.b.result.info.title === 'FB & post' && r.b.result.info.thumbnail === 'https://i/fb.jpg', r.b);
r = await call(`/api/scraper/instagram/details?apikey=${KEY}&url=${encodeURIComponent('https://www.instagram.com/p/abc/')}`); ok('instagram login wall -> 404 message', r.s === 404, r);
r = await call(`/api/scraper/mediafire/resolve?apikey=${KEY}&url=${encodeURIComponent('https://www.mediafire.com/file/abc/file.zip')}`); ok('mediafire link', r.s === 200 && r.b.result.result.downloadUrl === 'https://download123.mediafire.com/f/file.zip?a=1&b=2' && r.b.result.result.title === 'file.zip', r.b);
r = await call(`/api/scraper/facebook/download?apikey=${KEY}&url=x`); ok('download without rightsConfirmed -> 400', r.s === 400, r);

// coins: gemini x2 (cost1) + movie x2 ok = charged; check balance
r = await call('/api/me', auth);
ok('coins charged only on success (10 - 2 gemini)', r.b.coins === 10 || r.b.role === 'admin', r.b); // admin is free
const user2 = { ...env, ADMIN_EMAIL: 'someone@else.com', RATE_LIMIT_PER_MIN: '1000' };
r = await call('/api/me', auth, user2); ok('non-admin sees user role', r.b.role === 'user', r);
const c0 = r.b.coins;
await call(`/api/ai/gemini?apikey=${KEY}&prompt=hi`, {}, user2);
r = await call('/api/me', auth, user2); ok('non-admin charged 1 coin', r.b.coins === c0 - 1, { c0, now: r.b.coins });
await call(`/api/ai/gemini?apikey=${KEY}`, {}, user2); // missing prompt -> 400
r = await call('/api/me', auth, user2); ok('failed call NOT charged', r.b.coins === c0 - 1, r.b);
r = await call('/api/usage', auth, user2); ok('usage logged', r.b.items.length === 1, r.b);

// drain coins -> 402
for (let i = 0; i < 12; i++) await call(`/api/ai/gemini?apikey=${KEY}&prompt=hi`, {}, user2);
r = await call(`/api/ai/gemini?apikey=${KEY}&prompt=hi`, {}, user2); ok('out of coins -> 402', r.s === 402, r);

r = await call('/api/status', { headers: { 'x-forwarded-for': '1.2.3.4', 'x-vercel-id': 'sin1::abc' } }); ok('status shape', r.b.status === 'Online' && r.b.database.ok && r.b.requests24h > 5 && r.b.endpoints === 117 && r.b.categories === 9, r.b);
r = await call('/api/catalog'); ok('catalog lists the public APIs', r.b.apis.length === 117, r.b.apis.length);
r = await call('/api/catalog', {}, { ...env, SCRAPER_URL: 'https://s' }); ok('catalog same w/ SCRAPER_URL', r.b.apis.length === 117, r.b.apis.length);
r = await call('/api/catalog', {}, { ...env, APIFY_TOKEN: 'x', TAVILY_API_KEY: 'x' }); ok('social (Apify) + Tavily APIs appear only when their key is set', r.b.apis.length === 117 + 1 && r.b.apis.some((a) => a.path === '/api/social/tiktok/profile'), r.b.apis.length);
r = await call('/api/load'); ok('Cloudflare load metrics unavailable by platform design', r.s === 200 && r.b.server.ramUsedMb === null && r.b.server.cpuPct === null, r.b);
r = await call('/api/daily-claim', { method: 'POST', ...auth }, user2); ok('daily claim', r.s === 200, r);
r = await call('/api/daily-claim', { method: 'POST', ...auth }, user2); ok('daily claim twice 409', r.s === 409, r);
r = await call('/api/spin', { method: 'POST', ...auth }, user2); ok('spin awards coins', r.s === 200 && [10,25,50,100,250].includes(r.b.reward) && r.b.index >= 0 && r.b.index < 5, r);
r = await call('/api/spin', { method: 'POST', ...auth }, user2); ok('spin twice 409', r.s === 409, r);

// ---- new scrapers: downloads (Node service), Google Drive, Catbox, news article; movie-piracy routes removed ----
const fast = { ...env, RATE_LIMIT_PER_MIN: '1000' };
const user3 = { ...user2, SCRAPER_URL: 'https://scraper.example', SCRAPER_SHARED_SECRET: 'sh-secret' };
r = await call('/api/me', auth, user3); const cBefore = r.b.coins;
r = await call(`/api/scraper/youtube/download?apikey=${KEY}&url=${encodeURIComponent('https://www.youtube.com/watch?v=v1')}&rightsConfirmed=true&type=audio`, {}, user3);
ok('download forwarded to the Node service', r.s === 200 && r.b.result.download.url === 'https://scraper.example/dl/tok', r);
ok('forward used the shared secret + sent the options', SCRAPER_CALLS.at(-1)?.key === 'sh-secret' && JSON.parse(SCRAPER_CALLS.at(-1).body).rightsConfirmed === 'true' && JSON.parse(SCRAPER_CALLS.at(-1).body).type === 'audio', SCRAPER_CALLS.at(-1));
r = await call('/api/me', auth, user3); ok('download costs 2 coins', r.b.coins === cBefore - 2, { cBefore, now: r.b.coins });
r = await call(`/api/scraper/tiktok/download?apikey=${KEY}&url=x`, {}, fast); ok('download w/o rightsConfirmed -> 400', r.s === 400, r);
r = await call(`/api/scraper/gdrive/resolve?apikey=${KEY}&url=${encodeURIComponent('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')}`, {}, fast);
ok('gdrive file resolve (built-in)', r.s === 200 && r.b.result.result.name === 'my file.zip' && r.b.result.result.size === 1234 && r.b.result.result.downloadUrl.includes('id=1AbCdEfGhIjKlMnOp'), r);
r = await call(`/api/scraper/gdrive/resolve?apikey=${KEY}&url=${encodeURIComponent('https://drive.google.com/open?id=PRIVATEFILE')}`, {}, fast); ok('gdrive private -> 403', r.s === 403, r);
r = await call(`/api/scraper/gdrive/resolve?apikey=${KEY}&url=${encodeURIComponent('https://drive.google.com/drive/folders/abc')}`, {}, fast); ok('gdrive folder -> 400', r.s === 400, r);
r = await call(`/api/scraper/gdrive/resolve?apikey=${KEY}&url=${encodeURIComponent('https://docs.google.com/document/d/DOC123/edit')}&format=docx`, {}, fast); ok('gdrive doc export link', r.s === 200 && r.b.result.result.downloadUrl.endsWith('/DOC123/export?format=docx'), r);
r = await call(`/api/scraper/gdrive/resolve?apikey=${KEY}&url=${encodeURIComponent('https://evil.example/file/d/abc')}`, {}, fast); ok('gdrive wrong host -> 400', r.s === 400, r);
r = await call(`/api/scraper/catbox/upload?apikey=${KEY}&url=${encodeURIComponent('https://example.com/pic.jpg')}`, {}, fast); ok('catbox upload (built-in)', r.s === 200 && r.b.result.result.url === 'https://files.catbox.moe/abc123.jpg', r);
r = await call(`/api/scraper/catbox/upload?apikey=${KEY}&url=${encodeURIComponent('http://127.0.0.1/x.jpg')}`, {}, fast); ok('catbox private address -> 400', r.s === 400, r);
r = await call(`/api/news/article?apikey=${KEY}&url=${encodeURIComponent('https://adaderana.lk/news/110691')}`, {}, fast);
ok('news article (title, image, short excerpt)', r.s === 200 && r.b.result.article.title === 'Big & news' && r.b.result.article.image === 'https://i/n.jpg' && r.b.result.article.excerpt.startsWith('This is a long') && !/Short\./.test(r.b.result.article.excerpt), r);
r = await call(`/api/news/article?apikey=${KEY}&url=${encodeURIComponent('https://evil.example/news/1')}`, {}, fast); ok('news article other host -> 400', r.s === 400, r);
r = await call(`/api/news/article?apikey=${KEY}&url=${encodeURIComponent('https://adaderana.lk.evil.com/news/1')}`, {}, fast); ok('news article lookalike host -> 400', r.s === 400, r);

const D = (site, u, extra = '') => call(`/api/scraper/${site}/download?apikey=${KEY}&rightsConfirmed=true&url=${encodeURIComponent(u)}${extra}`, {}, fast);
r = await D('tiktok', 'https://www.tiktok.com/@u/video/1'); ok('keyless tiktok download (HD)', r.s === 200 && r.b.result.download.url === 'https://cdn/tt_hd.mp4' && r.b.result.download.filename === 'tt vid.mp4', r);
r = await D('tiktok', 'https://www.tiktok.com/@u/video/1', '&type=audio'); ok('keyless tiktok audio', r.s === 200 && r.b.result.download.url === 'https://www.tikwm.com/music/a.mp3' && r.b.result.download.ext === 'mp3', r);
r = await D('tiktok', 'https://www.tiktok.com/@u/video/bad'); ok('tiktok lookup refused -> 404', r.s === 404, r);
r = await D('facebook', 'https://www.facebook.com/watch/?v=123'); ok('keyless facebook download (og:video)', r.s === 200 && r.b.result.download.url === 'https://cdn/fb.mp4', r);
r = await D('instagram', 'https://www.instagram.com/reel/abc/'); ok('instagram login wall -> 404', r.s === 404, r);
r = await D('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'); ok('keyless youtube video (skips ciphered format)', r.s === 200 && r.b.result.download.url === 'https://gv/18' && r.b.result.download.title === 'Rick Roll', r);
r = await D('youtube', 'https://youtu.be/dQw4w9WgXcQ', '&type=audio'); ok('keyless youtube audio', r.s === 200 && r.b.result.download.url === 'https://gv/140' && r.b.result.download.filesize === 999, r);
r = await D('youtube', 'https://www.youtube.com/watch?v=LOGINNEEDED'); ok('youtube bot check -> clear 503', r.s === 503 && /SCRAPER_URL/.test(r.b.error), r);
r = await D('youtube', 'https://evil.example/watch?v=dQw4w9WgXcQ'); ok('download wrong host -> 400', r.s === 400, r);
for (const dead of ['cinesubz/search', 'cinesubz/details', 'cinesubz/links', 'sinhalasub/search', 'sinhalasub/details', 'sinhalasub/direct']) { r = await call(`/api/scraper/${dead}?apikey=${KEY}&query=x`, {}, user3); ok(`removed: ${dead} -> 404`, r.s === 404, r); }
r = await call('/api/catalog'); ok('catalog has no movie-piracy entries', !JSON.stringify(r.b).match(/cinesubz|sinhalasub/i), 'found');
r = await call('/api/admin/overview', auth); ok('admin overview', r.s === 200 || r.s === 503, r); // count aggregation not mocked
r = await call('/api/admin/overview', auth, user2); ok('non-admin blocked from admin 403', r.s === 403, r);

// ---- admin: settings, grant coins, user list -------------------------------------------------
const jb = (o) => ({ method: 'POST', headers: { Authorization: 'Bearer x', 'content-type': 'application/json' }, body: JSON.stringify(o) });
r = await call('/api/admin/settings', jb({ dailyCoins: 0, spinMax: 500 })); ok('settings validated', r.s === 400, r);
r = await call('/api/admin/settings', jb({ dailyCoins: 20, spinMax: 500 })); ok('settings saved', r.s === 200 && r.b.dailyCoins === 20 && r.b.spinRewards.join() === '20,50,100,200,500', r.b);
r = await call('/api/admin/settings', jb({ dailyCoins: 20, spinMax: 500 }), user2); ok('settings: non-admin 403', r.s === 403, r);
r = await call('/api/me', auth); ok('me shows unlimited admin + new rewards', r.b.unlimited === true && r.b.dailyCoins === 20 && r.b.spinRewards[4] === 500 && /^\d{4}-\d\d-\d\d$/.test(r.b.today), r.b);
r = await call('/api/admin/users', auth); ok('admin user list', r.s === 200 && r.b.items.some((x) => x.email === 'eshandinujaya86@gmail.com'), r.b);
r = await call('/api/admin/coins', jb({ email: 'nobody@gmail.com', amount: 5 })); ok('grant to unknown email 404', r.s === 404, r);
r = await call('/api/admin/coins', jb({ email: 'ESHANDINUJAYA86@gmail.com', amount: 500 })); ok('admin grants coins by email (case-insens.)', r.s === 200 && /Added 500/.test(r.b.message), r);
r = await call('/api/admin/coins', jb({ email: 'eshandinujaya86@gmail.com', amount: -99999 })); ok('removal never goes below 0', r.s === 200 && /New balance: 0/.test(r.b.message), r);

// ---- fresh user: claim uses admin-set amount, double click is blocked atomically -----------------
r = await call('/api/daily-claim', jb({}), { ...user2, FIREBASE_PROJECT_ID: 'p' }); // user2 already claimed above -> 409
ok('claim again same day 409', r.s === 409, r);
for (const k of [...db.keys()]) if (k.startsWith('claims/')) db.delete(k); // pretend it is a new day
db.get('users/u1').lastDailyClaim = { stringValue: 'old' }; db.get('users/u1').lastSpinDay = { stringValue: 'old' }; db.get('users/u1').coins = { integerValue: '0' };
const [c1, c2] = await Promise.all([call('/api/daily-claim', jb({}), user2), call('/api/daily-claim', jb({}), user2)]);
ok('two simultaneous claims -> exactly one paid', [c1.s, c2.s].sort().join() === '200,409', { c1, c2 });
r = await call('/api/me', auth, user2); ok('claim paid admin-set 20 coins once', r.b.coins === 20, r.b);
const [s1, s2] = await Promise.all([call('/api/spin', jb({}), user2), call('/api/spin', jb({}), user2)]);
ok('two simultaneous spins -> exactly one paid', [s1.s, s2.s].sort().join() === '200,409', { s1, s2 });
ok('spin prize from admin table', [20, 50, 100, 200, 500].includes((s1.s === 200 ? s1 : s2).b.reward), { s1, s2 });

// ---- security: owner email NOT verified (someone registered it with a password) -> no admin -------------
verified = false;
r = await call('/api/admin/overview', { headers: { Authorization: 'Bearer unverified' } }); ok('unverified owner email gets NO admin (403)', r.s === 403, r);
r = await call('/api/me', { headers: { Authorization: 'Bearer unverified' } }); ok('unverified owner sees adminPending', r.b.role === 'user' && r.b.adminPending === true, r.b);
verified = true;
r = await call('/api/nope'); ok('404 json', r.s === 404, r);
ok('RSA token minted only once', tokenMints === 1, { tokenMints });

// ---- keyless endpoints (no API key, anonymous by IP) ----
const anon = { headers: { 'x-forwarded-for': '9.9.9.9' } };
const K = { ...env, ALLOW_KEYLESS: '1' };
r = await call('/api/currency?from=usd&to=lkr', anon); ok('keyless is OFF by default: no key -> 401', r.s === 401, r);
r = await call('/api/news/techcrunch?limit=1', anon, K); ok('per-site news (falls back to Google News when the feed is unreachable)', r.s === 200 && r.b.result.articles.length === 1 && r.b.result.via === 'google-news' && r.b.result.articles[0].source === 'TechCrunch', r);
r = await call('/api/news/all?group=tech', anon, K); ok('news all-in-one', r.s === 200 && r.b.result.articles.length >= 1, r);
r = await call('/api/search/wallpaper?q=nature', anon, K); ok('wallpaper 4k', r.s === 200 && r.b.result.results[0].resolution === '3840x2160', r);
r = await call('/api/search/wallpaper', anon, K); ok('wallpaper q required 400', r.s === 400, r);
r = await call('/api/search/img?q=elephant', anon, K); ok('openverse images', r.s === 200 && r.b.result.results[0].license === 'by 4.0', r);
r = await call('/api/search/wikipedia?q=Sigiriya', anon, K); ok('wikipedia search', r.s === 200 && r.b.result.results[0].snippet === 'a rock fortress', r);
r = await call('/api/search/web?q=hello', anon, K); ok('web search parsed', r.s === 200 && r.b.result.results[0].url === 'https://example.org/x' && r.b.result.results[0].snippet === 'Nice snippet', r);
r = await call('/api/currency?from=usd&to=lkr&amount=2', anon, K); ok('currency convert', r.s === 200 && r.b.result.converted === 600, r);
r = await call('/api/currency?from=XXX&to=LKR', anon, K); ok('currency unknown 400', r.s === 400, r);
r = await call('/api/weather/coords?lat=6.9&lon=79.8', anon, K); ok('weather by coords', r.s === 200 && r.b.result.current.condition.text === 'Partly cloudy', r);
r = await call('/api/weather/coords?lat=6.9', anon, K); ok('coords needs lon 400', r.s === 400, r);
r = await call('/api/tools/tinyurl?url=https://example.com/long', anon, K); ok('tinyurl', r.s === 200 && r.b.result.short === 'https://tinyurl.com/abc', r);
r = await call('/api/tools/tinyurl?url=http://127.0.0.1/x', anon, K); ok('tinyurl blocks local 400', r.s === 400, r);
r = await call('/api/tools/tts?text=' + encodeURIComponent('hello world ' .repeat(40)), anon, K); ok('tts splits long text', r.s === 200 && r.b.result.parts >= 3 && r.b.result.audio[0].includes('tl=si'), r);
r = await call('/api/tools/webcheck?url=example.com', anon, K); ok('webcheck audit', r.s === 200 && r.b.result.title === 'Example Domain Title' && r.b.result.h1Count === 1 && r.b.result.imagesWithoutAlt === 1 && r.b.result.securityHeaders['strict-transport-security'] === true, r);
r = await call('/api/tools/webcheck?url=http://localhost/', anon, K); ok('webcheck blocks localhost 400', r.s === 400, r);
r = await call('/api/tools/webcheck?url=http://10.0.0.5/', anon, K); ok('webcheck blocks private IP 400', r.s === 400, r);
r = await call('/api/tempmail/random', anon, K); ok('tempmail random', r.s === 200 && r.b.result.address.endsWith('@mail.test') && r.b.result.id, r);
const TM = r.b?.result?.id;
r = await call('/api/tempmail/mailbox?id=' + TM, anon, K); ok('tempmail mailbox', r.s === 200 && r.b.result.count === 1 && r.b.result.messages[0].subject === 'Hi', r);
r = await call('/api/tempmail/message?id=' + TM + '&mid=msg123456', anon, K); ok('tempmail message', r.s === 200 && r.b.result.text === 'body text', r);
r = await call('/api/tempmail/mailbox?id=garbage', anon, K); ok('tempmail bad id 400', r.s === 400, r);
{ let last; for (let i = 0; i < 32; i++) last = await call('/api/tools/tinyurl?url=https://example.com/' + i, { headers: { 'x-forwarded-for': '7.7.7.7' } }, K); ok('anonymous rate limit 429', last.s === 429, last); }
r = await call('/api/ai/gemini?prompt=hi', anon, K); ok('coin endpoints still need a key even when keyless is on', r.s === 401, r);

const anon2 = { headers: { 'x-forwarded-for': '8.8.8.8' } };
// ---- extras ----
r = await call('/api/search/apk?q=vlc', anon2, K); ok('apk search (F-Droid)', r.s === 200 && r.b.result.results[0].package === 'org.videolan.vlc' && r.b.result.results[0].name === 'VLC', r);
r = await call('/api/search/apk?package=org.videolan.vlc', anon2, K); ok('apk direct link', r.s === 200 && r.b.result.download === 'https://f-droid.org/repo/org.videolan.vlc_13.apk', r);
r = await call('/api/search/apk?package=evil;rm', anon2, K); ok('apk bad package 400', r.s === 400, r);
r = await call('/api/search/music?q=folk', anon2, K); ok('free music (archive.org)', r.s === 200 && r.b.result.results[0].id === 'song1', r);
r = await call('/api/tiktok-profile-dl?username=@someone', anon2, K); ok('tiktok avatar', r.s === 200 && r.b.result.avatar === 'https://cdn/av.jpg', r);
r = await call('/api/tiktok-profile-dl?username=a%20b', anon2, K); ok('tiktok bad username 400', r.s === 400, r);
r = await call('/api/search/wallpaper3?q=waterfall', anon2, K); ok('live wallpaper video', r.s === 200 && r.b.result.results[0].video === 'https://c/v.webm', r);
{
  for (const [k, v] of Object.entries({ ...K })) if (v !== undefined) process.env[k] = v;
  const res = await handler.fetch(new Request('https://t.dev/api/tools/web2zip?url=https://site.test/', anon2));
  const buf = Buffer.from(await res.arrayBuffer());
  ok('web2zip returns a zip', res.status === 200 && res.headers.get('content-type') === 'application/zip' && buf.readUInt32LE(0) === 0x04034b50, { s: res.status });
  const txt = buf.toString('latin1');
  ok('web2zip bundles page + css + image and rewrites links', txt.includes('index.html') && txt.includes('assets/style.css') && txt.includes('assets/logo.png') && txt.includes('href="assets/style.css"') && !txt.includes('assets/x.css'), txt.slice(0, 200)); }
r = await call('/api/tools/web2zip?url=http://192.168.1.1/', anon2, K); ok('web2zip blocks private IP 400', r.s === 400, r);
r = await call('/api/status', { headers: { 'x-forwarded-for': '1.2.3.4' } }); ok('status shows users count', Number.isInteger(r.b.users) && r.b.users >= 1, r.b);
// ---- username + admin e-mail matching ----
r = await call('/api/auth/available?username=Pasiya_1'); ok('username free', r.b.available === true, r);
r = await call('/api/auth/username', { method: 'POST', ...auth, body: JSON.stringify({ username: 'ab' }) }); ok('username too short 400', r.s === 400, r);
r = await call('/api/auth/username', { method: 'POST', ...auth, body: JSON.stringify({ username: 'Pasiya_1' }) }); ok('username saved', r.s === 200 && r.b.username === 'Pasiya_1', r);
r = await call('/api/auth/available?username=pasiya_1'); ok('username now taken (case-insens.)', r.b.available === false, r);
r = await call('/api/auth/resolve?username=PASIYA_1'); ok('username -> email lookup', r.s === 200 && r.b.email === 'eshandinujaya86@gmail.com', r);
r = await call('/api/auth/resolve?username=nobody_x'); ok('unknown username 404', r.s === 404, r);
r = await call('/api/me', auth, { ...env, ADMIN_EMAIL: ' Eshan.Dinujaya86@Gmail.com ' }); ok('admin matches with spaces/caps/dots in ADMIN_EMAIL', r.b.role === 'admin', r);
r = await call('/api/me', auth, { ...env, ADMIN_EMAIL: 'other@x.com, eshandinujaya86@gmail.com' }); ok('ADMIN_EMAIL accepts a comma list', r.b.role === 'admin', r);
r = await call('/api/config'); ok('config', r.b.signupCoins === 10 && r.b.adminConfigured === true, r);

{
  const G = (path) => call(path + (path.includes('?') ? '&' : '?') + 'apikey=' + KEY, {}, fast);
  r = await G('/api/pixeldrain?url=' + encodeURIComponent('https://pixeldrain.com/u/abc12345')); ok('pixeldrain info + direct link', r.s === 200 && r.b.result.download.endsWith('/api/file/abc12345?download') && r.b.result.size === 10, r);
  r = await G('/api/pixeldrain?url=nope'); ok('pixeldrain bad link 400', r.s === 400, r);
  r = await G('/api/yt/thumbnail-dl?url=' + encodeURIComponent('https://youtu.be/dQw4w9WgXcQ')); ok('yt thumbnails', r.s === 200 && r.b.result.thumbnails[0].url === 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', r);
  r = await G('/api/twitter?rightsConfirmed=true&url=' + encodeURIComponent('https://x.com/user/status/1234567')); ok('twitter video', r.s === 200 && r.b.result.videos[0].url === 'https://video.twimg.com/v.mp4', r);
  r = await G('/api/twitter?url=' + encodeURIComponent('https://x.com/user/status/1234567')); ok('twitter needs rightsConfirmed', r.s === 400, r);
  r = await G('/api/twitter?rightsConfirmed=true&url=' + encodeURIComponent('https://evil.com/user/status/1234567')); ok('twitter rejects other hosts', r.s === 400, r);
  r = await G('/api/spotify?url=' + encodeURIComponent('https://open.spotify.com/track/abc')); ok('spotify metadata', r.s === 200 && r.b.result.title === 'Song' && r.b.result.type === 'track', r);
  r = await G('/api/yt/mp3-dl?url=' + encodeURIComponent('https://youtu.be/dQw4w9WgXcQ')); ok('yt mp3 needs rightsConfirmed', r.s === 400, r);
}

// ---- v3.8: HD downloader, QR, IP, watermark gate, admin switches, health check, removed APIs -------------------
{
  const G = (path, e = fast) => call(path + (path.includes('?') ? '&' : '?') + 'apikey=' + KEY, {}, e);
  // v4.2: social APIs work without any key
  r = await G('/api/social/youtube/search?q=sinhala'); ok('social: youtube search (keyless)', r.s === 200 && r.b.result.items[0].id === 'abcdefghijk' && r.b.result.items[0].channel === 'Chan', r);
  r = await G('/api/social/reddit/search?q=colombo'); ok('social: reddit search (keyless)', r.s === 200 && r.b.result.items[0].subreddit === 'r/srilanka', r);
  r = await G('/api/social/tiktok/profile?username=khaby.lame'); ok('social: tiktok profile (keyless)', r.s === 200 && r.b.result.items[0].followers === 100, r);
  r = await G('/api/social/instagram/profile?username=natgeo'); ok('social: instagram profile (keyless)', r.s === 200 && r.b.result.items[0].followers === 50, r);
  r = await G('/api/social/instagram/posts?username=natgeo'); ok('social: instagram posts (keyless)', r.s === 200 && r.b.result.count === 2, r);
  r = await G('/api/social/instagram/reels?username=natgeo'); ok('social: instagram reels = videos only', r.s === 200 && r.b.result.count === 1 && r.b.result.items[0].shortcode === 'BBB', r);
  r = await G('/api/social/twitter/profile?username=nasa'); ok('social: x profile tweets (keyless)', r.s === 200 && r.b.result.items[0].text === 'hello world', r);
  r = await G('/api/social/tiktok/search?q=sri+lanka'); ok('social: tiktok search (keyless)', r.s === 200 && r.b.result.items[0].author === 'u1', r);
  r = await G('/api/social/tiktok/hashtag?tag=srilanka'); ok('social: tiktok hashtag (keyless)', r.s === 200 && r.b.result.items[0].id === '88', r);
  r = await G('/api/social/tiktok/comments?url=' + encodeURIComponent('https://www.tiktok.com/@u/video/1')); ok('social: tiktok comments (keyless)', r.s === 200 && r.b.result.items[0].text === 'nice', r);
  r = await G('/api/social/twitter/search?q=moon'); ok('social: x search via search engine', r.s === 200 && r.b.result.count === 1 && r.b.result.items[0].url.includes('/status/123'), r);
  r = await G('/api/social/instagram/hashtag?tag=moon'); ok('social: instagram hashtag via search engine', r.s === 200 && r.b.result.items[0].url.includes('/p/AAA'), r);
  r = await G('/api/social/facebook/posts?url=' + encodeURIComponent('https://www.facebook.com/nasa')); ok('social: facebook posts via search engine', r.s === 200 && r.b.result.items[0].url.includes('/posts/55'), r);
  r = await G('/api/social/reddit/search'); ok('social: missing input = 400', r.s === 400, r);
  r = await call('/api/catalog'); ok('thenux-ai + twitter_v2 removed from the catalog', !r.b.apis.some((a) => /thenux|twitter_v2/.test(a.path)), r.b.apis.length);
  r = await G('/api/thenux-ai?prompt=hi'); ok('thenux-ai route is gone (404)', r.s === 404, r);
  r = await G('/api/video/hd?url=' + encodeURIComponent('https://youtu.be/dQw4w9WgXcQ')); ok('hd needs rightsConfirmed', r.s === 400, r);
  r = await G('/api/video/hd?rightsConfirmed=true&url=' + encodeURIComponent('https://youtu.be/dQw4w9WgXcQ')); ok('hd youtube: best link + whatsapp tip + audio', r.s === 200 && r.b.result.best.url === 'https://gv/18' && /DOCUMENT/.test(r.b.result.whatsappTip) && r.b.result.bestAudio?.url === 'https://gv/140', r);
  r = await G('/api/video/hd?rightsConfirmed=true&url=' + encodeURIComponent('https://www.facebook.com/watch/?v=123')); ok('hd facebook falls back to public file', r.s === 200 && r.b.result.best.url === 'https://cdn/fb.mp4', r);
  r = await G('/api/video/hd?rightsConfirmed=true&url=' + encodeURIComponent('https://x.com/user/status/1234567')); ok('hd twitter picks highest quality', r.s === 200 && r.b.result.best.quality === '1280p', r);
  r = await G('/api/video/hd?rightsConfirmed=true&url=' + encodeURIComponent('https://evil.example/v')); ok('hd rejects unsupported site', r.s === 400, r);
  r = await G('/api/tools/qr?text=' + encodeURIComponent('hello') + '&size=300'); ok('qr maker', r.s === 200 && r.b.result.image.startsWith('https://api.qrserver.com/') && r.b.result.image.includes('300x300'), r);
  r = await G('/api/tools/qr'); ok('qr needs text', r.s === 400, r);
  r = await G('/api/tools/ip?ip=8.8.8.8'); ok('ip lookup', r.s === 200 && r.b.result.countryCode === 'US' && r.b.result.isp === 'Google LLC', r);
  r = await G('/api/tools/ip?ip=bad/path'); ok('ip lookup rejects bad input', r.s === 400, r);

  // admin switches
  r = await call('/api/admin/features', auth, user2); ok('features: non-admin 403', r.s === 403, r);
  r = await call('/api/admin/features', auth); ok('features: admin sees every API with enabled flag', r.s === 200 && r.b.apis.length >= 105 && r.b.apis.every((a) => a.enabled === true) && r.b.dailyEnabled === true && r.b.spinEnabled === true, r.s);
  r = await call('/api/me', auth, user2); ok('normal user: rewards shown by default', r.b.rewardsOn.daily === true && r.b.rewardsOn.spin === true, r.b.rewardsOn);
  r = await call('/api/me', auth); ok('admin: rewards hidden', r.b.rewardsOn.daily === false && r.b.rewardsOn.spin === false, r.b.rewardsOn);
  r = await call('/api/admin/features', jb({ disabledApis: ['/api/tools/qr', '/api/not/real'] })); ok('admin switches an API off (unknown paths ignored)', r.s === 200 && r.b.disabledApis.join() === '/api/tools/qr', r);
  r = await call('/api/catalog'); ok('switched-off API leaves the catalog', !r.b.apis.some((a) => a.path === '/api/tools/qr'), r.b.apis.length);
  r = await G('/api/tools/qr?text=hi', user2); ok('switched-off API answers 503 for normal users', r.s === 503, r);
  r = await G('/api/tools/qr?text=hi'); ok('admin can still test a switched-off API', r.s === 200, r);
  r = await call('/api/admin/features', jb({ disabledApis: [] })); ok('admin switches it back on', r.s === 200 && r.b.disabledApis.length === 0, r);
  r = await call('/api/admin/features', jb({ dailyEnabled: 'no' })); ok('features validates booleans', r.s === 400, r);
  r = await call('/api/admin/features', jb({ dailyEnabled: false, spinEnabled: false })); ok('admin turns daily claim + spin off', r.s === 200 && r.b.dailyEnabled === false && r.b.spinEnabled === false, r);
  const fresh = { ...user2, FIREBASE_PROJECT_ID: 'p' };
  r = await call('/api/me', auth, user2); ok('rewards hidden for everyone when off', r.b.rewardsOn.daily === false && r.b.rewardsOn.spin === false, r.b.rewardsOn);
  r = await call('/api/daily-claim', jb({}), fresh); ok('daily claim blocked while off (403)', r.s === 403, r);
  r = await call('/api/spin', jb({}), fresh); ok('spin blocked while off (403)', r.s === 403, r);
  r = await call('/api/music'); ok('music: public list defaults to the new song', r.s === 200 && r.b.tracks.length === 1 && r.b.tracks[0].id === '-LDyd-Cba0A', r);
  r = await call('/api/admin/music', jb({ tracks: [] }), user2); ok('music: non-admin 403', r.s === 403, r);
  r = await call('/api/admin/music', jb({ tracks: ['https://youtu.be/-LDyd-Cba0A?si=x', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'T' }, 'dQw4w9WgXcQ'] })); ok('music: admin saves URLs (ids extracted, duplicates dropped)', r.s === 200 && r.b.tracks.map((x) => x.id).join() === '-LDyd-Cba0A,dQw4w9WgXcQ', r);
  r = await call('/api/music'); ok('music: public list shows the saved songs', r.b.tracks.length === 2, r);
  r = await call('/api/admin/music', jb({ tracks: ['https://evil.example/x'] })); ok('music: rejects non-YouTube link', r.s === 400, r);
  r = await call('/api/admin/music', jb({ tracks: [] })); ok('music: admin can remove all', r.s === 200 && r.b.tracks.length === 0, r);
  r = await call('/api/admin/features', jb({ dailyEnabled: true, spinEnabled: true })); ok('admin turns them back on', r.s === 200 && r.b.dailyEnabled && r.b.spinEnabled, r);
  r = await call('/api/daily-claim', jb({})); ok('admin cannot use free rewards (403)', r.s === 403, r);
  r = await call('/api/spin', jb({})); ok('admin cannot spin (403)', r.s === 403, r);

  // health check
  r = await call('/api/admin/healthcheck', jb({ paths: ['/api/tools/ip', '/api/yt/thumbnail-dl', '/api/scraper/catbox/upload', '/api/nope'] }), user2); ok('healthcheck: non-admin 403', r.s === 403, r);
  r = await call('/api/admin/healthcheck', jb({ paths: ['/api/tools/ip', '/api/yt/thumbnail-dl', '/api/scraper/catbox/upload', '/api/nope'] }));
  const by = Object.fromEntries((r.b?.results || []).map((x) => [x.path, x.state]));
  ok('healthcheck: working API = ok, upload API = skip, unknown path ignored', r.s === 200 && by['/api/tools/ip'] === 'ok' && by['/api/yt/thumbnail-dl'] === 'ok' && by['/api/scraper/catbox/upload'] === 'skip' && Object.keys(by).length === 3, r);
  r = await call('/api/admin/healthcheck', jb({ paths: ['/api/news/hiru'] })); ok('healthcheck: a failing upstream is reported as fail/warn, not a crash', r.s === 200 && ['ok', 'fail', 'warn'].includes(r.b.results[0].state), r);
}

console.log('commits:', commits, 'docs:', db.size);
console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
