// Sri Lankan TV channels. Live stream links come from the public iptv-org community playlist and are cached for 1 hour.
// Streams are published by third parties and can go offline or be geo-blocked at any time.
import { HttpError, fetchT, cached, clamp, param } from '../system/util.js';

const PLAYLIST = 'https://iptv-org.github.io/iptv/countries/lk.m3u';

export function parseM3u(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('#EXTINF')) continue;
    let j = i + 1;
    while (j < lines.length && (lines[j].startsWith('#') || !lines[j].trim())) j++;
    const url = (lines[j] || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const attr = (k) => l.match(new RegExp(`${k}="([^"]*)"`, 'i'))?.[1] || null;
    const name = l.slice(l.lastIndexOf(',') + 1).trim();
    if (!name) continue;
    out.push({
      id: attr('tvg-id'), name: name.replace(/\s*\(\d{3,4}p\)\s*|\s*\[[^\]]*\]\s*/g, ' ').trim(), quality: name.match(/(\d{3,4})p/)?.[1] ? name.match(/(\d{3,4})p/)[1] + 'p' : null,
      logo: attr('tvg-logo'), group: attr('group-title'), language: attr('tvg-language'), streamUrl: url
    });
    i = j;
  }
  return out;
}

async function all() {
  return cached('tv:lk', 3600, async () => {
    const r = await fetchT(PLAYLIST, {}, 12000);
    if (!r.ok) throw new HttpError(502, 'Channel playlist is unavailable right now.');
    return parseM3u(await r.text());
  });
}

async function channels(p) {
  const q = String(p.q || '').trim().toLowerCase().slice(0, 60);
  const limit = clamp(p.limit, 1, 100, 50);
  let list = await all();
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q));
  return { country: 'Sri Lanka', count: Math.min(list.length, limit), channels: list.slice(0, limit), note: 'Third-party public streams; availability is not guaranteed.' };
}

export default [
  { path: '/api/tv/channels', category: 'TV', name: 'Sri Lanka TV channels', cost: 0, desc: 'Channel list with logos and public live-stream links', params: [param('q', 'derana', 'Search by channel name', false), param('limit', '50', 'Max 100', false)], run: channels }
];
