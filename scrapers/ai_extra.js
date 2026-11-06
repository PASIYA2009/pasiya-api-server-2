// More endpoints from https://github.com/OuterSpacee/free-ai-apis : keyless translation (Lingva / MyMemory) and Tavily search (optional free key).
import { HttpError, fetchT, cached, clamp, param } from '../system/util.js';

const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const lang = (v, d) => { const x = String(v || d).trim(); if (!LANG.test(x)) throw new HttpError(400, 'Language must be a code like en, si, ta, fr.'); return x; };

async function translate(p) {
  const text = String(p.text ?? p.q ?? '').trim();
  if (!text || text.length > 1000) throw new HttpError(400, 'text is required (max 1000 characters).');
  const from = lang(p.from, 'auto'), to = lang(p.to, 'si');
  return cached(`tr:${from}:${to}:${text}`, 3600, async () => {
    const errs = [];
    try { // Lingva: Google Translate without a key
      const r = await fetchT(`https://lingva.ml/api/v1/${from}/${to}/${encodeURIComponent(text)}`, {}, 8000);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.translation) return { from, to, text, translation: d.translation, provider: 'lingva' };
      errs.push('lingva: ' + (d.error || 'HTTP ' + r.status));
    } catch (e) { errs.push('lingva: ' + e.message); }
    try { // MyMemory: 5,000 words/day without a key (needs a real source language)
      const src = from === 'auto' ? 'en' : from;
      const r = await fetchT(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${to}`, {}, 8000);
      const d = await r.json().catch(() => ({}));
      const t = d.responseData?.translatedText;
      if (r.ok && t && d.responseStatus == 200) return { from: src, to, text, translation: t, provider: 'mymemory' };
      errs.push('mymemory: ' + (d.responseDetails || 'HTTP ' + r.status));
    } catch (e) { errs.push('mymemory: ' + e.message); }
    throw new HttpError(502, 'Translation services are busy. ' + errs.join(' | '));
  });
}

async function tavily(p, env) {
  const q = String(p.q ?? p.query ?? '').trim();
  if (!q || q.length > 300) throw new HttpError(400, 'q is required (max 300 characters).');
  const r = await fetchT('https://api.tavily.com/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query: q, max_results: clamp(p.limit, 1, 10, 5), include_answer: true })
  }, 15000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status === 401 ? 503 : 502, 'Tavily: ' + (d.detail?.error || d.error || 'HTTP ' + r.status));
  return { query: q, answer: d.answer || null, results: (d.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.content, score: x.score })) };
}

export default [
  { path: '/api/ai/translate', category: 'AI', name: 'AI Translate', cost: 0, isNew: true, desc: 'Free translation (Lingva + MyMemory fallback), Sinhala / Tamil / English and 100+ languages', params: [param('text', 'Good morning, how are you?', 'Text to translate'), param('to', 'si', 'Target language code', false), param('from', 'auto', 'Source language code', false)], run: translate },
  { path: '/api/ai/search', category: 'AI', name: 'AI Web Search', cost: 1, isNew: true, desc: 'Tavily AI search: short answer + sources (needs TAVILY_API_KEY, 1,000 free searches / month)', needsEnv: ['TAVILY_API_KEY'], params: [param('q', 'latest news about Sri Lanka cricket', 'Search question'), param('limit', '5', '1-10', false)], run: tavily }
];
