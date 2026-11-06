// Keyless search endpoints. They use public, key-free services (Wallhaven, Openverse, Wikimedia, DuckDuckGo).
import { HttpError, fetchT, cached, clamp, stripHtml, decodeEntities, param } from '../system/util.js';
import { parseRss } from './news.js';

const UA = 'PASIYA-API/3.2 (https://vercel.com; keyless search)';
const need = (p, k = 'q') => { const v = String(p[k] || p.query || '').trim(); if (!v || v.length > 120) throw new HttpError(400, `${k} is required (max 120 characters).`); return v; };
const getJson = async (url, ttl = 300, headers = {}) => cached('s:' + url, ttl, async () => {
  const r = await fetchT(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } }, 12000);
  if (r.status === 429) throw new HttpError(429, 'The search service is busy. Try again in a minute.');
  if (!r.ok) throw new HttpError(502, 'Search service answered HTTP ' + r.status);
  return r.json();
});

// ---- wallpapers (Wallhaven, safe-for-work only) ----
const wall = (extra) => async (p) => {
  const q = need(p), limit = clamp(p.limit, 1, 24, 12), page = clamp(p.page, 1, 20, 1);
  const d = await getJson(`https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(q)}&purity=100&categories=111&sorting=relevance&page=${page}${extra}`);
  const items = (d.data || []).slice(0, limit).map((x) => ({ id: x.id, resolution: x.resolution, image: x.path, thumbnail: x.thumbs?.large || x.thumbs?.small, page: x.url, favorites: x.favorites, colors: x.colors }));
  return { query: q, count: items.length, results: items };
};

// ---- images ----
async function openverse(p) {
  const q = need(p), limit = clamp(p.limit, 1, 30, 12);
  const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${limit}`);
  return { query: q, count: (d.results || []).length, results: (d.results || []).map((x) => ({ title: x.title, image: x.url, thumbnail: x.thumbnail, creator: x.creator, license: `${x.license || ''} ${x.license_version || ''}`.trim(), source: x.foreign_landing_url, width: x.width, height: x.height })) };
}
async function commons(p) {
  const q = need(p), limit = clamp(p.limit, 1, 30, 12);
  const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent('filetype:bitmap ' + q)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=480`);
  const pages = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return { query: q, count: pages.length, results: pages.map((x) => { const i = x.imageinfo?.[0] || {}; return { title: String(x.title || '').replace(/^File:/, ''), image: i.url, thumbnail: i.thumburl, width: i.width, height: i.height, license: i.extmetadata?.LicenseShortName?.value || null, source: i.descriptionurl }; }) };
}

// ---- Wikipedia ----
async function wikipedia(p) {
  const q = need(p), lang = /^[a-z]{2,3}$/.test(p.lang || '') ? p.lang : 'en', limit = clamp(p.limit, 1, 20, 5);
  const d = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&format=json`);
  return { query: q, language: lang, results: (d.query?.search || []).map((x) => ({ title: x.title, snippet: stripHtml(x.snippet), url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, '_'))}`, words: x.wordcount })) };
}

// ---- web search: several engines, first one that answers wins (datacenter IPs are often blocked by a single engine) ----
// 1) Brave Search API (BRAVE_API_KEY, free plan)  2) Bing RSS (keyless)  3) DuckDuckGo HTML / Lite (keyless)
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function braveSearch(q, limit, env) {
  const r = await fetchT(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${limit}`, { headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY } }, 10000);
  if (!r.ok) throw new Error('Brave HTTP ' + r.status);
  const d = await r.json();
  return (d.web?.results || []).map((x) => ({ title: stripHtml(x.title), url: x.url, snippet: stripHtml(x.description || '') }));
}
async function bingRss(q, limit) {
  const r = await fetchT(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}&count=${limit}`, { headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US,en;q=0.9' } }, 10000);
  if (!r.ok) throw new Error('Bing HTTP ' + r.status);
  const items = parseRss(await r.text(), limit);
  return items.map((x) => ({ title: x.title, url: x.link, snippet: x.summary || '' }));
}
async function ddgHtml(q, limit) {
  const html = await cached('ddg:' + q, 300, async () => {
    const r = await fetchT('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'User-Agent': BROWSER, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://html.duckduckgo.com/', 'Accept-Language': 'en-US,en;q=0.9' }, body: new URLSearchParams({ q }) }, 10000);
    if (!r.ok) throw new Error('DuckDuckGo HTTP ' + r.status);
    return r.text();
  });
  const out = [];
  const hits = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (let i = 0; i < hits.length && out.length < limit; i++) {
    const m = hits[i], block = html.slice(m.index + m[0].length, hits[i + 1]?.index ?? undefined);
    let href = decodeEntities(m[1]);
    const u = href.match(/uddg=([^&]+)/); if (u) href = decodeURIComponent(u[1]); else if (href.startsWith('//')) href = 'https:' + href;
    if (!/^https?:\/\//.test(href)) continue;
    out.push({ title: stripHtml(m[2]), url: href, snippet: stripHtml(block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i)?.[1] || '') });
  }
  return out;
}
async function web(p, env = {}) {
  const q = need(p), limit = clamp(p.limit, 1, 20, 10);
  const engines = [...(env.BRAVE_API_KEY ? [['brave', () => braveSearch(q, limit, env)]] : []), ['bing', () => bingRss(q, limit)], ['duckduckgo', () => ddgHtml(q, limit)]];
  const errs = [];
  for (const [name, fn] of engines) {
    try {
      const results = (await cached('web:' + name + ':' + q + ':' + limit, 300, fn)).slice(0, limit);
      if (results.length) return { query: q, engine: name, count: results.length, results };
      errs.push(name + ': no results');
    } catch (e) { errs.push(name + ': ' + e.message); }
  }
  throw new HttpError(502, 'Web search is not answering right now (' + errs.join('; ') + '). Add a free BRAVE_API_KEY for a stable engine.');
}

export { web as webSearch };

// ---- Sri Lankan past papers (paperhub.lk, WordPress search) ----
async function paperhub(p) {
  const q = need(p), limit = clamp(p.limit, 1, 30, 10);
  const d = await getJson(`https://paperhub.lk/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=${limit}`);
  return { query: q, count: d.length, results: d.map((x) => ({ title: decodeEntities(x.title), url: x.url, type: x.subtype })) };
}

const Q = (ex) => [param('q', ex, 'Search text'), param('limit', '12', 'Max results', false)];
export default [
  { path: '/api/search/web', category: 'Search', name: 'Web Search', cost: 0, isNew: true, desc: 'Search the web (Bing / DuckDuckGo with no key, Brave if BRAVE_API_KEY is set)', params: Q('sri lanka tourism'), run: web },
  { path: '/api/search/wikipedia', category: 'Search', name: 'Wikipedia Search', cost: 0, isNew: true, desc: 'Search Wikipedia articles (any language code)', params: [param('q', 'Sigiriya', 'Search text'), param('lang', 'en', 'en, si, ta ...', false), param('limit', '5', 'Max 20', false)], run: wikipedia },
  { path: '/api/search/wallpaper', category: 'Search', name: 'Wallpaper: 4K', cost: 0, isNew: true, desc: 'Find 4K wallpapers', params: Q('nature'), run: wall('&atleast=3840x2160') },
  { path: '/api/search/wallpaper2', category: 'Search', name: 'Wallpaper: Mobile', cost: 0, isNew: true, desc: 'Find portrait phone wallpapers', params: Q('mountains'), run: wall('&ratios=portrait&atleast=1080x1920') },
  { path: '/api/search/img', category: 'Search', name: 'Image: Openverse', cost: 0, isNew: true, desc: 'Free-licence image search (millions of photos)', params: Q('elephant'), run: openverse },
  { path: '/api/search/commons', category: 'Search', name: 'Image: Wikimedia', cost: 0, isNew: true, desc: 'Search Wikimedia Commons pictures', params: Q('Ella Sri Lanka'), run: commons },
  { path: '/api/search/paperhub', category: 'Search', name: 'PaperHub Lookup', cost: 0, isNew: true, desc: 'Search paperhub.lk past papers', params: Q('2023 A/L physics'), run: paperhub }
];
