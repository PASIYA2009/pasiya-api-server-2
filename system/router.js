// The router for every /api/* request (used by api/index.js).
import { HttpError, json, CORS, SITE, CREATOR, stamp } from './util.js';
import { serve, endpointHealth } from './gateway.js';
import { account } from './account.js';
import { status, serverLoad } from './status.js';
import { ENDPOINTS, listCatalog } from './registry.js';
import { getFlags } from './flags.js';

async function route(req, env) {
  const url = new URL(req.url), m = req.method;
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (m === 'OPTIONS') return new Response(null, { headers: CORS });

  if (p === '/api/health' || p === '/api/ping') return json({ ok: true, service: SITE, creator: CREATOR, time: stamp() });
  if (p === '/api/config') return json({ success: true, signupCoins: Number(env.SIGNUP_COINS ?? 100), adminConfigured: !!String(env.ADMIN_EMAIL || '').trim(), turnstileSiteKey: env.TURNSTILE_SITE_KEY || null }, 200, { 'Cache-Control': 'public, max-age=60' });
  if (p === '/api/status') return json({ success: true, ...(await status(req, env)) }, 200, { 'Cache-Control': 'no-store' });
  if (p === '/api/load') return json({ success: true, server: await serverLoad(), time: stamp() }, 200, { 'Cache-Control': 'no-store' });
  if (p === '/api/endpoint-status') return json({ success: true, endpoints: endpointHealth() }, 200, { 'Cache-Control': 'no-store' });
  if (p === '/api/catalog') return json({ success: true, apis: listCatalog(env, await getFlags(env)) }, 200, { 'Cache-Control': 'no-store' });

  const def = ENDPOINTS.get(p);
  if (def && (m === 'GET' || m === 'POST')) return serve(req, env, def);
  if (def) throw new HttpError(405, 'Use GET or POST.');

  const r = await account(req, env, p, m);
  if (r !== undefined) return json(r);
  throw new HttpError(404, 'Endpoint not found. See /api/catalog.');
}

export default {
  async fetch(req, env = (typeof process !== 'undefined' ? process.env : {})) {
    try { return await route(req, env); }
    catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) console.error(e?.stack || e);
      return json({ success: false, error: e instanceof HttpError ? e.message : 'Unexpected error.' }, status);
    }
  }
};
