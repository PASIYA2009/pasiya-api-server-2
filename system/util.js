// Shared helpers for the whole project (system + scrapers). Dependency-free.
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const CREATOR = 'Pasidu Eshan';
export const SITE = 'PASIYA API';
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-API-Key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400'
};
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...extra } });

export const stamp = () => new Date().toISOString();
const enc = new TextEncoder();
export const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export const randomHex = (bytes = 24) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const clamp = (n, lo, hi, d) => { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : d; };

// ---- endpoint description helpers (used by every scraper file) ----
export const param = (name, example, desc, required = true) => ({ name, example, desc, required });

// ---- text helpers ----
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
export const stripHtml = (s) => decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---- fetch with timeout ----
export async function fetchT(url, opts = {}, ms = 12000) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new HttpError(504, 'Upstream service took too long to answer.');
    throw new HttpError(502, 'Could not reach the upstream service.');
  }
}

// ---- cache with "stale if error" (per server instance memory) ----
// Fresh copy lives `ttlSec`. If the 3rd-party site is down, the last good copy (up to 7 days) is served instead.
const mem = new Map();
const MEM_MAX = 300;
const STALE_MS = 7 * 86400_000;
export async function cached(key, ttlSec, fn) {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && hit.exp > now) return hit.v;
  let v;
  try { v = await fn(); }
  catch (e) {
    // Only upstream/network failures fall back to old data; "not found" / bad input must still reach the caller.
    if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
    if (hit && hit.stale > now) return hit.v;
    throw e;
  }
  if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value);
  mem.set(key, { v, exp: now + ttlSec * 1000, stale: now + STALE_MS });
  return v;
}

// ---- YouTube link -> 11-character video id (accepts watch, youtu.be, shorts, embed, music.youtube.com links or a bare id) ----
export function ytId(input) {
  const t = String(input || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  let u; try { u = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t); } catch { return null; }
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (h === 'youtu.be') id = u.pathname.split('/')[1];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') id = u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/) || [])[1];
  return /^[\w-]{11}$/.test(id || '') ? id : null;
}
