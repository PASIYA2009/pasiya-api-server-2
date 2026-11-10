// Dashboard account endpoints: profile, API keys, daily claim, lucky spin, usage, admin tools.
import { HttpError, stamp, sha256, randomHex, ytId } from './util.js';
import * as fs from './db.js';
import { session, identity, forgetKeys, isAdminEmail } from './gateway.js';
import { getFlags, resetFlags } from './flags.js';
import { ENDPOINTS, listCatalog } from './registry.js';

// ---- rewards: values are editable by the admin (Firestore settings/rewards) -------------------
// Spin wheel: [share of the max reward, weight]. The wheel in the browser only animates what the server decided.
const SPIN_SHAPE = [[0.04, 45], [0.1, 28], [0.2, 15], [0.4, 8], [1, 4]];
const posInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
async function rewardSettings(env) {
  let s = null;
  try { s = await fs.get(env, 'settings', 'rewards'); } catch { /* fall back to defaults */ }
  const daily = posInt(s?.dailyCoins, 1, 100000) ? s.dailyCoins : Number(env.DAILY_COINS || 5);
  const max = posInt(s?.spinMax, 5, 1000000) ? s.spinMax : 250;
  const rewards = SPIN_SHAPE.map(([f]) => Math.max(1, Math.round(max * f)));
  return { dailyCoins: daily, spinMax: max, spinRewards: rewards };
}
// "Today" follows Sri Lanka time (UTC+5:30) so claims reset at local midnight. Override with RESET_UTC_OFFSET_MIN.
const today = (env) => new Date(Date.now() + Number(env.RESET_UTC_OFFSET_MIN ?? 330) * 60000).toISOString().slice(0, 10);
const body = async (req) => { try { return await req.json(); } catch { throw new HttpError(400, 'Body must be valid JSON.'); } };

// ---- background music: the playlist is stored in Firestore settings/music and edited from the Admin Panel ----
export const DEFAULT_TRACKS = [{ id: '-LDyd-Cba0A', title: '' }];
export async function getTracks(env) {
  let s = null;
  try { s = await fs.get(env, 'settings', 'music'); } catch { /* use default */ }
  if (!s || !Array.isArray(s.tracks)) return DEFAULT_TRACKS;
  return s.tracks.filter((t) => t && /^[\w-]{11}$/.test(t.id || '')).map((t) => ({ id: t.id, title: String(t.title || '').slice(0, 120) }));
}

// ---- default theme colour: stored in Firestore settings/theme, edited from the Admin Panel. Shown to visitors who have not picked a colour themselves. ----
export const ACCENTS = ['blue', 'purple', 'green', 'amber', 'red', 'pink', 'cyan', 'lime'];
export async function getTheme(env) {
  let s = null;
  try { s = await fs.get(env, 'settings', 'theme'); } catch { /* use default */ }
  return { accent: ACCENTS.includes(s?.accent) ? s.accent : 'blue' };
}

const resolveBucket = new Map();
export async function account(req, env, p, m) {
  if (p === '/api/music' && m === 'GET') return { success: true, tracks: await getTracks(env) };
  if (p === '/api/theme' && m === 'GET') return { success: true, ...(await getTheme(env)), accents: ACCENTS };
  if (p === '/api/me' && m === 'GET') {
    const c = await session(req, env);
    const r = await rewardSettings(env), fl = await getFlags(env);
    return { ...c.p, rewardsOn: { daily: fl.dailyEnabled && !c.isAdmin, spin: fl.spinEnabled && !c.isAdmin }, emailVerified: c.u.verified ?? c.p.emailVerified, role: c.isAdmin ? 'admin' : 'user', unlimited: c.isAdmin, adminPending: !c.isAdmin && isAdminEmail(c.u.email, env, true), today: today(env), dailyCoins: r.dailyCoins, spinRewards: r.spinRewards };
  }
  // ---- username (register page) + username -> email lookup (login page) ----
  if (p === '/api/auth/username' && m === 'POST') {
    const c = await session(req, env);
    const b = await body(req);
    const name = String(b.username || '').trim();
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(name)) throw new HttpError(400, 'Username: 3-20 letters, numbers, dot or underscore.');
    if (c.p.username) return { username: c.p.username, message: 'Username already set.' };
    const key = name.toLowerCase();
    await fs.commit(env, [{ createId: ['usernames', key, { uid: c.u.uid, username: name }] }])
      .catch((e) => { throw e.status === 409 ? new HttpError(409, 'That username is taken. Choose another.') : e; });
    await fs.commit(env, [{ merge: ['users', c.u.uid, { username: name, usernameLower: key }] }]);
    return { username: name, message: 'Username saved.' };
  }
  // Login hand-off between the two sites (different origins = different browser storage). Needs a valid login; the token lives 5 minutes.
  if (p === '/api/auth/handoff' && m === 'POST') {
    const u = await identity(req, env);
    return { success: true, customToken: await fs.customToken(env, u.uid) };
  }
  if (p === '/api/auth/available' && m === 'GET') {
    const name = String(new URL(req.url).searchParams.get('username') || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(name)) return { available: false, reason: '3-20 letters, numbers, dot or underscore.' };
    return { available: !(await fs.get(env, 'usernames', name)) };
  }
  if (p === '/api/auth/resolve' && m === 'GET') {
    const name = String(new URL(req.url).searchParams.get('username') || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(name)) throw new HttpError(400, 'Enter a valid username or your email.');
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'x', now = Date.now();
    const b = resolveBucket.get(ip) || { n: 0, reset: now + 60_000 };
    if (b.reset < now) { b.n = 0; b.reset = now + 60_000; }
    if (++b.n > 10) throw new HttpError(429, 'Too many tries. Wait a minute.');
    resolveBucket.set(ip, b); if (resolveBucket.size > 1000) resolveBucket.clear();
    const d = await fs.get(env, 'usernames', name);
    const u = d && await fs.get(env, 'users', d.uid);
    if (!u?.email) throw new HttpError(404, 'No account with that username.');
    return { email: u.email };
  }
  if (p === '/api/keys' && m === 'GET') {
    const c = await session(req, env);
    return { keys: (await fs.query(env, 'apiKeys', 'uid', c.u.uid, 20)).filter((k) => !k.revoked).map((k) => ({ id: k.id, label: k.label, prefix: k.prefix, key: k.key || null, createdAt: k.createdAt })) };
  }
  if ((p === '/api/keys' || p === '/api/keys/ensure') && m === 'POST') {
    const c = await session(req, env);
    const active = (await fs.query(env, 'apiKeys', 'uid', c.u.uid, 20)).filter((k) => !k.revoked);
    if (p === '/api/keys/ensure' && active.length) return { created: false, prefix: active[0].prefix, key: active[0].key || null };
    if (active.length >= 5) throw new HttpError(400, 'You already have 5 active keys. Revoke one first.');
    const key = 'pasiya_' + randomHex(24);
    const id = await sha256(key);
    await fs.set(env, 'apiKeys', id, { uid: c.u.uid, hash: id, prefix: key.slice(0, 12), key, label: p === '/api/keys' ? 'API key' : 'Default key', revoked: false, createdAt: stamp() });
    return { created: true, id, key };
  }
  if (p === '/api/keys/revoke' && m === 'POST') {
    const c = await session(req, env);
    const b = await body(req);
    const k = await fs.get(env, 'apiKeys', String(b.id || ''));
    if (!k || k.uid !== c.u.uid) throw new HttpError(404, 'Key not found.');
    await fs.commit(env, [{ merge: ['apiKeys', b.id, { revoked: true, revokedAt: stamp() }] }]);
    forgetKeys();
    return { ok: true };
  }
  if (p === '/api/daily-claim' && m === 'POST') {
    const c = await session(req, env), day = today(env), r = await rewardSettings(env), n = r.dailyCoins;
    if (c.isAdmin || !(await getFlags(env)).dailyEnabled) throw new HttpError(403, 'Daily coins are not available right now.');
    if (c.p.lastDailyClaim === day) throw new HttpError(409, 'Daily coins already claimed. Come back tomorrow.');
    // createId fails (409) if this user already claimed today, even for two simultaneous clicks.
    await fs.commit(env, [{ createId: ['claims', `${c.u.uid}_daily_${day}`, { uid: c.u.uid, day, type: 'daily', amount: n }] }, { merge: ['users', c.u.uid, { lastDailyClaim: day }] }, { inc: { doc: ['users', c.u.uid], by: { coins: n } } }])
      .catch((e) => { throw e.status === 409 ? new HttpError(409, 'Daily coins already claimed. Come back tomorrow.') : e; });
    await fs.add(env, 'coinHistory', { uid: c.u.uid, amount: n, balance: (c.p.coins || 0) + n, reason: 'Daily claim', createdAt: stamp() });
    return { message: `${n} coins added.`, amount: n };
  }
  if (p === '/api/spin' && m === 'POST') {
    const c = await session(req, env), day = today(env), r = await rewardSettings(env);
    if (c.isAdmin || !(await getFlags(env)).spinEnabled) throw new HttpError(403, 'The lucky spin is not available right now.');
    if (c.p.lastSpinDay === day) throw new HttpError(409, 'You already spun today. Come back tomorrow.');
    const total = SPIN_SHAPE.reduce((a, x) => a + x[1], 0);
    let roll = (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * total, index = 0;
    for (; index < SPIN_SHAPE.length - 1; index++) { if (roll < SPIN_SHAPE[index][1]) break; roll -= SPIN_SHAPE[index][1]; }
    const reward = r.spinRewards[index];
    await fs.commit(env, [{ createId: ['claims', `${c.u.uid}_spin_${day}`, { uid: c.u.uid, day, type: 'spin', amount: reward }] }, { merge: ['users', c.u.uid, { lastSpinDay: day }] }, { inc: { doc: ['users', c.u.uid], by: { coins: reward } } }])
      .catch((e) => { throw e.status === 409 ? new HttpError(409, 'You already spun today. Come back tomorrow.') : e; });
    await fs.add(env, 'coinHistory', { uid: c.u.uid, amount: reward, balance: (c.p.coins || 0) + reward, reason: 'Lucky spin', createdAt: stamp() });
    return { reward, index, rewards: r.spinRewards, message: `You won ${reward} coins!` };
  }
  if (p === '/api/usage' && m === 'GET') {
    const c = await session(req, env);
    return { items: (await fs.query(env, 'usage', 'uid', c.u.uid, 100)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 30) };
  }
  if (p === '/api/coins/history' && m === 'GET') {
    const c = await session(req, env);
    return { items: (await fs.query(env, 'coinHistory', 'uid', c.u.uid, 100)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 30) };
  }
  if (p.startsWith('/api/admin/')) {
    const c = await session(req, env);
    if (!c.isAdmin) throw new HttpError(403, 'Admin access required.');
    if (p === '/api/admin/overview') return { users: await fs.count(env, 'users'), ...(await rewardSettings(env)) };
    if (p === '/api/admin/users' && m === 'GET') {
      const list = await fs.query(env, 'users', null, null, 100);
      return { items: list.map((u) => ({ uid: u.uid || u.id, email: u.email, coins: u.coins || 0, totalRequests: u.totalRequests || 0, createdAt: u.createdAt })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) };
    }
    if (p === '/api/admin/settings' && m === 'POST') {
      const b = await body(req);
      if (!posInt(b.dailyCoins, 1, 100000) || !posInt(b.spinMax, 5, 1000000)) throw new HttpError(400, 'Daily coins must be 1-100000 and the biggest spin prize 5-1000000 (whole numbers).');
      await fs.commit(env, [{ merge: ['settings', 'rewards', { dailyCoins: b.dailyCoins, spinMax: b.spinMax, updatedAt: stamp(), updatedBy: c.u.email }] }]);
      return { message: 'Reward settings saved.', ...(await rewardSettings(env)) };
    }
    if (p === '/api/admin/music' && m === 'POST') {
      const b = await body(req);
      if (!Array.isArray(b.tracks) || b.tracks.length > 50) throw new HttpError(400, 'tracks must be a list of at most 50 songs.');
      const seen = new Set(), tracks = [];
      for (const t of b.tracks) {
        const id = ytId(typeof t === 'string' ? t : t?.url || t?.id);
        if (!id) throw new HttpError(400, `Not a valid YouTube link: ${String(typeof t === 'string' ? t : t?.url || t?.id || '').slice(0, 80)}`);
        if (!seen.has(id)) { seen.add(id); tracks.push({ id, title: String(t?.title || '').slice(0, 120) }); }
      }
      await fs.commit(env, [{ merge: ['settings', 'music', { tracks, updatedAt: stamp(), updatedBy: c.u.email }] }]);
      return { message: 'Songs saved.', tracks };
    }
    if (p === '/api/admin/theme' && m === 'POST') {
      const b = await body(req);
      if (!ACCENTS.includes(b.accent)) throw new HttpError(400, `accent must be one of: ${ACCENTS.join(', ')}.`);
      await fs.commit(env, [{ merge: ['settings', 'theme', { accent: b.accent, updatedAt: stamp(), updatedBy: c.u.email }] }]);
      return { message: 'Default theme saved.', accent: b.accent };
    }
    if (p === '/api/admin/features' && m === 'GET') {
      const fl = await getFlags(env);
      return { dailyEnabled: fl.dailyEnabled, spinEnabled: fl.spinEnabled, apis: listCatalog(env, fl, true) };
    }
    if (p === '/api/admin/features' && m === 'POST') {
      const b = await body(req), upd = {};
      for (const k of ['dailyEnabled', 'spinEnabled']) if (k in b) { if (typeof b[k] !== 'boolean') throw new HttpError(400, `${k} must be true or false.`); upd[k] = b[k]; }
      if ('disabledApis' in b) {
        if (!Array.isArray(b.disabledApis)) throw new HttpError(400, 'disabledApis must be a list of API paths.');
        upd.disabledApis = [...new Set(b.disabledApis.map(String))].filter((x) => ENDPOINTS.has(x));
      }
      if (!Object.keys(upd).length) throw new HttpError(400, 'Nothing to save.');
      await fs.commit(env, [{ merge: ['settings', 'features', { ...upd, updatedAt: stamp(), updatedBy: c.u.email }] }]);
      resetFlags();
      const fl = await getFlags(env);
      return { message: 'Saved.', dailyEnabled: fl.dailyEnabled, spinEnabled: fl.spinEnabled, disabledApis: fl.disabledApis };
    }
    // Real test of the live APIs from THIS server (the only place that shows what works on Vercel). Called in small batches by the admin panel.
    if (p === '/api/admin/healthcheck' && m === 'POST') {
      const b = await body(req);
      const defs = (Array.isArray(b.paths) ? b.paths : []).slice(0, 6).map((x) => ENDPOINTS.get(String(x))).filter(Boolean);
      const results = await Promise.all(defs.map(async (d) => {
        if (d.noProbe) return { path: d.path, state: 'skip', note: 'Not tested automatically (needs your own file link / mailbox id, or it uploads something).' };
        if (!(d.needsEnv ? d.needsEnv.every((k) => env[k]) : true)) return { path: d.path, state: 'skip', note: 'Not configured on this server.' };
        const t0 = Date.now(), params = Object.fromEntries((d.params || []).filter((x) => x.example !== '').map((x) => [x.name, x.example]));
        try {
          await Promise.race([d.run(params, env, req), new Promise((_, rej) => setTimeout(() => rej(new HttpError(504, 'No answer in 25 seconds.')), 25000))]);
          return { path: d.path, state: 'ok', ms: Date.now() - t0 };
        } catch (e) {
          const st = e instanceof HttpError ? e.status : 500;
          // 4xx = the example input was refused (fake link / id): inconclusive. 5xx / timeout / crash = the API itself is not working.
          return { path: d.path, state: st >= 400 && st < 500 && st !== 429 ? 'warn' : 'fail', status: st, ms: Date.now() - t0, note: (e instanceof HttpError ? e.message : 'Crashed: ' + (e?.message || e)).slice(0, 160) };
        }
      }));
      return { results };
    }
    if (p === '/api/admin/coins' && m === 'POST') {
      const b = await body(req);
      if ((!b.uid && !b.email) || !Number.isInteger(b.amount) || b.amount === 0 || Math.abs(b.amount) > 1_000_000) throw new HttpError(400, 'Provide a user email and a whole, non-zero coin amount.');
      const target = b.uid ? await fs.get(env, 'users', b.uid) : (await fs.query(env, 'users', 'email', String(b.email).trim().toLowerCase(), 1))[0];
      if (!target) throw new HttpError(404, 'No user with that email. They must register on the website first.');
      const uid = target.uid || target.id, have = target.coins || 0;
      const amount = Math.max(b.amount, -have); // removing never takes a balance below 0
      await fs.commit(env, [{ inc: { doc: ['users', uid], by: { coins: amount } } }]);
      await fs.add(env, 'coinHistory', { uid, amount, balance: have + amount, reason: amount > 0 ? 'Admin gift' : 'Admin adjustment', actor: c.u.uid, createdAt: stamp() });
      return { message: `${amount > 0 ? 'Added' : 'Removed'} ${Math.abs(amount)} coins ${amount > 0 ? 'to' : 'from'} ${target.email}. New balance: ${have + amount}.` };
    }
  }
  return undefined;
}
