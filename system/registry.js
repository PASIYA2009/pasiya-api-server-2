// The ONE place that knows every scraper. To add a new site: create scrapers/<site>.js and list it here.
// Each scraper file default-exports an array of endpoints:
//   { path, category, name, cost, desc, params, run(params, env, req), remote? }  (hidden: true = not shown in docs)
// `remote` = path on the optional downloader service. If SCRAPER_URL is set, that service answers instead of the built-in code.
import { HttpError, fetchT } from './util.js';
import youtube from '../scrapers/youtube.js';
import tiktok from '../scrapers/tiktok.js';
import facebook from '../scrapers/facebook.js';
import instagram from '../scrapers/instagram.js';
import mediafire from '../scrapers/mediafire.js';
import gdrive from '../scrapers/gdrive.js';
import catbox from '../scrapers/catbox.js';
import news from '../scrapers/news.js';
import weather from '../scrapers/weather.js';
import tv from '../scrapers/tv.js';
import ai from '../scrapers/ai.js';
import download from '../scrapers/download.js';
import newsfeeds from '../scrapers/newsfeeds.js';
import search from '../scrapers/search.js';
import utility from '../scrapers/utility.js';
import extras from '../scrapers/extras.js';
import moreDl from '../scrapers/more_dl.js';
import hd from '../scrapers/hd.js';
import newTools from '../scrapers/new_tools.js';
import aiExtra from '../scrapers/ai_extra.js';
import apify from '../scrapers/apify.js';
import sinhalasub from '../scrapers/sinhalasub.js';

// Forwards to the separate Node/yt-dlp service. The shared secret never leaves the server.
export const forward = (upstreamPath) => async (p, env) => {
  if (!env.SCRAPER_URL || !env.SCRAPER_SHARED_SECRET) throw new HttpError(503, 'Downloader service is not connected on this server.');
  const r = await fetchT(env.SCRAPER_URL.replace(/\/$/, '') + upstreamPath, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.SCRAPER_SHARED_SECRET }, body: JSON.stringify(p)
  }, 60000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new HttpError(r.status >= 400 && r.status < 600 ? r.status : 502, d.error || 'Downloader request failed.');
  const { success, ...rest } = d;
  return rest;
};

// Order here = order of the categories in the dashboard.
const ALL = [ai, aiExtra, news, newsfeeds, search, weather, utility, extras, tv, youtube, facebook, tiktok, instagram, download, mediafire, gdrive, catbox, moreDl, hd, newTools, apify, sinhalasub].flat();

export const ENDPOINTS = new Map(ALL.map((e) => {
  if (!e.remote) return [e.path, e];
  const fwd = forward('/v1/' + e.remote), own = e.run;
  return [e.path, { ...e, run: own ? (p, env, req) => (env.SCRAPER_URL && env.SCRAPER_SHARED_SECRET ? fwd(p, env, req) : own(p, env, req)) : fwd }];
}));

// Legacy routes kept working for old bots (hidden from docs).
for (const l of ['facebook/search', 'tiktok/search', 'instagram/search']) {
  ENDPOINTS.set('/api/scraper/' + l, { path: '/api/scraper/' + l, cost: 1, hidden: true, run: forward('/v1/' + l) });
}

export const CATALOG = ALL.filter((e) => !e.hidden).map(({ run, remote, ...c }) => ({ ...c, method: 'GET' }));

// An endpoint with `needsEnv: ['KEY']` only appears once those environment variables are set.
export const isConfigured = (c, env) => !c.needsEnv || c.needsEnv.every((k) => !!env[k]);
// Public catalog = everything the admin has not switched off and the server is configured for. all=true is the admin view.
export function listCatalog(env, flags, all = false) {
  const off = new Set(flags?.disabledApis || []);
  return CATALOG.filter((c) => all || (!off.has(c.path) && isConfigured(c, env)))
    .map(({ needsEnv, noProbe, ...c }) => ({ ...c, ...(all ? { enabled: !off.has(c.path), configured: isConfigured({ needsEnv }, env), noProbe: !!noProbe } : {}) }));
}
