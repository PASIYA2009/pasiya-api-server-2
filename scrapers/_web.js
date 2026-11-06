// Small helpers shared by the site scrapers (not an endpoint file). Only https links on the site's OWN domain are fetched.
import { HttpError, fetchT, decodeEntities } from '../system/util.js';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function safeUrl(raw, hosts) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(400, 'url must be a full link (https://...).'); }
  const ok = u.protocol === 'https:' && !u.username && hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  if (!ok) throw new HttpError(400, `This endpoint only accepts ${hosts.join(' / ')} links.`);
  return u.toString();
}
export const page = async (url, headers = {}) => {
  const r = await fetchT(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI', ...headers }, redirect: 'follow' }, 15000);
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, r.status === 404 ? 'Not found (private or removed).' : `Source site answered HTTP ${r.status}.`);
  return r.text();
};
export const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? decodeEntities(m[1]).trim() : null;
};
// Public-preview details for sites that expose og: tags to link-preview bots (Facebook, Instagram).
export async function ogDetails(url, label) {
  const html = await page(url, { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' });
  const title = meta(html, 'og:title'), image = meta(html, 'og:image');
  if (!title && !image) throw new HttpError(404, 'No public preview found (private post, login required or removed).');
  const site = meta(html, 'og:site_name');
  return { id: null, title: title || 'Untitled media', description: meta(html, 'og:description'), uploader: site === label ? null : site, duration: 0, views: 0, likes: 0, webpageUrl: meta(html, 'og:url') || url, thumbnail: image, video: meta(html, 'og:video:secure_url') || meta(html, 'og:video'), platform: label };
}
