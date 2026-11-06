// Public live status for the dashboard cards (hosted on Vercel).
import { cached } from './util.js';
import * as fs from './db.js';
import { statsLast24h } from './gateway.js';
import { listCatalog } from './registry.js';
import { getFlags } from './flags.js';

// Short, safe reason shown under the DATABASE card so the owner can see what to fix (no secrets are ever included).
function dbHint(e) {
  const m = String(e?.message || e || '');
  if (/JSON/i.test(m) && /position|token|Unexpected|parse/i.test(m)) return 'service account JSON is not valid JSON';
  if (/atob|base64|importKey|DataError|private_key|pkcs8|Invalid.*key/i.test(m) || e?.name === 'DataError' || e?.name === 'InvalidCharacterError') return 'private_key in the JSON is broken';
  if (/invalid_grant|invalid_scope|invalid_client|unauthorized|authentication failed|Invalid JWT/i.test(m)) return 'service account rejected (wrong/old key)';
  if (/has not been used|disabled|SERVICE_DISABLED/i.test(m)) return 'Cloud Firestore API is not enabled';
  if (/NOT_FOUND|does not exist|database.*not/i.test(m)) return 'Firestore database not created / wrong project id';
  if (/permission|PERMISSION_DENIED|forbidden/i.test(m)) return 'service account has no Firestore permission';
  return m.slice(0, 70) || 'unknown error';
}

// Cloudflare Workers does not expose per-isolate CPU/RSS or host load metrics.
export async function serverLoad() {
  return { ramUsedMb: null, ramTotalMb: null, ramPct: null, cpuPct: null, cpuCores: null, load1: null };
}

export async function status(req, env) {
  const h = (k) => req.headers.get(k);
  let db = { ok: false, name: 'Firebase Firestore', note: 'Not configured' };
  let stats = { requests: 0, errors: 0, avgMs: 0, successRate: 100 }, users = null;
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      stats = await cached('status:24h', 30, () => statsLast24h(env));
      users = await cached('status:users', 60, () => fs.count(env, 'users')).catch(() => null);
      db = { ok: true, name: 'Firebase Firestore', note: 'Connected' };
    } catch (e) { db = { ok: false, name: 'Firestore: ' + dbHint(e), note: 'Unreachable' }; }
  }
  const visible = listCatalog(env, await getFlags(env));
  const started = env.PLATFORM_START ? new Date(env.PLATFORM_START).getTime() : null;
  let city = h('cf-ipcity');
  try { city = city && decodeURIComponent(city); } catch { /* keep raw */ }
  return {
    status: db.ok || !env.FIREBASE_SERVICE_ACCOUNT_JSON ? 'Online' : 'Degraded',
    ip: (h('x-forwarded-for') || '').split(',')[0].trim() || h('x-real-ip') || null,
    location: [city, h('cf-ipcountry')].filter(Boolean).join(', ') || null,
    edge: { colo: (h('cf-ray') || '').split('-')[0] || null, protocol: null, network: 'Cloudflare' },
    database: db,
    uptimeMs: started && !isNaN(started) ? Date.now() - started : null,
    endpoints: visible.length,
    categories: new Set(visible.map((c) => c.category)).size,
    users,
    requests24h: stats.requests, errors24h: stats.errors, avgResponseMs: stats.avgMs, successRate: stats.successRate,
    server: await serverLoad(),
    time: new Date().toISOString()
  };
}
