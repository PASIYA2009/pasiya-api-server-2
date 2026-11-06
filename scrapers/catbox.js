// Catbox: upload a public file link to catbox.moe and return the permanent link.
import { HttpError, fetchT, param } from '../system/util.js';

function publicHttpUrl(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(400, 'url must be a full link (https://...).'); }
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  const priv = h.includes(':') || /(^|\.)(localhost|local|internal)$/.test(h) || !h.includes('.') ||
    (v4 && (+v4[1] === 0 || +v4[1] === 10 || +v4[1] === 127 || (+v4[1] === 169 && +v4[2] === 254) || (+v4[1] === 172 && +v4[2] >= 16 && +v4[2] <= 31) || (+v4[1] === 192 && +v4[2] === 168) || +v4[1] >= 224));
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || priv) throw new HttpError(400, 'Only public http/https file links are allowed.');
  return u.toString();
}
async function upload(p, env) {
  const url = publicHttpUrl(p.url);
  const form = new FormData();
  form.append('reqtype', 'urlupload');
  if (env.CATBOX_USERHASH) form.append('userhash', env.CATBOX_USERHASH);
  form.append('url', url);
  const r = await fetchT('https://catbox.moe/user/api.php', { method: 'POST', body: form }, 25000);
  const t = (await r.text()).trim();
  if (!r.ok || !/^https?:\/\/files\.catbox\.moe\//i.test(t)) throw new HttpError(502, `Catbox refused the upload: ${t.slice(0, 120) || 'HTTP ' + r.status}`);
  return { result: { url: t.replace(/^http:/, 'https:') } };
}

export default [
  { path: '/api/scraper/catbox/upload', remote: 'catbox/upload', category: 'Files', name: 'Catbox upload', cost: 2, noProbe: true, desc: 'Upload a public file link to Catbox and get the permanent link', params: [param('url', 'https://example.com/picture.jpg', 'Public page / video URL')], run: upload }
];
