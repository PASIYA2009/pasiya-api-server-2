// Social media data through Apify "actors" (the scraper catalogue listed in https://github.com/kawsarlog/social-media-apis).
// Needs ONE free key: APIFY_TOKEN (https://console.apify.com/account/integrations, free plan = monthly credits).
// v4.2: the endpoints that have a free, keyless way (see FREE below) work WITHOUT any key and use Apify only as a backup when APIFY_TOKEN is set.
// Every endpoint here works without a key; APIFY_TOKEN (optional) is only a backup.
import { HttpError, fetchT, cached, clamp, param, decodeEntities, stripHtml } from '../system/util.js';
import { safeUrl, page, meta, ogDetails, UA } from './_web.js';
import { webSearch } from './search.js';

const need = (v, name, max = 150) => { const x = String(v ?? '').trim(); if (!x || x.length > max) throw new HttpError(400, `${name} is required (max ${max} characters).`); return x; };
const handle = (v, name) => need(v, name, 100).replace(/^https?:\/\/[^/]+\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
const lim = (p, d = 10, max = 30) => clamp(p.limit, 1, max, d);

async function runActor(actor, input, env, ttl = 600) {
  return cached('apify:' + actor + ':' + JSON.stringify(input), ttl, async () => {
    const r = await fetchT(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=22&format=json&clean=true`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.APIFY_TOKEN}` }, body: JSON.stringify(input)
    }, 27000);
    const d = await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403) throw new HttpError(503, 'Apify token is invalid or out of credits. Owner: check APIFY_TOKEN.');
    if (r.status === 402) throw new HttpError(503, 'Apify credits are used up for this month.');
    if (r.status === 408 || r.status === 504) throw new HttpError(504, 'The social site took too long. Try a smaller limit.');
    if (!r.ok) throw new HttpError(502, 'Apify: ' + (d?.error?.message || 'HTTP ' + r.status));
    const items = Array.isArray(d) ? d : [];
    if (!items.length) throw new HttpError(404, 'Nothing found (private / empty / wrong name).');
    return items;
  });
}

// ---------------- free (no key) implementations, tried first ----------------
function* walk(o) { if (o && typeof o === 'object') { yield o; for (const v of Object.values(o)) yield* walk(v); } }
const findAll = (o, key) => { const out = []; for (const x of walk(o)) if (x[key] && typeof x[key] === 'object') out.push(x[key]); return out; };
const txt = (t) => (t?.simpleText ?? (t?.runs || []).map((r) => r.text).join('')) || '';
const jsonScript = (html, re) => { const m = html.match(re); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; } };

async function yti(endpoint, body) {
  const r = await fetchT(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Origin: 'https://www.youtube.com', Cookie: 'CONSENT=YES+1; SOCS=CAI' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20260101.00.00', hl: 'en', gl: 'LK' } }, ...body })
  }, 15000);
  if (!r.ok) throw new HttpError(502, 'YouTube answered HTTP ' + r.status);
  return r.json();
}

// ---- backup public instances (tried in order when the main source refuses this server) ----
const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
const INVIDIOUS = ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de'];
async function firstJson(urls) {
  for (const u of urls) { try { const r = await fetchT(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 8000); if (r.ok) { const d = await r.json().catch(() => null); if (d) return d; } } catch { /* next instance */ } }
  return null;
}
async function ytSearchBackup(q, n) {
  const pd = await firstJson(PIPED.map((h) => `${h}/search?q=${encodeURIComponent(q)}&filter=videos`));
  const pv = (pd?.items || []).filter((v) => v.url?.includes('watch?v='));
  if (pv.length) return pv.slice(0, n).map((v) => { const id = v.url.split('v=')[1]; return { id, title: v.title, url: 'https://www.youtube.com/watch?v=' + id, channel: v.uploaderName, views: String(v.views ?? ''), duration: v.duration ? Math.floor(v.duration / 60) + ':' + String(v.duration % 60).padStart(2, '0') : '', published: v.uploadedDate || '', description: v.shortDescription || '', thumbnail: v.thumbnail || null }; });
  const id = await firstJson(INVIDIOUS.map((h) => `${h}/api/v1/search?q=${encodeURIComponent(q)}&type=video`));
  return (Array.isArray(id) ? id : []).filter((v) => v.videoId).slice(0, n).map((v) => ({ id: v.videoId, title: v.title, url: 'https://www.youtube.com/watch?v=' + v.videoId, channel: v.author, views: String(v.viewCount ?? ''), duration: v.lengthSeconds ? Math.floor(v.lengthSeconds / 60) + ':' + String(v.lengthSeconds % 60).padStart(2, '0') : '', published: v.publishedText || '', description: v.description || '', thumbnail: v.videoThumbnails?.[0]?.url || null }));
}
async function ytCommentsBackup(id, n) {
  const pd = await firstJson(PIPED.map((h) => `${h}/comments/${id}`));
  if (pd?.comments?.length) return pd.comments.slice(0, n).map((c) => ({ author: c.author, text: c.commentText, likes: String(c.likeCount ?? 0), published: c.commentedTime || '' }));
  const d = await firstJson(INVIDIOUS.map((h) => `${h}/api/v1/comments/${id}`));
  return (d?.comments || []).slice(0, n).map((c) => ({ author: c.author, text: c.content, likes: String(c.likeCount ?? 0), published: c.publishedText || '' }));
}
async function redditBackup(q, n) {
  const d = await firstJson([`https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(q)}&size=${n}&sort_type=score&sort=desc`]);
  const rows = (d?.data || []).slice(0, n);
  if (!rows.length) return viaSearch([`site:reddit.com/r ${q}`, `${q} reddit`], /reddit\.com\/r\/[^/]+\/comments\//, /reddit\.com\/r\//, n);
  return rows.map((x) => ({ id: x.id, title: x.title, subreddit: 'r/' + x.subreddit, author: x.author, score: x.score, comments: x.num_comments, url: 'https://www.reddit.com' + x.permalink, link: x.url, text: (x.selftext || '').slice(0, 500), created: x.created_utc ? new Date(x.created_utc * 1000).toISOString() : null }));
}

// Fetch a page through public relay services (their IPs are not the blocked Vercel ones). Returns text or null.
async function viaProxy(url) {
  for (const u of [`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, `https://r.jina.ai/${url}`]) {
    try { const r = await fetchT(u, { headers: { 'User-Agent': UA, 'X-Return-Format': 'html' } }, 12000); if (r.ok) { const t = await r.text(); if (t && t.length > 20) return t; } } catch { /* next relay */ }
  }
  return null;
}
const jsonIn = (t) => { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; } };
async function ytSearch(p) {
  const q = need(p.q, 'q'), n = lim(p);
  let d; try { d = await yti('search', { query: q, params: 'EgIQAQ%3D%3D' }); } catch { d = null; }
  if (!d || !findAll(d, 'videoRenderer').length) { try { const html = await page('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAQ%253D%253D'); d = jsonScript(html, /var ytInitialData = (\{.*?\});<\/script>/s); } catch { d = null; } }
  if (!d || !findAll(d, 'videoRenderer').length) return ytSearchBackup(q, n);
  return findAll(d, 'videoRenderer').filter((v) => v.videoId).slice(0, n).map((v) => ({
    id: v.videoId, title: txt(v.title), url: 'https://www.youtube.com/watch?v=' + v.videoId, channel: txt(v.ownerText), views: txt(v.viewCountText), duration: txt(v.lengthText),
    published: txt(v.publishedTimeText), description: txt(v.detailedMetadataSnippets?.[0]?.snippetText) || txt(v.descriptionSnippet), thumbnail: v.thumbnail?.thumbnails?.at(-1)?.url || null
  }));
}
async function ytComments(p) {
  const url = safeUrl(p.url, ['youtube.com', 'youtu.be']), n = lim(p);
  const id = (url.match(/youtu\.be\/([\w-]{11})/) || url.match(/[?&]v=([\w-]{11})/) || url.match(/\/(?:shorts|live|embed)\/([\w-]{11})/) || [])[1];
  if (!id) throw new HttpError(400, 'Not a YouTube video link.');
  let first; try { first = await yti('next', { videoId: id }); } catch { first = null; }
  if (!first) { const b = await ytCommentsBackup(id, n); if (b.length) return b; throw new HttpError(502, 'YouTube comments are not reachable right now.'); }
  const sec = findAll(first, 'itemSectionRenderer').find((x) => x.sectionIdentifier === 'comment-item-section');
  const token = sec && findAll(sec, 'continuationCommand')[0]?.token;
  if (!token) { const b = await ytCommentsBackup(id, n); if (b.length) return b; throw new HttpError(404, 'Comments are turned off or not available for this video.'); }
  let d; try { d = await yti('next', { continuation: token }); } catch { const b = await ytCommentsBackup(id, n); if (b.length) return b; throw new HttpError(502, 'YouTube comments are not reachable right now.'); }
  const ent = new Map(); for (const m of d.frameworkUpdates?.entityBatchUpdate?.mutations || []) { const c = m.payload?.commentEntityPayload; if (c) ent.set(c.key, c); }
  const out = [];
  for (const th of findAll(d, 'commentThreadRenderer')) {
    const key = th.commentViewModel?.commentViewModel?.commentKey, e = key && ent.get(key), old = th.comment?.commentRenderer;
    if (e) out.push({ author: e.author?.displayName || '', text: e.properties?.content?.content || '', likes: e.toolbar?.likeCountNotliked || '0', published: e.properties?.publishedTime || '' });
    else if (old) out.push({ author: txt(old.authorText), text: txt(old.contentText), likes: txt(old.voteCount) || '0', published: txt(old.publishedTimeText) });
    if (out.length >= n) break;
  }
  return out;
}
async function redditSearch(p) {
  const q = need(p.q, 'q'), n = lim(p), enc = encodeURIComponent(q);
  for (const host of ['www.reddit.com', 'old.reddit.com']) {
    try {
      const r = await fetchT(`https://${host}/search.json?q=${enc}&limit=${n}&sort=relevance&raw_json=1`, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 12000);
      if (!r.ok) continue;
      const items = ((await r.json())?.data?.children || []).map((c) => c.data).filter(Boolean).map((x) => ({ id: x.id, title: x.title, subreddit: x.subreddit_name_prefixed, author: x.author, score: x.score, comments: x.num_comments, url: 'https://www.reddit.com' + x.permalink, link: x.url, text: (x.selftext || '').slice(0, 500), created: x.created_utc ? new Date(x.created_utc * 1000).toISOString() : null }));
      if (items.length) return items;
    } catch { /* try next host */ }
  }
  const px = jsonIn((await viaProxy(`https://www.reddit.com/search.json?q=${enc}&limit=${n}&sort=relevance&raw_json=1`)) || '');
  const pItems = (px?.data?.children || []).map((c) => c.data).filter(Boolean).map((x) => ({ id: x.id, title: x.title, subreddit: x.subreddit_name_prefixed, author: x.author, score: x.score, comments: x.num_comments, url: 'https://www.reddit.com' + x.permalink, link: x.url, text: (x.selftext || '').slice(0, 500), created: x.created_utc ? new Date(x.created_utc * 1000).toISOString() : null }));
  if (pItems.length) return pItems;
  let r; try { r = await fetchT(`https://www.reddit.com/search.rss?q=${enc}&limit=${n}&sort=relevance`, { headers: { 'User-Agent': UA } }, 12000); } catch { r = { ok: false, status: 'no answer' }; }
  if (!r.ok) { const b = await redditBackup(q, n); if (b.length) return b; throw new HttpError(502, 'Reddit refused the request (HTTP ' + r.status + ').'); }
  const xml = await r.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, n).map((m) => { const e = m[1], g = (re) => (e.match(re) || [])[1] || '';
    return { title: decodeEntities(g(/<title>([\s\S]*?)<\/title>/)), author: g(/<name>\/u\/([^<]*)<\/name>/), subreddit: g(/<category[^>]*label="([^"]*)"/), url: g(/<link[^>]*href="([^"]*)"/), text: stripHtml(decodeEntities(g(/<content[^>]*>([\s\S]*?)<\/content>/))).slice(0, 500), created: g(/<updated>([^<]*)<\/updated>/) }; });
}
async function tiktokProfile(p) {
  const u = handle(p.username, 'username');
  const html = await page('https://www.tiktok.com/@' + encodeURIComponent(u), { Referer: 'https://www.tiktok.com/' });
  const d = jsonScript(html, /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s)?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
  if (!d?.userInfo?.user) throw new HttpError(404, 'TikTok user not found (or TikTok blocked this server).');
  const { user } = d.userInfo, stats = { ...d.userInfo.stats }, v2 = d.userInfo.statsV2 || {};
  // TikTok's plain counters overflow a 32-bit number for big accounts (negative likes); statsV2 holds the real value as text.
  for (const k of ['followerCount', 'followingCount', 'heartCount', 'videoCount']) if (v2[k] != null && Number.isFinite(Number(v2[k]))) stats[k] = Number(v2[k]); else if (stats[k] < 0) stats[k] += 2 ** 32;
  return [{ id: user.id, username: user.uniqueId, nickname: user.nickname, bio: user.signature, verified: !!user.verified, private: !!user.privateAccount, avatar: user.avatarLarger || user.avatarMedium, followers: stats?.followerCount, following: stats?.followingCount, likes: stats?.heartCount, videos: stats?.videoCount, url: 'https://www.tiktok.com/@' + user.uniqueId }];
}
async function igUser(p) {
  const u = handle(p.username, 'username');
  const r = await fetchT('https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(u), { headers: { 'User-Agent': UA, 'x-ig-app-id': '936619743392459', Accept: '*/*', Referer: 'https://www.instagram.com/' } }, 12000);
  const d = r.ok ? await r.json().catch(() => null) : null;
  if (d?.data?.user) return d.data.user;
  if (r.status === 404) throw new HttpError(404, 'Instagram user not found.');
  return { _og: u };
}
async function igProfileViaSearch(u) {
  const rows = await viaSearch([`site:instagram.com/${u}`, `${u} instagram`], new RegExp('instagram\\.com/' + u.replace(/[^\w.]/g, '') + '/?$', 'i'), new RegExp('instagram\\.com/' + u.replace(/[^\w.]/g, ''), 'i'), 3);
  if (!rows.length) throw new HttpError(404, 'No public Instagram profile found (private, missing or blocked).');
  const m = (rows[0].snippet + ' ' + rows[0].title).match(/([\d.,]+[KMkm]?) Followers?, ([\d.,]+[KMkm]?) Following, ([\d.,]+[KMkm]?) Posts?/);
  return [{ username: u, title: rows[0].title, description: rows[0].snippet, followers: m?.[1] || null, following: m?.[2] || null, posts: m?.[3] || null, url: `https://www.instagram.com/${u}/`, source: 'search engine' }];
}
async function igProfile(p) {
  const x = await igUser(p);
  if (x._og) {
    let html = ''; try { html = await page(`https://www.instagram.com/${x._og}/`, { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' }); } catch { /* use the search engine below */ }
    const title = meta(html, 'og:title'), desc = meta(html, 'og:description');
    if (!title) return igProfileViaSearch(x._og);
    const m = (desc || '').match(/([\d.,KMkm]+) Followers?, ([\d.,KMkm]+) Following, ([\d.,KMkm]+) Posts?/);
    return [{ username: x._og, title, description: desc, followers: m?.[1] || null, following: m?.[2] || null, posts: m?.[3] || null, picture: meta(html, 'og:image'), url: `https://www.instagram.com/${x._og}/` }];
  }
  return [{ id: x.id, username: x.username, fullName: x.full_name, bio: x.biography, verified: !!x.is_verified, private: !!x.is_private, followers: x.edge_followed_by?.count, following: x.edge_follow?.count, posts: x.edge_owner_to_timeline_media?.count, picture: x.profile_pic_url_hd || x.profile_pic_url, website: x.external_url || null, url: 'https://www.instagram.com/' + x.username + '/' }];
}
const igPosts = (videosOnly) => async (p) => {
  const x = await igUser(p);
  if (x._og) {
    const u = x._og.replace(/[^\w.]/g, '');
    const rows = await viaSearch([`site:instagram.com/${u}/${videosOnly ? 'reel' : 'p'}`, `site:instagram.com/${u}`, `${u} instagram ${videosOnly ? 'reels' : 'posts'}`], videosOnly ? /instagram\.com\/(?:[^/]+\/)?(?:reel|reels)\//i : /instagram\.com\/(?:[^/]+\/)?(?:p|reel)\//i, null, lim(p));
    if (!rows.length) throw new HttpError(404, 'No public posts found (private account, wrong name, or Instagram blocked this server).');
    return rows;
  }
  if (x.is_private) throw new HttpError(404, 'This Instagram account is private.');
  const nodes = (x.edge_owner_to_timeline_media?.edges || []).map((e) => e.node).filter((n) => !videosOnly || n.is_video);
  return nodes.slice(0, lim(p)).map((n) => ({ id: n.id, shortcode: n.shortcode, url: 'https://www.instagram.com/p/' + n.shortcode + '/', caption: n.edge_media_to_caption?.edges?.[0]?.node?.text || '', likes: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count, comments: n.edge_media_to_comment?.count, isVideo: !!n.is_video, views: n.video_view_count ?? null, image: n.display_url, taken: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null }));
};
async function xProfile(p) {
  const h = handle(p.username, 'username');
  let tw = [];
  for (const host of ['syndication.twitter.com', 'cdn.syndication.twimg.com']) {
    try {
      const html = await page(`https://${host}/srv/timeline-profile/screen-name/` + encodeURIComponent(h), { Referer: 'https://platform.twitter.com/' });
      const d = jsonScript(html, /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      tw = (d?.props?.pageProps?.timeline?.entries || []).filter((e) => e.type === 'tweet').map((e) => e.content?.tweet).filter(Boolean);
      if (tw.length) break;
    } catch { /* rate-limited (429) or blocked: try the next host */ }
  }
  if (!tw.length) {
    const html = await viaProxy('https://syndication.twitter.com/srv/timeline-profile/screen-name/' + encodeURIComponent(h));
    const d = html && jsonScript(html, /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    tw = (d?.props?.pageProps?.timeline?.entries || []).filter((e) => e.type === 'tweet').map((e) => e.content?.tweet).filter(Boolean);
  }
  if (!tw.length) {
    const found = await viaSearch([`site:x.com/${h}/status`, `site:twitter.com/${h}/status`, `${h} twitter tweets`], new RegExp('(?:x|twitter)\\.com/' + h.replace(/[^\w]/g, '') + '/status/\\d+', 'i'), null, lim(p));
    if (found.length) return found;
    throw new HttpError(404, 'No public tweets found (wrong name, protected account or X blocked this server).');
  }
  return tw.slice(0, lim(p)).map((t) => ({ id: t.id_str, text: t.full_text || t.text, author: t.user?.screen_name, name: t.user?.name, likes: t.favorite_count, replies: t.reply_count, retweets: t.retweet_count, created: t.created_at, url: `https://x.com/${t.user?.screen_name || h}/status/${t.id_str}` }));
}
async function fbPage(p) { return [await ogDetails(safeUrl(p.url, ['facebook.com']), 'Facebook')]; }

// ---- TikTok through the free tikwm.com public API (no key; it allows ~1 request per second, so one retry) ----
async function tikwm(path, params, post = false) {
  for (let i = 0; i < 2; i++) {
    const qs = new URLSearchParams(params);
    const r = await fetchT('https://www.tikwm.com/api/' + path + (post ? '' : '?' + qs), post ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, body: qs } : { headers: { 'User-Agent': UA } }, 15000);
    const d = await r.json().catch(() => null);
    if (d?.code === 0) return d.data;
    if (i === 0 && /limit/i.test(d?.msg || '')) { await new Promise((ok) => setTimeout(ok, 1300)); continue; }
    throw new HttpError(502, 'TikTok lookup service: ' + (d?.msg || 'HTTP ' + r.status));
  }
}
const ttVideo = (v) => ({ id: v.video_id || v.id, title: v.title, author: v.author?.unique_id, nickname: v.author?.nickname, plays: v.play_count, likes: v.digg_count, comments: v.comment_count, shares: v.share_count, cover: v.cover, video: v.play, created: v.create_time ? new Date(v.create_time * 1000).toISOString() : null, url: v.author?.unique_id ? `https://www.tiktok.com/@${v.author.unique_id}/video/${v.video_id || v.id}` : null });
async function tiktokSearch(p) {
  const prm = { keywords: need(p.q, 'q'), count: String(lim(p)), cursor: '0', HD: '1' };
  let d; try { d = await tikwm('feed/search', prm); } catch (e1) { try { d = await tikwm('feed/search', prm, true); } catch (e2) { d = null; } }
  const v = (d?.videos || []).slice(0, lim(p)).map(ttVideo);
  if (v.length) return v;
  return viaSearch([`site:tiktok.com/@ ${prm.keywords}`, `${prm.keywords} tiktok video`], /tiktok\.com\/@[^/]+\/video\/\d+/, /tiktok\.com\//, lim(p));
}
async function tiktokHashtag(p) {
  const tag = need(p.tag, 'tag', 60).replace(/^#/, '');
  try {
    const c = await tikwm('challenge/search', { keywords: tag, count: '1', cursor: '0' });
    const id = c?.challenge_list?.[0]?.id || c?.challenge_list?.[0]?.cid;
    if (id) { const d = await tikwm('challenge/posts', { challenge_id: id, count: String(lim(p)), cursor: '0' }); const v = (d?.videos || []).slice(0, lim(p)).map(ttVideo); if (v.length) return v; }
  } catch { /* fall back to a plain #tag search */ }
  const d = await tikwm('feed/search', { keywords: '#' + tag, count: String(lim(p)), cursor: '0', HD: '1' }, true);
  return (d?.videos || []).slice(0, lim(p)).map(ttVideo);
}
async function tiktokComments(p) {
  const d = await tikwm('comment/list/', { url: safeUrl(p.url, ['tiktok.com']), count: String(lim(p)), cursor: '0' });
  return (d?.comments || []).slice(0, lim(p)).map((c) => ({ id: c.id, text: c.text, author: c.user?.unique_id, nickname: c.user?.nickname, likes: c.digg_count, replies: c.reply_total, created: c.create_time ? new Date(c.create_time * 1000).toISOString() : null }));
}
// ---- Search-engine based (Bing / DuckDuckGo, no key): public posts that the engines have indexed ----
const viaSearch = async (queries, strict, loose, n) => {
  const seen = new Set(), out = [];
  for (const q of [].concat(queries)) {
    let d; try { d = await webSearch({ q, limit: 20 }, {}); } catch { continue; }
    for (const r of d.results) { if (!seen.has(r.url) && (strict.test(r.url) || loose?.test(r.url))) { seen.add(r.url); out.push({ title: r.title, url: r.url, snippet: r.snippet, _strict: strict.test(r.url) }); } }
    if (out.filter((x) => x._strict).length >= n) break;
  }
  return out.sort((x, y) => y._strict - x._strict).slice(0, n).map(({ _strict, ...x }) => x);
};
const X_URL = /(?:x|twitter)\.com\/[^/?#]+\/status\/\d+/, X_ANY = /(?:^|\/\/)(?:www\.|mobile\.)?(?:x|twitter)\.com\//;
const xSearch = (p) => { const q = need(p.q, 'q', 100); return viaSearch([`site:x.com ${q}`, `site:twitter.com ${q}`, `${q} twitter tweet`], X_URL, X_ANY, lim(p)); };
const IG_URL = /instagram\.com\/(?:p|reel|reels)\//, IG_ANY = /instagram\.com\//;
const igHashtag = (p) => { const t = need(p.tag, 'tag', 60).replace(/^#/, ''); return viaSearch([`site:instagram.com #${t}`, `site:instagram.com ${t}`, `#${t} instagram`], IG_URL, IG_ANY, lim(p)); };
const fbPosts = (p) => {
  const u = new URL(safeUrl(p.url, ['facebook.com'])), slug = u.pathname.split('/').filter(Boolean)[0] || '';
  if (!slug) throw new HttpError(400, 'Give the page link, e.g. https://www.facebook.com/nasa');
  const sl = slug.replace(/[^\w.-]/g, '');
  return viaSearch([`site:facebook.com/${sl}`, `${sl} facebook page posts`], new RegExp('facebook\\.com/' + sl + '/(?:posts|videos|photos|reel)|permalink|story_fbid', 'i'), new RegExp('facebook\\.com/' + sl, 'i'), lim(p));
};
const FREE = { 'tiktok/search': tiktokSearch, 'tiktok/hashtag': tiktokHashtag, 'tiktok/comments': tiktokComments, 'twitter/search': xSearch, 'instagram/hashtag': igHashtag, 'facebook/posts': fbPosts,  'youtube/search': ytSearch, 'youtube/comments': ytComments, 'reddit/search': redditSearch, 'tiktok/profile': tiktokProfile, 'instagram/profile': igProfile, 'instagram/posts': igPosts(false), 'instagram/reels': igPosts(true), 'twitter/profile': xProfile, 'facebook/page': fbPage };
// [path, name, desc, actor, params, build(p) -> input, platform]
const E = (path, name, desc, actor, params, build, platform) => {
  const free = FREE[path];
  return {
    path: '/api/social/' + path, category: 'Social', name, cost: free ? 1 : 3, isNew: true, desc: desc + (free ? '' : ' (via Apify)'), ...(free ? {} : { needsEnv: ['APIFY_TOKEN'], noProbe: true }), params,
    run: async (p, env) => {
      const input = build(p); // validates the input first (400 on bad input)
      if (free) {
        try { const items = await cached('free:' + path + ':' + JSON.stringify(p), 300, () => free(p, env)); if (items?.length) return { platform, count: items.length, items }; }
        catch (e) { if (!env.APIFY_TOKEN || (e instanceof HttpError && e.status === 400)) throw e; }
        if (!env.APIFY_TOKEN) throw new HttpError(404, 'Nothing found (private / empty / wrong name).');
      }
      const items = await runActor(actor, input, env); return { platform, count: items.length, items };
    }
  };
};
const L = param('limit', '10', '1-30 results', false);

export default [
  E('tiktok/profile', 'TikTok Profile', 'Profile info + latest videos of a TikTok user', 'clockworks~tiktok-scraper', [param('username', 'khaby.lame', 'TikTok username'), L], (p) => ({ profiles: [handle(p.username, 'username')], resultsPerPage: lim(p, 5), shouldDownloadVideos: false, shouldDownloadCovers: false }), 'tiktok'),
  E('tiktok/search', 'TikTok Search', 'Search TikTok videos by keyword', 'clockworks~tiktok-scraper', [param('q', 'sri lanka', 'Search text'), L], (p) => ({ searchQueries: [need(p.q, 'q')], resultsPerPage: lim(p), shouldDownloadVideos: false }), 'tiktok'),
  E('tiktok/hashtag', 'TikTok Hashtag', 'Top videos of a TikTok hashtag', 'clockworks~tiktok-scraper', [param('tag', 'srilanka', 'Hashtag (no #)'), L], (p) => ({ hashtags: [need(p.tag, 'tag', 60).replace(/^#/, '')], resultsPerPage: lim(p), shouldDownloadVideos: false }), 'tiktok'),
  E('tiktok/comments', 'TikTok Comments', 'Comments of a public TikTok video', 'clockworks~tiktok-comments-scraper', [param('url', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', 'TikTok video link'), L], (p) => ({ postURLs: [safeUrl(p.url, ['tiktok.com'])], commentsPerPost: lim(p, 20) }), 'tiktok'),
  E('instagram/profile', 'Instagram Profile', 'Public profile info: bio, followers, posts count', 'apify~instagram-profile-scraper', [param('username', 'instagram', 'Instagram username')], (p) => ({ usernames: [handle(p.username, 'username')] }), 'instagram'),
  E('instagram/posts', 'Instagram Posts', 'Latest posts of a public Instagram user', 'apify~instagram-post-scraper', [param('username', 'natgeo', 'Instagram username'), L], (p) => ({ username: [handle(p.username, 'username')], resultsLimit: lim(p) }), 'instagram'),
  E('instagram/reels', 'Instagram Reels', 'Latest reels of a public Instagram user', 'apify~instagram-reel-scraper', [param('username', 'natgeo', 'Instagram username'), L], (p) => ({ username: [handle(p.username, 'username')], resultsLimit: lim(p) }), 'instagram'),
  E('instagram/hashtag', 'Instagram Hashtag', 'Recent posts of an Instagram hashtag', 'apify~instagram-hashtag-scraper', [param('tag', 'srilanka', 'Hashtag (no #)'), L], (p) => ({ hashtags: [need(p.tag, 'tag', 60).replace(/^#/, '')], resultsLimit: lim(p) }), 'instagram'),
  E('twitter/search', 'X (Twitter) Search', 'Search public tweets by keyword', 'apidojo~tweet-scraper', [param('q', 'sri lanka cricket', 'Search text'), param('limit', '10', '1-30 tweets', false)], (p) => ({ searchTerms: [need(p.q, 'q')], maxItems: lim(p), sort: 'Latest' }), 'twitter'),
  E('twitter/profile', 'X (Twitter) Profile Tweets', 'Latest tweets of a public X account', 'apidojo~tweet-scraper', [param('username', 'elonmusk', 'X username'), param('limit', '10', '1-30 tweets', false)], (p) => ({ twitterHandles: [handle(p.username, 'username')], maxItems: lim(p), sort: 'Latest' }), 'twitter'),
  E('youtube/search', 'YouTube Search', 'Search YouTube videos (title, views, channel, likes)', 'streamers~youtube-scraper', [param('q', 'sinhala songs', 'Search text'), param('limit', '10', '1-30 videos', false)], (p) => ({ searchQueries: [need(p.q, 'q')], maxResults: lim(p), maxResultsShorts: 0, maxResultStreams: 0 }), 'youtube'),
  E('youtube/comments', 'YouTube Comments', 'Comments of a YouTube video', 'streamers~youtube-comments-scraper', [param('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube link'), L], (p) => ({ startUrls: [{ url: safeUrl(p.url, ['youtube.com', 'youtu.be']) }], maxComments: lim(p, 20) }), 'youtube'),
  E('facebook/page', 'Facebook Page', 'Public Facebook page info (likes, followers, contact)', 'apify~facebook-pages-scraper', [param('url', 'https://www.facebook.com/nasa', 'Facebook page link')], (p) => ({ startUrls: [{ url: safeUrl(p.url, ['facebook.com']) }] }), 'facebook'),
  E('facebook/posts', 'Facebook Posts', 'Latest public posts of a Facebook page', 'apify~facebook-posts-scraper', [param('url', 'https://www.facebook.com/nasa', 'Facebook page link'), L], (p) => ({ startUrls: [{ url: safeUrl(p.url, ['facebook.com']) }], resultsLimit: lim(p, 5) }), 'facebook'),
  E('reddit/search', 'Reddit Search', 'Search Reddit posts by keyword', 'trudax~reddit-scraper-lite', [param('q', 'sri lanka', 'Search text'), L], (p) => ({ searches: [need(p.q, 'q')], type: 'posts', sort: 'relevance', maxItems: lim(p), skipComments: true }), 'reddit')
];
