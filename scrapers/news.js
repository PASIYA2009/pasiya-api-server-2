// Sri Lanka news from public RSS feeds. Each feed is fetched on its own, so one broken feed never breaks the answer.
import { HttpError, fetchT, cached, clamp, stripHtml, decodeEntities, param } from '../system/util.js';

export const SOURCES = {
  'google-en': { name: 'Google News (Sri Lanka, English)', lang: 'en', url: 'https://news.google.com/rss?hl=en-LK&gl=LK&ceid=LK:en' },
  'google-si': { name: 'Google News (Sri Lanka, සිංහල)', lang: 'si', url: 'https://news.google.com/rss?hl=si&gl=LK&ceid=LK:si' },
  'adaderana': { name: 'Ada Derana', lang: 'en', url: 'https://www.adaderana.lk/rss.php' },
  'hirunews': { name: 'Hiru News', lang: 'en', url: 'https://www.hirunews.lk/rss/english.xml' },
  'newswire': { name: 'Newswire', lang: 'en', url: 'https://www.newswire.lk/feed/' },
  'economynext': { name: 'EconomyNext', lang: 'en', url: 'https://economynext.com/feed/' },
  'colombogazette': { name: 'Colombo Gazette', lang: 'en', url: 'https://colombogazette.com/feed/' }
};
const DEFAULT_SET = ['google-en', 'adaderana', 'newswire', 'economynext'];

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim() : '';
};

export function parseRss(xml, limit = 30) {
  const items = [];
  const re = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    const b = m[2];
    const rawDesc = tag(b, 'description') || tag(b, 'content:encoded') || tag(b, 'summary') || tag(b, 'content');
    const link = decodeEntities(b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] || b.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] || tag(b, 'link'));
    const img = b.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*url=["']([^"']+)["']/i)?.[1]
      || decodeEntities(rawDesc).match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || null;
    const d = new Date(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'));
    const title = stripHtml(tag(b, 'title'));
    if (!title || !link) continue;
    items.push({
      title, link, image: img ? decodeEntities(img) : null,
      summary: stripHtml(rawDesc).slice(0, 280) || null,
      publishedAt: isNaN(d) ? null : d.toISOString()
    });
  }
  return items;
}

async function feed(id) {
  const s = SOURCES[id];
  return cached('news:' + id, 300, async () => {
    const r = await fetchT(s.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PASIYA-API/2.0)', Accept: 'application/rss+xml,application/xml,text/xml,*/*' } }, 10000);
    if (!r.ok) throw new HttpError(502, `${s.name} answered HTTP ${r.status}`);
    return parseRss(await r.text(), 40).map((x) => ({ ...x, source: s.name, sourceId: id }));
  });
}

async function latest(p) {
  const limit = clamp(p.limit, 1, 30, 10);
  const q = String(p.q || '').trim().toLowerCase().slice(0, 60);
  const want = String(p.source || '').toLowerCase();
  const ids = want && want !== 'all' ? want.split(',').map((x) => x.trim()).filter(Boolean) : DEFAULT_SET;
  const bad = ids.find((i) => !SOURCES[i]);
  if (bad) throw new HttpError(400, `Unknown source "${bad}". Use one of: ${Object.keys(SOURCES).join(', ')}`);
  const settled = await Promise.allSettled(ids.slice(0, 5).map(feed));
  const errors = [];
  let items = [];
  settled.forEach((s, i) => s.status === 'fulfilled' ? items.push(...s.value) : errors.push({ source: ids[i], error: s.reason?.message || 'failed' }));
  if (!items.length) throw new HttpError(502, 'No news source answered. ' + errors.map((e) => `${e.source}: ${e.error}`).join('; '));
  if (q) items = items.filter((x) => x.title.toLowerCase().includes(q) || (x.summary || '').toLowerCase().includes(q));
  items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const seen = new Set();
  items = items.filter((x) => { const k = x.title.toLowerCase().slice(0, 60); return seen.has(k) ? false : seen.add(k); });
  return { count: Math.min(items.length, limit), articles: items.slice(0, limit), ...(errors.length ? { unavailable: errors } : {}) };
}

const sources = () => ({ sources: Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.name, language: s.lang })) });

// ---- single article: title, image and a SHORT excerpt (the full text stays on the publisher's site) ----
const ARTICLE_HOSTS = [...new Set(Object.values(SOURCES).map((s) => new URL(s.url).hostname.replace(/^www\./, '')).filter((h) => h !== 'news.google.com'))];
const metaTag = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? decodeEntities(m[1]).trim() : null;
};
async function article(p) {
  let u; try { u = new URL(String(p.url || '').trim()); } catch { throw new HttpError(400, 'url must be a full link (https://...).'); }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (u.protocol !== 'https:' || u.username || !ARTICLE_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
    throw new HttpError(400, `Only articles from these sites are supported: ${ARTICLE_HOSTS.join(', ')}`);
  }
  const url = u.toString();
  const a = await cached('art:' + url, 600, async () => {
    const r = await fetchT(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PASIYA-API/2.0)', 'Accept-Language': 'en,si;q=0.8' }, redirect: 'follow' }, 12000);
    if (r.status === 404) throw new HttpError(404, 'Article not found.');
    if (!r.ok) throw new HttpError(502, `News site answered HTTP ${r.status}`);
    const html = await r.text();
    const title = metaTag(html, 'og:title') || stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    if (!title) throw new HttpError(404, 'No article found on that page.');
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripHtml(m[1])).filter((t) => t.length > 40);
    const excerpt = [...new Set(paras)].join(' ').slice(0, 800);
    return {
      title, description: metaTag(html, 'og:description'), image: metaTag(html, 'og:image'), publishedAt: metaTag(html, 'article:published_time'),
      excerpt: excerpt || null, source: host, url, note: 'Excerpt only. Read the full story on the publisher site.'
    };
  });
  return { article: a };
}

const url1 = param('url', 'https://adaderana.lk/news/110691', 'Article link');
export default [
  { path: '/api/news', category: 'News', name: 'Sri Lanka news', cost: 0, desc: 'Latest headlines from Sri Lankan news feeds', params: [param('source', 'all', 'all, or comma list: google-en, google-si, adaderana, hirunews, newswire, economynext, colombogazette', false), param('q', '', 'Filter by keyword', false), param('limit', '10', 'Max 30', false)], run: latest },
  { path: '/api/news/article', category: 'News', name: 'News article', cost: 0, desc: 'Title, image and a short excerpt of one article (Ada Derana, Hiru News and other listed sources)', params: [url1], run: article },
  { path: '/api/news/sources', category: 'News', name: 'News sources', cost: 0, desc: 'List the available news sources', params: [], run: sources }
];
