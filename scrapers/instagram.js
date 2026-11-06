// Instagram: public post metadata from its og: preview tags (login-only posts return 404).
import { cached, param } from '../system/util.js';
import { safeUrl, ogDetails } from './_web.js';

async function details(p) {
  const url = safeUrl(p.url, ['instagram.com']);
  return { platform: 'instagram', info: await cached('instagram:' + url, 3600, () => ogDetails(url, 'Instagram')) };
}

export default [
  { path: '/api/scraper/instagram/details', remote: 'instagram/details', category: 'Social', name: 'Instagram details', cost: 1, desc: 'Public post metadata', params: [param('url', 'https://www.instagram.com/p/fA9uwTtkSN/', 'Public page / video URL')], run: details }
];
