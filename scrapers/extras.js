// Extra keyless tools built from public, legal sources: F-Droid apps, Internet Archive music, TikTok public avatars,
// Wikimedia live wallpapers (video) and a small "download this page as ZIP" tool.
import { HttpError, fetchT, cached, clamp, stripHtml, decodeEntities, param } from '../system/util.js';

const UA = 'PASIYA-API/3.3';
const q120 = (p, k = 'q') => { const v = String(p[k] || '').trim(); if (!v || v.length > 120) throw new HttpError(400, `${k} is required (max 120 characters).`); return v; };
const getJson = (url, ttl = 300) => cached('x:' + url, ttl, async () => {
  const r = await fetchT(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 12000);
  if (r.status === 404) throw new HttpError(404, 'Not found.');
  if (!r.ok) throw new HttpError(502, 'Source answered HTTP ' + r.status);
  return r.json();
});

// ---- APK: F-Droid (free & open-source Android apps, official repo) ----
async function apk(p) {
  const pkg = String(p.package || '').trim();
  if (pkg) {
    if (!/^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/.test(pkg)) throw new HttpError(400, 'package must look like org.example.app');
    const d = await getJson('https://f-droid.org/api/v1/packages/' + pkg, 1800);
    const v = d.packages?.find((x) => x.versionCode === d.suggestedVersionCode) || d.packages?.[0];
    if (!v) throw new HttpError(404, 'No release found for that package.');
    return { package: pkg, version: v.versionName, versionCode: v.versionCode, download: `https://f-droid.org/repo/${pkg}_${v.versionCode}.apk`, page: `https://f-droid.org/packages/${pkg}/`, source: 'F-Droid (official, signed by F-Droid)' };
  }
  const q = q120(p), limit = clamp(p.limit, 1, 20, 10);
  const html = await cached('fd:' + q, 600, async () => {
    const r = await fetchT('https://search.f-droid.org/?lang=en&q=' + encodeURIComponent(q), { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok) throw new HttpError(502, 'F-Droid search answered HTTP ' + r.status);
    return r.text();
  });
  const out = [];
  for (const m of html.matchAll(/<a class="package-header"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = decodeEntities(m[1]).match(/\/packages\/([^/?#]+)/)?.[1]; if (!id) continue;
    out.push({ package: id, name: stripHtml(m[2].match(/class="package-name"[^>]*>([\s\S]*?)<\//i)?.[1] || id), summary: stripHtml(m[2].match(/class="package-summary"[^>]*>([\s\S]*?)<\//i)?.[1] || ''), icon: m[2].match(/<img[^>]+src="([^"]+)"/i)?.[1] || null, page: `https://f-droid.org/packages/${id}/` });
    if (out.length >= limit) break;
  }
  return { query: q, count: out.length, results: out, tip: 'Call again with package=<id> to get the direct APK link.' };
}

// ---- Free music: Internet Archive audio (public domain / free licences) ----
async function music(p) {
  const q = q120(p), limit = clamp(p.limit, 1, 25, 10);
  const d = await getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q.replace(/[()"]/g, ' ')}) AND mediatype:audio`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=downloads&sort[]=downloads+desc&rows=${limit}&output=json`);
  const docs = d.response?.docs || [];
  return { query: q, count: docs.length, results: docs.map((x) => ({ id: x.identifier, title: x.title, creator: Array.isArray(x.creator) ? x.creator.join(', ') : x.creator || null, downloads: x.downloads, page: `https://archive.org/details/${x.identifier}`, files: `https://archive.org/download/${x.identifier}/` })), note: 'Only free / public-domain audio from the Internet Archive.' };
}

// ---- TikTok public profile picture (the avatar anyone can see on the public profile) ----
async function tiktokDp(p) {
  const u = String(p.username || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_.]{2,24}$/.test(u)) throw new HttpError(400, 'username must be a TikTok username (letters, numbers, _ and .).');
  const d = await cached('ttdp:' + u.toLowerCase(), 1800, async () => {
    const r = await fetchT('https://www.tikwm.com/api/user/info?unique_id=' + encodeURIComponent(u), { headers: { 'User-Agent': UA } }, 15000);
    const j = await r.json().catch(() => ({}));
    if (j.code !== 0 || !j.data?.user) throw new HttpError(404, 'TikTok account not found (or private).');
    return j.data;
  });
  const x = d.user;
  return { username: x.uniqueId, nickname: x.nickname, verified: !!x.verified, avatar: x.avatarLarger || x.avatarMedium || x.avatarThumb, followers: d.stats?.followerCount ?? null, note: 'Public profile picture only.' };
}

// ---- Live wallpapers: short public videos from Wikimedia Commons ----
async function liveWall(p) {
  const q = q120(p), limit = clamp(p.limit, 1, 20, 8);
  const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent('filetype:video ' + q)}&prop=imageinfo&iiprop=url|size|mime|extmetadata`);
  const pages = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return { query: q, count: pages.length, results: pages.map((x) => { const i = x.imageinfo?.[0] || {}; return { title: String(x.title || '').replace(/^File:/, ''), video: i.url, type: i.mime, width: i.width, height: i.height, license: i.extmetadata?.LicenseShortName?.value || null, source: i.descriptionurl }; }) };
}

// ---- Web2Zip: one public page + its same-site CSS / JS / images as a ZIP (stored, no compression) ----
const BAD_HOST = /^(localhost|.*\.(local|internal|localdomain|lan|home))$/i;
function pub(raw) {
  let u; try { u = new URL(/^https?:\/\//i.test(String(raw).trim()) ? String(raw).trim() : 'https://' + String(raw).trim()); } catch { throw new HttpError(400, 'url must be a valid website address.'); }
  const h = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || u.username || (u.port && !['80', '443'].includes(u.port)) || BAD_HOST.test(h) || !h.includes('.') || h.includes(':')) throw new HttpError(400, 'Only public http(s) websites are allowed.');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) { const [a, b] = h.split('.').map(Number); if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) throw new HttpError(400, 'Private addresses are not allowed.'); }
  return u;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) { // files: [{ name, data: Uint8Array }]
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length;
  }
  const cs = cen.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return Buffer.concat([...parts, ...cen, new Uint8Array(e.buffer)].map((x) => Buffer.from(x.buffer, x.byteOffset, x.length)));
}
async function web2zip(p) {
  const page = pub(p.url), t0 = Date.now(), MAX_FILES = 40, MAX_TOTAL = 12 * 1024 * 1024, MAX_ONE = 3 * 1024 * 1024;
  const get = async (u, max) => {
    let cur = u, r;
    for (let i = 0; i < 4; i++) {
      r = await fetchT(cur.toString(), { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PASIYA-Web2Zip/1.0)' } }, 8000);
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { const n = pub(new URL(r.headers.get('location'), cur).toString()); if (n.hostname !== u.hostname) throw new HttpError(400, 'The page redirects to another site.'); cur = n; continue; }
      break;
    }
    if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, 'Site answered HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw new HttpError(413, 'File is too large.');
    return { buf, type: r.headers.get('content-type') || '', url: cur };
  };
  const main = await get(page, 2 * 1024 * 1024);
  let html = main.buf.toString('utf8');
  const files = new Map(), local = new Map(); let total = 0;
  const localName = (u) => { let n = decodeURIComponent(u.pathname).replace(/^\/+/, '').replace(/[^\w./-]/g, '_').replace(/\.\.+/g, '.'); if (!n || n.endsWith('/')) n += 'index'; if (u.search) n += '_' + (crc32(Buffer.from(u.search)) >>> 0).toString(16); return 'assets/' + n; };
  const grab = async (raw, base) => {
    if (!raw || /^(data:|#|mailto:|javascript:)/i.test(raw)) return null;
    let u; try { u = new URL(decodeEntities(raw), base); } catch { return null; }
    if (u.hostname !== page.hostname || !/^https?:$/.test(u.protocol)) return null;
    u.hash = ''; const key = u.toString();
    if (local.has(key)) return local.get(key);
    if (files.size >= MAX_FILES || total >= MAX_TOTAL || Date.now() - t0 > 20000) return null;
    try { const f = await get(u, MAX_ONE); const name = localName(u); total += f.buf.length; files.set(name, f.buf); local.set(key, name); return name; } catch { return null; }
  };
  const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)];
  const seen = new Set();
  for (const m of refs) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    if (!/\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|json)(\?|$)/i.test(m[1])) continue;
    const name = await grab(m[1], main.url); if (!name) continue;
    html = html.split(m[1]).join(name);
    if (/\.css(\?|$)/i.test(name) || name.endsWith('.css')) { // one level of url(...) inside stylesheets
      let css = files.get(name).toString('utf8');
      for (const c of [...css.matchAll(/url\(\s*["']?([^)"']+?)["']?\s*\)/gi)]) { const sub = await grab(c[1], new URL(m[1], main.url)); if (sub) css = css.split(c[1]).join('../'.repeat(name.split('/').length - 1) + sub); }
      files.set(name, Buffer.from(css));
    }
  }
  const zip = makeZip([{ name: 'index.html', data: Buffer.from(html) }, ...[...files].map(([name, data]) => ({ name, data }))]);
  return { __binary: zip, contentType: 'application/zip', filename: page.hostname.replace(/[^\w.-]/g, '_') + '.zip' };
}

export default [
  { path: '/api/search/apk', category: 'Search', name: 'APK Search (F-Droid)', cost: 0, isNew: true, desc: 'Search free & open-source Android apps and get the official APK link', params: [param('q', 'vlc', 'App name (or use package)', false), param('package', '', 'e.g. org.videolan.vlc for the direct APK link', false), param('limit', '10', 'Max 20', false)], run: apk },
  { path: '/api/search/music', category: 'Search', name: 'Free Music Search', cost: 0, isNew: true, desc: 'Free & public-domain audio from the Internet Archive', params: [param('q', 'sinhala folk', 'Search text'), param('limit', '10', 'Max 25', false)], run: music },
  { path: '/api/search/wallpaper3', category: 'Search', name: 'Wallpaper: Live', cost: 0, isNew: true, desc: 'Find live (video) wallpapers from Wikimedia Commons', params: [param('q', 'waterfall', 'Search text'), param('limit', '8', 'Max 20', false)], run: liveWall },
  { path: '/api/tiktok-profile-dl', category: 'Utility', name: 'TikTok Profile DL', cost: 0, isNew: true, desc: 'Public profile picture of a TikTok account by username', params: [param('username', 'khaby.lame', 'TikTok username')], run: tiktokDp },
  { path: '/api/tools/web2zip', category: 'Utility', name: 'Web2Zip', cost: 0, isNew: true, desc: 'Download one public page with its CSS / JS / images as a ZIP (max 40 files, 12 MB)', params: [param('url', 'https://example.com', 'Website address')], run: web2zip }
];
