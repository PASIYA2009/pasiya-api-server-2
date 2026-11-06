// Auth, coin charging, rate limiting and usage stats for every public API call.
import { HttpError, json, sha256, stamp, CREATOR, CORS } from './util.js';
import * as fs from './db.js';
import { getFlags } from './flags.js';

// ---- identity (dashboard login, Firebase ID token) ----
const idCache = new Map();
export async function identity(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!m) throw new HttpError(401, 'Please sign in first.');
  const hit = idCache.get(m[1]);
  if (hit && hit.exp > Date.now()) return hit.u;
  if (!env.FIREBASE_WEB_API_KEY) throw new HttpError(503, 'FIREBASE_WEB_API_KEY is missing.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.users?.[0]) throw new HttpError(401, 'Sign-in token is invalid or expired. Sign in again.');
  const u = { uid: d.users[0].localId, email: (d.users[0].email || '').toLowerCase(), verified: !!d.users[0].emailVerified };
  if (idCache.size > 200) idCache.clear();
  idCache.set(m[1], { u, exp: Date.now() + 60_000 });
  return u;
}

// Admin = an email listed in ADMIN_EMAIL (comma separated allowed) AND that email is verified
// (nobody can register the owner's address with a password and take over).
// Gmail addresses are compared the way Google does: dots and +tags are ignored.
const canon = (e) => {
  e = String(e || '').trim().toLowerCase();
  const [l, d] = e.split('@');
  if (!l || !d) return e;
  return d === 'gmail.com' || d === 'googlemail.com' ? l.split('+')[0].replace(/\./g, '') + '@gmail.com' : l + '@' + d;
};
export const isAdminEmail = (email, env, verified = true) => {
  if (!email || !verified) return false;
  const admins = String(env.ADMIN_EMAIL || '').split(/[,;\s]+/).filter(Boolean).map(canon);
  return admins.includes(canon(email));
};

export async function loadProfile(env, u) {
  let p = await fs.get(env, 'users', u.uid);
  if (!p) {
    p = { uid: u.uid, email: u.email, role: 'user', coins: Number(env.SIGNUP_COINS ?? 100), totalRequests: 0, createdAt: stamp(), lastDailyClaim: null, emailVerified: u.verified };
    await fs.set(env, 'users', u.uid, p);
  } else if (p.emailVerified !== u.verified || p.email !== u.email) {
    p.emailVerified = u.verified; p.email = u.email;
    await fs.commit(env, [{ merge: ['users', u.uid, { emailVerified: u.verified, email: u.email }] }]);
  }
  return p;
}

// Dashboard session: { u, p, isAdmin }
export async function session(req, env) {
  const u = await identity(req, env);
  const p = await loadProfile(env, u);
  return { u, p, isAdmin: isAdminEmail(u.email, env, u.verified) };
}

// ---- API key lookup (key doc id = sha256(key)) ----
const keyCache = new Map();
export const readKey = (req, url) => (req.headers.get('X-API-Key') || url.searchParams.get('apikey') || url.searchParams.get('key') || '').trim();
async function keyOwner(env, raw) {
  const hash = await sha256(raw);
  const hit = keyCache.get(hash);
  if (hit && hit.exp > Date.now()) return hit.uid;
  let k = await fs.get(env, 'apiKeys', hash);
  if (!k) k = (await fs.query(env, 'apiKeys', 'hash', hash, 1))[0]; // keys made by the old version
  if (!k || k.revoked) throw new HttpError(401, 'Invalid or revoked API key.');
  if (keyCache.size > 500) keyCache.clear();
  keyCache.set(hash, { uid: k.uid, exp: Date.now() + 300_000 });
  return k.uid;
}
export const forgetKeys = () => keyCache.clear();

// API caller: API key (query/header) OR a dashboard login token.
// Optional: ALLOW_KEYLESS=1 lets anonymous callers (by IP) use FREE endpoints (cost 0). Off by default.
async function caller(req, env, url, def) {
  const raw = readKey(req, url);
  if (raw) {
    const uid = await keyOwner(env, raw);
    const p = await fs.get(env, 'users', uid);
    if (!p) throw new HttpError(401, 'Key owner not found.');
    return { u: { uid, email: p.email }, p, isAdmin: isAdminEmail(p.email, env, p.emailVerified !== false) };
  }
  if (req.headers.get('Authorization')) return session(req, env);
  if (env.ALLOW_KEYLESS !== '1' || def.cost > 0) throw new HttpError(401, 'API key required. Add ?apikey=YOUR_KEY or the X-API-Key header. Get your free key on the dashboard.');
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'anon';
  return { u: { uid: 'ip:' + ip, email: null }, p: { coins: 0 }, isAdmin: false, anonymous: true };
}

// ---- per-user rate limit (per server instance; cheap protection against loops) ----
const bucket = new Map();
function rateLimit(uid, env, anon) {
  const max = anon ? Number(env.ANON_RATE_LIMIT_PER_MIN || 30) : Number(env.RATE_LIMIT_PER_MIN || 40), now = Date.now();
  let b = bucket.get(uid);
  if (!b || b.reset < now) { b = { n: 0, reset: now + 60_000 }; bucket.set(uid, b); if (bucket.size > 2000) bucket.clear(); }
  if (++b.n > max) throw new HttpError(429, `Rate limit: ${max} requests per minute. Slow down.`);
}

// ---- request parameters (query + JSON body) ----
export async function params(req, url) {
  const out = Object.fromEntries(url.searchParams);
  delete out.apikey; delete out.key;
  if (req.method === 'POST' && (req.headers.get('content-type') || '').includes('json')) {
    const text = await req.text();
    if (text.length > 20_000) throw new HttpError(413, 'Request body too large.');
    try { Object.assign(out, JSON.parse(text || '{}')); } catch { throw new HttpError(400, 'Body must be valid JSON.'); }
  }
  return out;
}

// ---- stats: one atomic write per request, hourly buckets ----
const hourId = (d = new Date()) => 'h' + d.toISOString().slice(0, 13).replace(/\D/g, '');
async function record(env, { uid, path, status, ms, cost }) {
  const ops = [{ inc: { doc: ['stats', hourId()], by: { req: 1, err: status >= 400 ? 1 : 0, ms: Math.round(ms) } } }];
  if (status < 400 && cost > 0) {
    ops.push({ inc: { doc: ['users', uid], by: { coins: -cost, totalRequests: 1 } } });
    ops.push({ create: ['usage', { uid, endpoint: path, status: 'success', coins: cost, createdAt: stamp() }] });
  }
  try { await fs.commit(env, ops); } catch (e) { console.error('record failed', e?.message); }
}

// ---- live endpoint health: last real result per endpoint (per server instance, no DB writes) ----
const health = new Map();
export const endpointHealth = () => Object.fromEntries(health);
const noteHealth = (path, status) => {
  // only real outcomes count: success = working, 5xx = the upstream site is failing. 4xx (bad input, no coins, rate limit) says nothing.
  if (status < 400) health.set(path, { ok: true, t: Date.now() });
  else if (status >= 500) health.set(path, { ok: false, t: Date.now() });
};

// ---- the wrapper every public endpoint goes through ----
export async function serve(req, env, def) {
  const t0 = Date.now(), url = new URL(req.url);
  let who = null, status = 200, body;
  try {
    who = await caller(req, env, url, def);
    rateLimit(who.u.uid, env, who.anonymous);
    if (!who.isAdmin && (await getFlags(env)).disabledApis.includes(def.path)) throw new HttpError(503, 'This API is switched off by the admin right now.');
    if (def.cost > 0 && !who.isAdmin && !who.anonymous && (who.p.coins || 0) < def.cost) throw new HttpError(402, 'Not enough coins. Claim your daily coins, spin the wheel or ask the admin.');
    const p = await params(req, url);
    const result = await def.run(p, env, req);
    body = { creator: CREATOR, success: true, website: url.origin, query: p, result };
  } catch (e) {
    status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error(def.path, e?.stack || e);
    body = { creator: CREATOR, success: false, website: url.origin, error: e instanceof HttpError ? e.message : 'Internal error. Try again.' };
  }
  const ms = Date.now() - t0;
  noteHealth(def.path, status);
  if (who && env.FIREBASE_SERVICE_ACCOUNT_JSON) await record(env, { uid: who.u.uid, path: def.path, status, ms, cost: who.isAdmin || who.anonymous ? 0 : def.cost || 0 });
  if (status < 400 && body.result?.__binary) {
    const b = body.result;
    return new Response(b.__binary, { status: 200, headers: { 'Content-Type': b.contentType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${String(b.filename || 'download').replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'no-store', ...CORS, 'X-Response-Time': ms + 'ms' } });
  }
  return json(body, status, { 'X-Response-Time': ms + 'ms' });
}

// ---- public live stats ----
export async function statsLast24h(env) {
  const now = Date.now();
  const docs = await fs.batchGet(env, 'stats', Array.from({ length: 24 }, (_, i) => hourId(new Date(now - i * 3600_000))));
  let req = 0, err = 0, ms = 0;
  for (const d of docs) { req += d.req || 0; err += d.err || 0; ms += d.ms || 0; }
  return { requests: req, errors: err, avgMs: req ? Math.round(ms / req) : 0, successRate: req ? Math.round(((req - err) / req) * 1000) / 10 : 100 };
}
