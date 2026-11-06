// Keyless utilities: currency, short links, text-to-speech links, website check, temporary e-mail, weather by coordinates.
import { HttpError, fetchT, cached, clamp, param } from '../system/util.js';
import weather from './weather.js';

const UA = 'PASIYA-API/3.2';
const BAD_HOST = /^(localhost|.*\.(local|internal|localdomain|lan|home))$/i;
function publicUrl(raw) {
  let u; try { u = new URL(/^https?:\/\//i.test(String(raw).trim()) ? String(raw).trim() : 'https://' + String(raw).trim()); } catch { throw new HttpError(400, 'url must be a valid website address.'); }
  const h = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || u.username || (u.port && !['80', '443'].includes(u.port)) || BAD_HOST.test(h) || !h.includes('.') && !h.includes(':')) throw new HttpError(400, 'Only public http(s) websites are allowed.');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) { const [a, b] = h.split('.').map(Number); if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) throw new HttpError(400, 'Private addresses are not allowed.'); }
  if (h.includes(':') || h.startsWith('[')) throw new HttpError(400, 'IPv6 addresses are not allowed.');
  return u;
}

// ---- weather by coordinates ----
const wx = weather.find((e) => e.path === '/api/weather');
const coords = (p) => {
  if (p.lat === undefined || p.lon === undefined || p.lat === '' || p.lon === '') throw new HttpError(400, 'lat and lon are required (example: lat=6.9271&lon=79.8612).');
  return wx.run({ lat: p.lat, lon: p.lon, days: p.days });
};

// ---- currency (open.er-api.com, free, no key, updated daily) ----
async function currency(p) {
  const from = String(p.from || 'USD').toUpperCase(), to = String(p.to || 'LKR').toUpperCase(), amount = Number(p.amount ?? 1);
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new HttpError(400, 'from / to must be 3-letter currency codes (USD, LKR, EUR ...).');
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) throw new HttpError(400, 'amount must be a positive number.');
  const d = await cached('fx:' + from, 3600, async () => { const r = await fetchT('https://open.er-api.com/v6/latest/' + from); const j = await r.json().catch(() => ({})); if (j.result !== 'success') throw new HttpError(j['error-type'] === 'unsupported-code' || r.status === 404 ? 400 : 502, j['error-type'] === 'unsupported-code' || r.status === 404 ? `Unknown currency "${from}".` : 'Rate service error. Try again.'); return j; });
  const rate = d.rates?.[to]; if (!rate) throw new HttpError(400, `Unknown currency "${to}".`);
  return { from, to, amount, rate, converted: Math.round(amount * rate * 1e4) / 1e4, updatedAt: d.time_last_update_utc, currencies: Object.keys(d.rates).length };
}

// ---- TinyURL ----
async function tiny(p) {
  const u = publicUrl(p.url);
  const r = await fetchT('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(u.toString()), { headers: { 'User-Agent': UA } });
  const t = (await r.text()).trim();
  if (!r.ok || !/^https?:\/\//.test(t)) throw new HttpError(502, 'TinyURL could not shorten that link.');
  return { original: u.toString(), short: t };
}

// ---- text to speech: direct MP3 links from the public translate voice (max ~190 chars per link, so long text is split) ----
function tts(p) {
  const text = String(p.text || p.q || '').trim(), lang = String(p.lang || 'si').toLowerCase();
  if (!text) throw new HttpError(400, 'text is required.');
  if (text.length > 3000) throw new HttpError(400, 'text is too long (max 3000 characters).');
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(lang)) throw new HttpError(400, 'lang must be a code like si, en, ta, ja.');
  const parts = []; let cur = '';
  for (const w of text.replace(/\s+/g, ' ').split(' ')) { if ((cur + ' ' + w).length > 190 && cur) { parts.push(cur); cur = w.slice(0, 190); } else cur = cur ? cur + ' ' + w : w; }
  if (cur) parts.push(cur);
  const urls = parts.map((t, i) => `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(t)}&total=${parts.length}&idx=${i}&textlen=${t.length}`);
  return { language: lang, characters: text.length, parts: urls.length, audio: urls, note: 'Play the links in order. Each one is an MP3.' };
}

// ---- WebCheck: quick SEO + security audit of one public page ----
async function webcheck(p) {
  let u = publicUrl(p.url), r, t0 = Date.now();
  for (let hop = 0; hop < 4; hop++) {
    r = await fetchT(u.toString(), { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PASIYA-WebCheck/1.0)', Accept: 'text/html,*/*' } }, 12000);
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = publicUrl(new URL(r.headers.get('location'), u).toString()); continue; }
    break;
  }
  const ms = Date.now() - t0, h = (k) => r.headers.get(k);
  const html = ((h('content-type') || '').includes('html') ? (await r.text()).slice(0, 400_000) : '');
  const m = (re) => (html.match(re)?.[1] || '').replace(/\s+/g, ' ').trim();
  const title = m(/<title[^>]*>([\s\S]*?)<\/title>/i), desc = m(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i);
  const h1 = [...html.matchAll(/<h1[\s>]/gi)].length, imgs = [...html.matchAll(/<img\b[^>]*>/gi)], noAlt = imgs.filter((x) => !/\balt=/i.test(x[0])).length;
  const sec = { 'strict-transport-security': !!h('strict-transport-security'), 'content-security-policy': !!h('content-security-policy'), 'x-frame-options': !!h('x-frame-options'), 'x-content-type-options': !!h('x-content-type-options'), 'referrer-policy': !!h('referrer-policy') };
  const checks = [
    ['HTTPS', u.protocol === 'https:'], ['Page loads (HTTP 200)', r.status === 200], ['Title length 10-65', title.length >= 10 && title.length <= 65],
    ['Meta description 50-170', desc.length >= 50 && desc.length <= 170], ['Exactly one H1', h1 === 1], ['Viewport meta (mobile)', /name=["']viewport["']/i.test(html)],
    ['Canonical link', /rel=["']canonical["']/i.test(html)], ['Open Graph tags', /property=["']og:title["']/i.test(html)], ['Images have alt text', imgs.length === 0 || noAlt === 0],
    ...Object.entries(sec).map(([k, v]) => ['Header: ' + k, v])
  ];
  return { url: u.toString(), status: r.status, responseMs: ms, server: h('server') || null, title, description: desc, h1Count: h1, images: imgs.length, imagesWithoutAlt: noAlt, securityHeaders: sec, score: Math.round((checks.filter((c) => c[1]).length / checks.length) * 100), checks: checks.map(([name, ok]) => ({ name, ok })) };
}

// ---- Temporary e-mail on Guerrilla Mail (first), mail.tm and mail.gw (all free, no key; if one is down the next is used). The mailbox "id" packs provider + address + password, so nothing is stored on our side. ----
const MAILS = { tm: 'https://api.mail.tm', gw: 'https://api.mail.gw', gm: 'https://api.guerrillamail.com' };
const pack = (v, a, pw) => Buffer.from(`${v}|${a}|${pw}`).toString('base64url');
const unpack = (id) => {
  const parts = Buffer.from(String(id || ''), 'base64url').toString().split('|');
  const [v, a, pw] = parts.length === 2 ? ['tm', ...parts] : parts; // old 2-part ids = mail.tm
  if (!MAILS[v] || !a || !pw || !a.includes('@')) throw new HttpError(400, 'Invalid mailbox id. Use the id returned by /api/tempmail/random.');
  return [v, a, pw];
};
const mt = async (v, path, opts = {}, tok) => {
  const doFetch = () => fetchT(MAILS[v] + path, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; PASIYA-API)', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) } }, 12000);
  let r = await doFetch();
  if (r.status >= 500 || r.status === 429) { await new Promise((ok) => setTimeout(ok, 700)); r = await doFetch(); } // one quick retry
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new HttpError(401, 'Mailbox login failed (wrong id or the mailbox was deleted).');
  if (r.status === 404) throw new HttpError(404, 'Not found.');
  if (r.status === 429) throw new HttpError(429, 'Mail service is busy. Try again shortly.');
  if (!r.ok) throw new HttpError(502, 'Mail service error (HTTP ' + r.status + ').');
  return d;
};
// ---- Guerrilla Mail (id = gm | address | session token). The session token can expire; it is rebuilt from the address when that happens. ----
const GM = 'https://api.guerrillamail.com/ajax.php';
const gmCall = async (q) => {
  const u = new URL(GM); for (const [k, val] of Object.entries({ ip: '127.0.0.1', agent: 'PASIYA-API', ...q })) u.searchParams.set(k, val);
  const r = await fetchT(u, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; PASIYA-API)' } }, 10000);
  if (!r.ok) throw new HttpError(r.status === 429 ? 429 : 502, 'Guerrilla Mail error (HTTP ' + r.status + ').');
  const d = await r.json().catch(() => null);
  if (!d || typeof d !== 'object') throw new HttpError(502, 'Guerrilla Mail sent an unreadable answer.');
  return d;
};
async function gmSession(address, sid) { // returns a working { sid, address }
  if (sid) { const d = await gmCall({ f: 'get_email_address', sid_token: sid }).catch(() => null); if (d?.email_addr && d.email_addr.split('@')[0] === address.split('@')[0]) return { sid: d.sid_token || sid, address: d.email_addr }; }
  const d = await gmCall({ f: 'set_email_user', email_user: address.split('@')[0], lang: 'en', site: 'guerrillamail.com' });
  if (!d.email_addr || !d.sid_token) throw new HttpError(401, 'Mailbox session expired. Create a new one with /api/tempmail/random.');
  return { sid: d.sid_token, address: d.email_addr };
}
async function gmRandom() {
  const d = await gmCall({ f: 'get_email_address', lang: 'en' });
  if (!d.email_addr || !d.sid_token) throw new HttpError(502, 'Guerrilla Mail gave no address.');
  return { address: d.email_addr, id: pack('gm', d.email_addr, d.sid_token), provider: 'guerrillamail', note: 'Keep the id. Use it with /api/tempmail/mailbox?id=...' };
}
const gmDate = (t) => (t ? new Date(Number(t) * 1000).toISOString() : null);
async function gmBox(address, sid) {
  let ses = await gmSession(address, sid), d = await gmCall({ f: 'check_email', seq: '0', sid_token: ses.sid });
  if (!Array.isArray(d.list)) { ses = await gmSession(address, null); d = await gmCall({ f: 'check_email', seq: '0', sid_token: ses.sid }); }
  const list = (d.list || []).filter((x) => x.mail_id && String(x.mail_id) !== '1' || x.mail_from !== 'no-reply@guerrillamail.com'); // hide the built-in welcome mail
  return { address: ses.address, count: list.length, messages: list.map((x) => ({ id: String(x.mail_id), from: x.mail_from, subject: x.mail_subject, intro: x.mail_excerpt, seen: String(x.mail_read) === '1', receivedAt: gmDate(x.mail_timestamp) })) };
}
async function gmMsg(address, sid, mid) {
  const ses = await gmSession(address, sid), x = await gmCall({ f: 'fetch_email', email_id: mid, sid_token: ses.sid });
  if (!x.mail_id) throw new HttpError(404, 'Not found.');
  return { address: ses.address, from: x.mail_from, to: x.mail_recipient || ses.address, subject: x.mail_subject, receivedAt: gmDate(x.mail_timestamp), text: String(x.mail_body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), html: x.mail_body, attachments: (x.att_info || []).map((a) => ({ name: a.f, size: a.s })) };
}

const login = async (id) => { const [v, address, password] = unpack(id); return { v, address, token: (await mt(v, '/token', { method: 'POST', body: JSON.stringify({ address, password }) })).token }; };
async function tmRandom() {
  const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
  const errs = [];
  try { return await gmRandom(); } catch (e) { errs.push('guerrillamail: ' + e.message); }
  for (const v of ['tm', 'gw']) {
    try {
      const dom = (await mt(v, '/domains'))['hydra:member']?.[0]?.domain; if (!dom) throw new HttpError(502, 'No mail domain available.');
      const address = `${rnd(10)}@${dom}`, password = rnd(16);
      await mt(v, '/accounts', { method: 'POST', body: JSON.stringify({ address, password }) });
      return { address, id: pack(v, address, password), provider: 'mail.' + v, note: 'Keep the id. Use it with /api/tempmail/mailbox?id=...' };
    } catch (e) { errs.push(`mail.${v}: ${e.message}`); }
  }
  throw new HttpError(502, 'No temp-mail service answered (' + errs.join('; ') + ').');
}
async function tmBox(p) {
  const [v0, a0, s0] = unpack(p.id); if (v0 === 'gm') return gmBox(a0, s0);
  const { v, address, token } = await login(p.id);
  const d = await mt(v, '/messages?page=1', {}, token);
  return { address, count: d['hydra:totalItems'] ?? 0, messages: (d['hydra:member'] || []).map((x) => ({ id: x.id, from: x.from?.address, subject: x.subject, intro: x.intro, seen: x.seen, receivedAt: x.createdAt })) };
}
async function tmMsg(p) {
  const mid = String(p.mid || '').trim();
  const [v0, a0, s0] = unpack(p.id);
  if (v0 === 'gm') { if (!/^[0-9]{1,15}$/.test(mid)) throw new HttpError(400, 'mid (message id from the mailbox list) is required.'); return gmMsg(a0, s0, mid); }
  const { v, address, token } = await login(p.id);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(mid)) throw new HttpError(400, 'mid (message id from the mailbox list) is required.');
  const x = await mt(v, '/messages/' + mid, {}, token);
  return { address, from: x.from, to: x.to, subject: x.subject, receivedAt: x.createdAt, text: x.text, html: Array.isArray(x.html) ? x.html.join('') : x.html, attachments: (x.attachments || []).map((a) => ({ name: a.filename, size: a.size })) };
}

const ID = param('id', '', 'Mailbox id from /api/tempmail/random');
export default [
  { path: '/api/weather/coords', category: 'Utility', name: 'Weather by Coords', cost: 0, isNew: true, desc: 'Exact-location weather by latitude/longitude - perfect for IoT & bots', params: [param('lat', '6.9271', 'Latitude'), param('lon', '79.8612', 'Longitude'), param('days', '3', 'Forecast days (1-7)', false)], run: coords },
  { path: '/api/currency', category: 'Utility', name: 'Currency Converter', cost: 0, isNew: true, desc: 'Live currency exchange rates & conversion - 160+ currencies including LKR, updated daily', params: [param('from', 'USD', '3-letter code'), param('to', 'LKR', '3-letter code'), param('amount', '1', 'Amount', false)], run: currency },
  { path: '/api/tools/tts', category: 'Utility', name: 'Text to Speech', cost: 0, isNew: true, desc: 'Turn Sinhala (or any language) text into MP3 speech links, up to 3000 characters', params: [param('text', 'ආයුබෝවන්', 'Text to speak'), param('lang', 'si', 'si, en, ta, ja ...', false)], run: tts },
  { path: '/api/tools/tinyurl', category: 'Utility', name: 'TinyURL', cost: 0, isNew: true, desc: 'Shorten links with TinyURL', params: [param('url', 'https://example.com/a/very/long/link', 'Link to shorten')], run: tiny },
  { path: '/api/tools/webcheck', category: 'Utility', name: 'WebCheck', cost: 0, isNew: true, desc: 'Quick SEO & security-header audit of one public page', params: [param('url', 'https://example.com', 'Website address')], run: webcheck },
  { path: '/api/tempmail/random', category: 'Utility', name: 'Tempmail: Random', cost: 0, isNew: true, desc: 'Generate an instant disposable email address (Guerrilla Mail, with mail.tm / mail.gw as backup)', params: [], run: tmRandom },
  { path: '/api/tempmail/mailbox', noProbe: true, category: 'Utility', name: 'Tempmail: Mailbox', cost: 0, isNew: true, desc: 'List inbox messages of a temp mailbox', params: [ID], run: tmBox },
  { path: '/api/tempmail/message', noProbe: true, category: 'Utility', name: 'Tempmail: Message', cost: 0, isNew: true, desc: 'Read one temp email with full text/HTML body', params: [ID, param('mid', '', 'Message id from the mailbox list')], run: tmMsg }
];
