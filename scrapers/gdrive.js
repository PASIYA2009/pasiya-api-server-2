// Google Drive: resolve a public file / Docs / Sheets / Slides link to a direct download link.
import { HttpError, fetchT, cached, param } from '../system/util.js';
import { UA } from './_web.js';

const DOCS = {
  document: { fmts: ['pdf', 'docx', 'txt', 'html', 'odt', 'rtf'], def: 'pdf' },
  spreadsheets: { fmts: ['xlsx', 'csv', 'pdf', 'ods', 'tsv'], def: 'xlsx' },
  presentation: { fmts: ['pptx', 'pdf', 'txt', 'odp'], def: 'pptx' }
};
export function parseDriveUrl(input) {
  const s = String(input || '').trim();
  let u;
  try { u = new URL(s); } catch { return /^[\w-]{20,}$/.test(s) ? { kind: 'file', id: s } : null; }
  if (u.protocol !== 'https:' || (!/^(drive|docs)\.google\.com$/.test(u.hostname) && u.hostname !== 'drive.usercontent.google.com')) return null;
  const d = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
  if (d) return { kind: d[1], id: d[2] };
  if (/\/folders\//.test(u.pathname)) return { kind: 'folder' };
  const id = u.pathname.match(/\/d\/([\w-]+)/)?.[1] || u.searchParams.get('id');
  return id && /^[\w-]+$/.test(id) ? { kind: 'file', id } : null;
}
const fileName = (res) => {
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  try { return m ? decodeURIComponent(m[1]) : null; } catch { return m ? m[1] : null; }
};
function explain(html, status) {
  if (status === 404) return new HttpError(404, 'File not found (wrong link or deleted).');
  if (/quota|too many users|Too many/i.test(html)) return new HttpError(429, 'Google Drive download quota is exceeded for this file. Try later, or make a copy in your own Drive.');
  if (/accounts\.google\.com|Sign in|need access|Request access|ServiceLogin/i.test(html)) return new HttpError(403, 'This file is private. It must be shared as "Anyone with the link".');
  return new HttpError(404, 'File not found or not accessible.');
}

async function resolve(p) {
  const info = parseDriveUrl(p.url);
  if (!info) throw new HttpError(400, 'url must be a Google Drive / Docs link (https://drive.google.com/...).');
  if (info.kind === 'folder') throw new HttpError(400, 'Folder links are not supported. Use a direct file link.');
  const result = await cached('gd:' + info.kind + ':' + info.id + ':' + (p.format || ''), 600, async () => {
    if (DOCS[info.kind]) {
      const d = DOCS[info.kind], fmt = String(p.format || d.def).toLowerCase();
      if (!d.fmts.includes(fmt)) throw new HttpError(400, `format must be one of: ${d.fmts.join(', ')}`);
      const downloadUrl = `https://docs.google.com/${info.kind}/d/${info.id}/export?format=${fmt}`;
      const res = await fetchT(downloadUrl, { headers: { 'User-Agent': UA }, redirect: 'follow' }, 15000);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || /accounts\.google\.com/.test(res.url || '') || ct.includes('text/html')) { const h = ct.includes('html') ? await res.text() : ''; throw explain(h + (res.url || ''), res.status); }
      await res.body?.cancel();
      return { kind: info.kind, id: info.id, format: fmt, name: fileName(res), size: Number(res.headers.get('content-length')) || null, downloadUrl };
    }
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${info.id}&export=download&confirm=t`;
    const res = await fetchT(downloadUrl, { headers: { 'User-Agent': UA }, redirect: 'follow' }, 15000);
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || ct.includes('text/html')) throw explain((await res.text()).slice(0, 300000), res.status);
    await res.body?.cancel(); // only the headers were needed
    return { kind: 'file', id: info.id, name: fileName(res), size: Number(res.headers.get('content-length')) || null, mimeType: ct.split(';')[0] || null, downloadUrl };
  });
  return { result };
}

export default [
  { path: '/api/scraper/gdrive/resolve', noProbe: true, remote: 'gdrive/resolve', category: 'Files', name: 'Google Drive resolve', cost: 1, desc: 'Direct download link of a public Drive file (Docs / Sheets / Slides export too)', params: [param('url', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view', 'Public page / video URL'), param('format', '', 'For Docs/Sheets/Slides: pdf, docx, xlsx, csv, pptx ...', false)], run: resolve }
];
