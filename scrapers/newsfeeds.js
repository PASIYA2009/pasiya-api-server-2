// One keyless endpoint per news site (Sri Lanka, world, tech) + an "all" mix. Everything comes from public RSS/Atom feeds.
// If a site's own feed is down or its address changed, the same site is read through Google News (site: search) instead.
import { HttpError, fetchT, cached, clamp, param } from '../system/util.js';
import { parseRss } from './news.js';

const GN = (site) => `https://news.google.com/rss/search?q=${encodeURIComponent('site:' + site + ' when:2d')}&hl=en-LK&gl=LK&ceid=LK:en`;
// [slug, group, name, description, feed url, site (for the Google News fallback)]
const SITES = [
  ['adaderana', 'sl', 'AdaDerana', 'Latest AdaDerana Sinhala News', 'https://sinhala.adaderana.lk/rss.php', 'sinhala.adaderana.lk'],
  ['hiru', 'sl', 'Hiru', 'Latest Hiru News', 'https://www.hirunews.lk/rss/english.xml', 'hirunews.lk'],
  ['newsfirst', 'sl', 'NewsFirst', 'Latest NewsFirst Updates', 'https://english.newsfirst.lk/feed', 'newsfirst.lk'],
  ['bbc', 'sl', 'BBC Sinhala', 'BBC Sinhala updates', 'https://feeds.bbci.co.uk/sinhala/rss.xml', 'bbc.com/sinhala'],
  ['gossiplankanews', 'sl', 'GossipLanka', 'Gossip Lanka News', 'https://www.gossiplankanews.com/feeds/posts/default?alt=rss', 'gossiplankanews.com'],
  ['lankadeepa', 'sl', 'Lankadeepa', 'Lankadeepa Online', 'https://www.lankadeepa.lk/rss', 'lankadeepa.lk'],
  ['dinamina', 'sl', 'Dinamina', 'Dinamina Feed', 'https://www.dinamina.lk/feed/', 'dinamina.lk'],
  ['mawbima', 'sl', 'Mawbima', 'Mawbima Feed', 'https://mawbima.lk/feed/', 'mawbima.lk'],
  ['dailymirror', 'sl', 'Daily Mirror', 'Daily Mirror Latest', 'https://www.dailymirror.lk/RSS_Feeds/breaking-news/108', 'dailymirror.lk'],
  ['sundaytimes', 'sl', 'Sunday Times', 'Sunday Times Online', 'https://www.sundaytimes.lk/feed/', 'sundaytimes.lk'],
  ['divaina', 'sl', 'Divaina', 'Divaina Feed', 'https://divaina.lk/feed/', 'divaina.lk'],
  ['silumina', 'sl', 'Silumina', 'Silumina Newspaper', 'https://www.silumina.lk/feed/', 'silumina.lk'],
  ['itnnews', 'sl', 'ITN News', 'ITN News Sri Lanka', 'https://www.itnnews.lk/feed/', 'itnnews.lk'],
  ['siyatha', 'sl', 'Siyatha', 'Siyatha News LK', 'https://www.siyathanews.lk/feed/', 'siyathanews.lk'],
  ['nethnews', 'sl', 'Neth News', 'Neth News Sri Lanka', 'https://nethnews.lk/feed/', 'nethnews.lk'],
  ['newslk', 'sl', 'News.lk', 'Official Govt News Portal', 'https://www.news.lk/news?format=feed&type=rss', 'news.lk'],
  ['technews_lk', 'techsl', 'Technews.lk', 'Latest LK Tech News', 'https://technews.lk/feed/', 'technews.lk'],
  ['nhk', 'world', 'NHK World', 'NHK News Japan', 'https://www3.nhk.or.jp/rss/news/cat0.xml', 'nhk.or.jp'],
  ['japantoday', 'world', 'Japan Today', 'Japan Today Feed', 'https://japantoday.com/feed', 'japantoday.com'],
  ['japantimes', 'world', 'Japan Times', 'Japan Times World', 'https://www.japantimes.co.jp/feed/', 'japantimes.co.jp'],
  ['bbcworld', 'world', 'BBC World', 'BBC News World Edition', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'bbc.com'],
  ['cnn', 'world', 'CNN World', 'CNN International News', 'http://rss.cnn.com/rss/edition_world.rss', 'cnn.com'],
  ['nytimes', 'world', 'NY Times', 'New York Times World', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'nytimes.com'],
  ['foxnews', 'world', 'Fox News', 'Fox News World', 'https://moxie.foxnews.com/google-publisher/world.xml', 'foxnews.com'],
  ['reuters', 'world', 'Reuters', 'Reuters World News (via Google News)', GN('reuters.com'), 'reuters.com'],
  ['aljazeera', 'world', 'Al Jazeera', 'Al Jazeera English News', 'https://www.aljazeera.com/xml/rss/all.xml', 'aljazeera.com'],
  ['techcrunch', 'tech', 'TechCrunch', 'Startup and Technology News', 'https://techcrunch.com/feed/', 'techcrunch.com'],
  ['theverge', 'tech', 'The Verge', 'Technology, Science, Art', 'https://www.theverge.com/rss/index.xml', 'theverge.com'],
  ['wired', 'tech', 'Wired', 'Future of Technology', 'https://www.wired.com/feed/rss', 'wired.com'],
  ['gizmodo', 'tech', 'Gizmodo', 'Design, Tech, Science', 'https://gizmodo.com/feed', 'gizmodo.com'],
  ['engadget', 'tech', 'Engadget', 'Technology News & Reviews', 'https://www.engadget.com/rss.xml', 'engadget.com']
];
const PREFIX = { sl: 'News', world: 'News', tech: 'Tech', techsl: 'Tech (SL)' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SI_SITES = new Set(['adaderana', 'lankadeepa', 'dinamina', 'mawbima', 'divaina', 'silumina', 'siyatha', 'nethnews', 'bbc', 'gossiplankanews', 'itnnews']);

// Google News (Sinhala + English editions, 7 days) and Bing News (RSS). Bing wraps links, so the real address is unwrapped.
const GNX = (site, si) => `https://news.google.com/rss/search?q=${encodeURIComponent('site:' + site + ' when:7d')}&hl=${si ? 'si' : 'en-LK'}&gl=LK&ceid=LK:${si ? 'si' : 'en'}`;
const BING = (site) => `https://www.bing.com/news/search?q=${encodeURIComponent('site:' + site)}&format=rss&setlang=en`;
const unwrapBing = (items) => items.map((x) => { try { const u = new URL(x.link); return u.hostname.endsWith('bing.com') && u.searchParams.get('url') ? { ...x, link: u.searchParams.get('url') } : x; } catch { return x; } });

async function pull(url, ms = 7000) {
  const r = await fetchT(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow' }, ms);
  if (!r.ok) throw new HttpError(502, 'Feed answered HTTP ' + r.status);
  const items = unwrapBing(parseRss(await r.text(), 40));
  if (!items.length) throw new HttpError(502, 'Feed had no articles.');
  return items;
}
// Many Sri Lankan sites moved their feed address: try the listed one, then the usual WordPress / generic paths on the same site (all at once, first good answer wins).
function ownFeeds(feedUrl, site) {
  const host = site.split('/')[0], list = [feedUrl];
  for (const base of new Set([new URL(feedUrl).origin, 'https://' + host, 'https://www.' + host.replace(/^www\./, '')])) {
    for (const path of ['/feed/', '/feed', '/rss', '/rss.xml', '/?feed=rss2', '/feeds/posts/default?alt=rss', '/index.php/feed']) list.push(base + path);
  }
  return [...new Set(list)];
}
const firstGood = (urls, ms) => Promise.any(urls.map((u) => pull(u, ms)));
export async function siteFeed(slug) {
  const s = SITES.find((x) => x[0] === slug);
  return cached('nf:' + slug, 300, async () => {
    const si = SI_SITES.has(slug);
    const tiers = [
      ['rss', () => firstGood(ownFeeds(s[4], s[5]).slice(0, 3), 6000)],
      ['google-news', () => firstGood([GNX(s[5], si), GNX(s[5], !si)], 8000)],
      ['bing-news', () => pull(BING(s[5]), 8000)]
    ];
    let items, via, last;
    for (const [name, fn] of tiers) { try { items = await fn(); via = name; break; } catch (e) { last = e; } }
    if (!items) throw new HttpError(502, 'No feed for this site right now (own feed, Google News and Bing News all returned nothing).');
    return { name: s[2], via, items: items.map((x) => ({ ...x, source: s[2], sourceId: slug })) };
  });
}
const shape = (f, limit, q) => {
  let a = f.items;
  if (q) a = a.filter((x) => (x.title + ' ' + (x.summary || '')).toLowerCase().includes(q));
  return { source: f.name, via: f.via, count: Math.min(a.length, limit), articles: a.slice(0, limit) };
};
const P = [param('limit', '10', 'Max 30', false), param('q', '', 'Filter by keyword', false)];
const lim = (p) => ({ limit: clamp(p.limit, 1, 30, 10), q: String(p.q || '').trim().toLowerCase().slice(0, 60) });

const endpoints = SITES.map(([slug, group, name, desc]) => ({
  path: '/api/news/' + slug, category: group === 'tech' || group === 'techsl' ? 'Tech' : 'News', name: `${PREFIX[group]}: ${name}`, cost: 0, isNew: true, desc, params: P,
  run: async (p) => { const { limit, q } = lim(p); return shape(await siteFeed(slug), limit, q); }
}));

endpoints.unshift({
  path: '/api/news/all', category: 'News', name: 'News: All-in-One', cost: 0, isNew: true, desc: 'Aggregated news from top Sri Lankan sources',
  params: [...P, param('group', 'sl', 'sl (Sri Lanka), world, tech, techsl or all', false)],
  run: async (p) => {
    const { limit, q } = lim(p), g = String(p.group || 'sl').toLowerCase();
    const slugs = SITES.filter((s) => g === 'all' || s[1] === g).map((s) => s[0]);
    if (!slugs.length) throw new HttpError(400, 'group must be sl, world, tech, techsl or all.');
    // Cloudflare Workers: max 6 parallel + 50 subrequests per request (free plan) -> only a few sources per call
    const res = await Promise.allSettled(slugs.slice(0, 8).map(siteFeed));
    let items = res.flatMap((r) => (r.status === 'fulfilled' ? r.value.items : []));
    const failed = res.map((r, i) => (r.status === 'rejected' ? slugs[i] : null)).filter(Boolean);
    if (slugs.length > 8 && !p.all) failed.push('(only first 8 sources used per call, use /api/news/<site> for the rest)');
    if (!items.length) throw new HttpError(502, 'No news source answered.');
    if (q) items = items.filter((x) => (x.title + ' ' + (x.summary || '')).toLowerCase().includes(q));
    items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    const seen = new Set();
    items = items.filter((x) => { const k = x.title.toLowerCase().slice(0, 60); return seen.has(k) ? false : seen.add(k); });
    return { count: Math.min(items.length, limit), articles: items.slice(0, limit), ...(failed.length ? { unavailable: failed } : {}) };
  }
});
export default endpoints;
