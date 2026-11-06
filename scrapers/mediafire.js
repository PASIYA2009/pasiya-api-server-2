// MediaFire: resolve a file page to its direct download link.
import { HttpError, cached, decodeEntities, stripHtml, param } from '../system/util.js';
import { safeUrl, page } from './_web.js';

export function extractMediaFireLink(html) {
  const scr = html.match(/data-scrambled-url=["']([^"']+)["']/i)?.[1];
  if (scr) { try { const d = atob(scr); if (/^https?:\/\//.test(d)) return d; } catch { /* next pattern */ } }
  for (const re of [/<a[^>]+id=["']downloadButton["'][^>]+href=["'](https?:\/\/[^"']+)["']/i, /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]+id=["']downloadButton["']/i,
    /<a[^>]+class=["'][^"']*download_link[^"']*["'][^>]+href=["']([^"']+)["']/i, /href=["'](https?:\/\/download[^"']+)["']/i]) {
    const m = html.match(re); if (m && /^https?:\/\//.test(m[1])) return decodeEntities(m[1]);
  }
  return null;
}

async function resolve(p) {
  const url = safeUrl(p.url, ['mediafire.com']);
  const result = await cached('mf:' + url, 600, async () => {
    const html = await page(url);
    const downloadUrl = extractMediaFireLink(html);
    if (!downloadUrl) throw new HttpError(404, 'Could not find the direct link (file removed or protected).');
    return { title: stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'MediaFire file'), downloadUrl };
  });
  return { result };
}

export default [
  { path: '/api/scraper/mediafire/resolve', noProbe: true, remote: 'mediafire/resolve', category: 'Files', name: 'MediaFire resolve', cost: 1, desc: 'File name and direct link of a MediaFire page', params: [param('url', 'https://www.mediafire.com/file/abc/file.zip', 'Public page / video URL')], run: resolve }
];
