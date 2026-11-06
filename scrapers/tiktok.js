// TikTok: public video metadata via the official oEmbed endpoint.
import { HttpError, fetchT, cached, param } from '../system/util.js';
import { UA, safeUrl } from './_web.js';

async function details(p) {
  const url = safeUrl(p.url, ['tiktok.com']);
  const info = await cached('tt:' + url, 3600, async () => {
    const r = await fetchT('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url), { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok) throw new HttpError(r.status === 400 ? 404 : 502, r.status === 400 ? 'Video not found or not public.' : 'TikTok is not answering right now.');
    const o = await r.json();
    return { id: o.embed_product_id || null, title: o.title || 'Untitled media', description: o.title || null, uploader: o.author_name, uploaderUrl: o.author_url, duration: 0, views: 0, likes: 0, webpageUrl: url, thumbnail: o.thumbnail_url, platform: 'TikTok' };
  });
  return { platform: 'tiktok', info };
}

export default [
  { path: '/api/scraper/tiktok/details', remote: 'tiktok/details', category: 'Social', name: 'TikTok details', cost: 1, desc: 'Public video metadata', params: [param('url', 'https://www.tiktok.com/@scout2015/video/6718335390845095173', 'Public page / video URL')], run: details }
];
