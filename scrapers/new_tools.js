// New utility endpoints: QR code and IP lookup.
import { HttpError, fetchT, cached, clamp, param } from '../system/util.js';
import { UA } from './_web.js';

// ---- QR code: link to the free api.qrserver.com image (png / svg) ----
async function qr(p) {
  const text = String(p.text ?? p.url ?? '').trim();
  if (!text || text.length > 800) throw new HttpError(400, 'text is required (max 800 characters).');
  const size = clamp(p.size, 100, 1000, 400), format = p.format === 'svg' ? 'svg' : 'png';
  const u = new URL('https://api.qrserver.com/v1/create-qr-code/');
  u.searchParams.set('data', text); u.searchParams.set('size', `${size}x${size}`); u.searchParams.set('format', format); u.searchParams.set('margin', '10');
  return { text, size, format, image: u.toString(), note: 'Open the link to see or save the QR code.' };
}

// ---- IP lookup: ipwho.is (free, no key). No ip given = the caller's own IP ----
async function ipInfo(p, env, req) {
  const ip = String(p.ip || (req?.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
  if (ip && !/^[0-9a-fA-F:.]{2,45}$/.test(ip)) throw new HttpError(400, 'ip must be an IPv4 or IPv6 address.');
  const d = await cached('ip:' + ip, 3600, async () => {
    const r = await fetchT('https://ipwho.is/' + ip, { headers: { 'User-Agent': UA } }, 10000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(502, 'The IP lookup service is not answering right now.');
    if (j.success === false) throw new HttpError(404, j.message || 'IP address not found.');
    return j;
  });
  return { ip: d.ip, type: d.type, country: d.country, countryCode: d.country_code, region: d.region, city: d.city, latitude: d.latitude, longitude: d.longitude, timezone: d.timezone?.id || null, isp: d.connection?.isp || null, org: d.connection?.org || null, asn: d.connection?.asn || null };
}

export default [
  { path: '/api/tools/qr', category: 'Utility', name: 'QR Code Maker', cost: 0, isNew: true, desc: 'Turn any text or link into a QR code image (png or svg)', params: [param('text', 'https://example.com', 'Text or link'), param('size', '400', '100-1000 px', false), param('format', 'png', 'png or svg', false)], run: qr },
  { path: '/api/tools/ip', category: 'Utility', name: 'IP Lookup', cost: 0, isNew: true, desc: 'Country, city, ISP and timezone of any IP address (empty = your own IP)', params: [param('ip', '8.8.8.8', 'IPv4 / IPv6 address', false)], run: ipInfo }
];
