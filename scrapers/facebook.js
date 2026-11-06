// Facebook: public post metadata from its og: preview tags.
import { cached, param } from '../system/util.js';
import { safeUrl, ogDetails } from './_web.js';

async function details(p) {
  const url = safeUrl(p.url, ['facebook.com', 'fb.watch']);
  return { platform: 'facebook', info: await cached('facebook:' + url, 3600, () => ogDetails(url, 'Facebook')) };
}

export default [
  { path: '/api/scraper/facebook/details', remote: 'facebook/details', category: 'Social', name: 'Facebook details', cost: 1, desc: 'Public post metadata', params: [param('url', 'https://www.facebook.com/watch/?v=10153231379946729', 'Public page / video URL')], run: details }
];
