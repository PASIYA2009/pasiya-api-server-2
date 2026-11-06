// AI endpoints through OFFICIAL provider APIs (no scraping of chat websites: chatgpt.com / claude.ai have no public API,
// need a logged-in session + captcha tokens and break every few days, so they cannot be made reliable).
// Each model name tries a chain of providers and uses the first one that is configured and answers.
// Add as many FREE keys as you like (see .env.example): the more keys, the more reliable. Model ids can be overridden with MODEL_* env vars.
import { HttpError, fetchT, param } from '../system/util.js';

const chains = (env) => withFree({
  gemini: [['gemini', env.MODEL_GEMINI || 'gemini-3.8-flash'], ['gemini', 'gemini-flash-latest'], ['gemini', 'gemini-2.5-flash'], ['gemini', 'gemini-flash-lite-latest'], ['workers-ai', env.MODEL_GEMINI_FALLBACK_CF || '@cf/meta/llama-3.3-70b-instruct-fp8-fast']],
  gpt: [
    ['openrouter', env.MODEL_GPT_OPENROUTER || 'openai/gpt-oss-20b:free'],
    ['groq', env.MODEL_GPT_GROQ || 'openai/gpt-oss-20b'],
    ['cerebras', env.MODEL_GPT_CEREBRAS || 'gpt-oss-120b'],
    ['github', env.MODEL_GPT_GITHUB || 'openai/gpt-4.1-mini'],
    ['workers-ai', env.MODEL_GPT_CF || '@cf/openai/gpt-oss-20b']
  ],
  deepseek: [
    ['deepseek', env.MODEL_DEEPSEEK || 'deepseek-chat'],
    ['openrouter', env.MODEL_DEEPSEEK_OPENROUTER || 'deepseek/deepseek-chat-v3.1:free'],
    ['github', env.MODEL_DEEPSEEK_GITHUB || 'deepseek/DeepSeek-V3-0324'],
    ['workers-ai', env.MODEL_DEEPSEEK_CF || '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b']
  ],
  // There is no free Claude API. Real Claude needs an OpenRouter key with credits (or ANTHROPIC_API_KEY); otherwise a free substitute answers.
  claude: [['anthropic', env.MODEL_CLAUDE_ANTHROPIC || 'claude-haiku-4-5'], ['openrouter', env.MODEL_CLAUDE || 'anthropic/claude-haiku-4.5']],
  gemma: [['openrouter', env.MODEL_GEMMA || 'google/gemma-3-27b-it:free'], ['groq', env.MODEL_GEMMA_GROQ || 'google/gemma-3-27b-it'], ['workers-ai', env.MODEL_GEMMA_CF || '@cf/google/gemma-3-12b-it']],
  kimi: [['openrouter', env.MODEL_KIMI || 'moonshotai/kimi-k2:free'], ['groq', env.MODEL_KIMI_GROQ || 'moonshotai/kimi-k2-instruct-0905']],
  glm: [['openrouter', env.MODEL_GLM || 'z-ai/glm-4.5-air:free'], ['cerebras', env.MODEL_GLM_CEREBRAS || 'zai-glm-4.6']],
  minimax: [['openrouter', env.MODEL_MINIMAX || 'minimax/minimax-m2:free']],
  coder: [['openrouter', env.MODEL_CODER || 'qwen/qwen3-coder:free'], ['groq', env.MODEL_CODER_GROQ || 'openai/gpt-oss-120b'], ['cerebras', env.MODEL_CODER_CEREBRAS || 'qwen-3-coder-480b'], ['workers-ai', env.MODEL_CODER_CF || '@cf/qwen/qwen2.5-coder-32b-instruct']],
  llama: [
    ['groq', env.MODEL_LLAMA_GROQ || 'llama-3.1-8b-instant'],
    ['cerebras', env.MODEL_LLAMA_CEREBRAS || 'llama3.1-8b'],
    ['workers-ai', env.MODEL_LLAMA_CF || '@cf/meta/llama-3.1-8b-instruct']
  ]
}, env);

// More providers from https://github.com/OuterSpacee/free-ai-apis (all OpenAI-compatible, free tier / free credits).
// They are only used when their key is set, so adding a key is all it takes. Every model id can be overridden with MODEL_* env vars.
const more = (env) => ({
  gpt: [['huggingface', env.MODEL_GPT_HF || 'openai/gpt-oss-120b'], ['sambanova', env.MODEL_GPT_SAMBANOVA || 'gpt-oss-120b'], ['together', env.MODEL_GPT_TOGETHER || 'openai/gpt-oss-20b'], ['fireworks', env.MODEL_GPT_FIREWORKS || 'accounts/fireworks/models/gpt-oss-20b'], ['deepinfra', env.MODEL_GPT_DEEPINFRA || 'openai/gpt-oss-20b']],
  deepseek: [['sambanova', env.MODEL_DEEPSEEK_SAMBANOVA || 'DeepSeek-V3.1'], ['huggingface', env.MODEL_DEEPSEEK_HF || 'deepseek-ai/DeepSeek-V3.1'], ['together', env.MODEL_DEEPSEEK_TOGETHER || 'deepseek-ai/DeepSeek-V3.1'], ['fireworks', env.MODEL_DEEPSEEK_FIREWORKS || 'accounts/fireworks/models/deepseek-v3p1'], ['deepinfra', env.MODEL_DEEPSEEK_DEEPINFRA || 'deepseek-ai/DeepSeek-V3.1'], ['hyperbolic', env.MODEL_DEEPSEEK_HYPERBOLIC || 'deepseek-ai/DeepSeek-V3']],
  gemma: [['huggingface', env.MODEL_GEMMA_HF || 'google/gemma-3-27b-it'], ['deepinfra', env.MODEL_GEMMA_DEEPINFRA || 'google/gemma-3-27b-it']],
  kimi: [['huggingface', env.MODEL_KIMI_HF || 'moonshotai/Kimi-K2-Instruct'], ['together', env.MODEL_KIMI_TOGETHER || 'moonshotai/Kimi-K2-Instruct-0905'], ['fireworks', env.MODEL_KIMI_FIREWORKS || 'accounts/fireworks/models/kimi-k2-instruct-0905'], ['hyperbolic', env.MODEL_KIMI_HYPERBOLIC || 'moonshotai/Kimi-K2-Instruct'], ['deepinfra', env.MODEL_KIMI_DEEPINFRA || 'moonshotai/Kimi-K2-Instruct']],
  glm: [['together', env.MODEL_GLM_TOGETHER || 'zai-org/GLM-4.5-Air-FP8'], ['huggingface', env.MODEL_GLM_HF || 'zai-org/GLM-4.5-Air'], ['deepinfra', env.MODEL_GLM_DEEPINFRA || 'zai-org/GLM-4.5-Air']],
  minimax: [['huggingface', env.MODEL_MINIMAX_HF || 'MiniMaxAI/MiniMax-M2'], ['together', env.MODEL_MINIMAX_TOGETHER || 'MiniMaxAI/MiniMax-M2'], ['deepinfra', env.MODEL_MINIMAX_DEEPINFRA || 'MiniMaxAI/MiniMax-M2']],
  coder: [['huggingface', env.MODEL_CODER_HF || 'Qwen/Qwen3-Coder-480B-A35B-Instruct'], ['together', env.MODEL_CODER_TOGETHER || 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8'], ['fireworks', env.MODEL_CODER_FIREWORKS || 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct'], ['hyperbolic', env.MODEL_CODER_HYPERBOLIC || 'Qwen/Qwen3-Coder-480B-A35B-Instruct'], ['deepinfra', env.MODEL_CODER_DEEPINFRA || 'Qwen/Qwen3-Coder-480B-A35B-Instruct']],
  llama: [['sambanova', env.MODEL_LLAMA_SAMBANOVA || 'Meta-Llama-3.1-8B-Instruct'], ['together', env.MODEL_LLAMA_TOGETHER || 'meta-llama/Llama-3.3-70B-Instruct-Turbo'], ['huggingface', env.MODEL_LLAMA_HF || 'meta-llama/Llama-3.1-8B-Instruct']]
});

// Substitutes: used only when NONE of a model's own providers answered, so every endpoint still gives an answer (the reply says substituted:true).
const generic = (env) => [
  ['gemini', env.MODEL_SUB_GEMINI || 'gemini-3.8-flash'], ['gemini', 'gemini-flash-latest'], ['gemini', 'gemini-flash-lite-latest'],
  ['groq', env.MODEL_SUB_GROQ || 'auto'], ['cerebras', env.MODEL_SUB_CEREBRAS || 'auto'],
  ['mistral', env.MODEL_SUB_MISTRAL || 'mistral-small-latest'], ['github', env.MODEL_SUB_GITHUB || 'openai/gpt-4.1-mini'],
  ['openrouter', env.MODEL_SUB_OPENROUTER || 'meta-llama/llama-3.3-70b-instruct:free'], ['workers-ai', env.MODEL_SUB_CF || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  ['sambanova', env.MODEL_SUB_SAMBANOVA || 'Meta-Llama-3.3-70B-Instruct'], ['together', env.MODEL_SUB_TOGETHER || 'meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  ['huggingface', env.MODEL_SUB_HF || 'meta-llama/Llama-3.3-70B-Instruct'], ['hyperbolic', env.MODEL_SUB_HYPERBOLIC || 'meta-llama/Llama-3.3-70B-Instruct'],
  ['fireworks', env.MODEL_SUB_FIREWORKS || 'accounts/fireworks/models/llama-v3p3-70b-instruct'], ['deepinfra', env.MODEL_SUB_DEEPINFRA || 'meta-llama/Llama-3.3-70B-Instruct'],
  ['novita', env.MODEL_SUB_NOVITA || 'meta-llama/llama-3.3-70b-instruct'], ['cohere', env.MODEL_SUB_COHERE || 'command-r-08-2024'], ['aiml', env.MODEL_SUB_AIML || 'gpt-4o-mini']
];
const PMODEL = { gemini: 'gemini', deepseek: 'deepseek', claude: 'claude', llama: 'llama', coder: 'qwen-coder' }; // best matching Pollinations model per name (others use 'openai')
// Order: own providers -> substitutes -> Pollinations (last: anonymous use is limited to 1 reply / 45 s per IP, a free key from enter.pollinations.ai removes that).
function withFree(c, env) {
  const g = generic(env), m = more(env);
  return Object.fromEntries(Object.entries(c).map(([k, v0]) => {
    const v = [...v0, ...(m[k] || [])];
    const own = new Set(v.map((x) => x[0] + '|' + x[1]));
    return [k, [...v, ...g.filter((x) => !own.has(x[0] + '|' + x[1])).map((x) => [...x, 'sub']), ['pollinations', PMODEL[k] || 'openai', 'sub']]];
  }));
}
export const MODEL_NAMES = ['gemini', 'gpt', 'deepseek', 'claude', 'llama', 'gemma', 'kimi', 'glm', 'minimax', 'coder'];

// OpenAI-compatible providers: [chat url, env var that holds the key]
const OAI = {
  openrouter: ['https://openrouter.ai/api/v1/chat/completions', 'OPENROUTER_API_KEY'],
  groq: ['https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY'],
  deepseek: ['https://api.deepseek.com/chat/completions', 'DEEPSEEK_API_KEY'],
  cerebras: ['https://api.cerebras.ai/v1/chat/completions', 'CEREBRAS_API_KEY'],
  mistral: ['https://api.mistral.ai/v1/chat/completions', 'MISTRAL_API_KEY'],
  github: ['https://models.github.ai/inference/chat/completions', 'GITHUB_TOKEN'],
  // from free-ai-apis:
  huggingface: ['https://router.huggingface.co/v1/chat/completions', 'HF_TOKEN'],
  sambanova: ['https://api.sambanova.ai/v1/chat/completions', 'SAMBANOVA_API_KEY'],
  together: ['https://api.together.xyz/v1/chat/completions', 'TOGETHER_API_KEY'],
  fireworks: ['https://api.fireworks.ai/inference/v1/chat/completions', 'FIREWORKS_API_KEY'],
  deepinfra: ['https://api.deepinfra.com/v1/openai/chat/completions', 'DEEPINFRA_API_KEY'],
  hyperbolic: ['https://api.hyperbolic.xyz/v1/chat/completions', 'HYPERBOLIC_API_KEY'],
  novita: ['https://api.novita.ai/v3/openai/chat/completions', 'NOVITA_API_KEY'],
  cohere: ['https://api.cohere.ai/compatibility/v1/chat/completions', 'COHERE_API_KEY'],
  aiml: ['https://api.aimlapi.com/v1/chat/completions', 'AIML_API_KEY']
};
const configured = (prov, env) => (OAI[prov] ? !!env[OAI[prov][1]] : ({
  gemini: !!env.GEMINI_API_KEY, anthropic: !!env.ANTHROPIC_API_KEY, pollinations: true, 'workers-ai': !!(env.CF_ACCOUNT_ID && env.CF_API_TOKEN)
}[prov]));

// Ask the provider which models THIS key can really use (cached 10 min). Models that are missing / decommissioned are skipped
// instantly instead of failing, and model 'auto' picks the best one that exists. If the list cannot be read, nothing is filtered.
const MODELS_URL = { groq: 'https://api.groq.com/openai/v1/models', mistral: 'https://api.mistral.ai/v1/models', cerebras: 'https://api.cerebras.ai/v1/models' };
const PREFER = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b', 'llama-3.1-8b-instant'],
  cerebras: ['gpt-oss-120b', 'llama-3.3-70b', 'qwen-3-235b-a22b-instruct-2507', 'llama3.1-8b']
};
const NOT_CHAT = /whisper|guard|tts|orpheus|embed|moderation|ocr|transcribe|playai/i;
const modelMem = new Map();
async function modelList(prov, env) {
  if (!MODELS_URL[prov]) return null;
  const hit = modelMem.get(prov);
  if (hit && hit.exp > Date.now()) return hit.v;
  let v = null;
  try {
    const r = await fetchT(MODELS_URL[prov], { headers: { Authorization: `Bearer ${env[OAI[prov][1]]}` } }, 4000);
    const d = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(d.data)) v = d.data.map((m) => m.id).filter((id) => id && !NOT_CHAT.test(id));
  } catch { /* keep null */ }
  modelMem.set(prov, { v, exp: Date.now() + (v ? 600_000 : 60_000) });
  return v;
}
// -> the model id to call, or null = this key does not have it (skip)
async function resolveModel(prov, model, env) {
  const list = await modelList(prov, env);
  if (model === 'auto') return list ? (PREFER[prov] || []).find((m) => list.includes(m)) || list[0] || null : (PREFER[prov] || [])[0] || null;
  if (list && !list.includes(model)) return null;
  return model;
}

async function openaiStyle(url, key, model, messages, max, ms, extraHeaders = {}) {
  const r = await fetchT(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, messages, max_tokens: max, temperature: 0.7 })
  }, ms);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || (typeof d.error === 'string' ? d.error : '') || d.message || `HTTP ${r.status}`);
  const t = d.choices?.[0]?.message?.content;
  if (!t) throw new Error('empty answer');
  return t;
}

// Pollinations: with POLLINATIONS_API_KEY (free at https://enter.pollinations.ai) there is no 45 s limit.
// Anonymous: the server tells us how long to wait; we remember it and skip instantly (no wasted 25 s calls, no second hit on the limit).
let pollBlockedUntil = 0;
async function pollinations(model, messages, max, env, ms) {
  const key = env.POLLINATIONS_API_KEY || env.POLLINATIONS_KEY;
  if (key) return openaiStyle('https://gen.pollinations.ai/v1/chat/completions', key, model, messages, max, ms);
  const wait = pollBlockedUntil - Date.now();
  if (wait > 0) throw new Error(`free Pollinations limit (1 reply / 45 s per IP): retry in ${Math.ceil(wait / 1000)}s. Add a free POLLINATIONS_API_KEY.`);
  const errs = [];
  for (const m of [...new Set([model, 'openai'])]) {
    try {
      const r = await fetchT('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m, messages, max_tokens: max }) }, ms);
      const d = await r.json().catch(() => ({}));
      const t = r.ok && d.choices?.[0]?.message?.content;
      if (t) return t;
      const msg = String(d.error?.message || d.error || 'HTTP ' + r.status);
      errs.push(`${m}: ${msg}`);
      if (r.status === 429 || /limit reached/i.test(msg)) { // do not hit the limit a second time
        const s = Number(msg.match(/after\s+(\d+)\s*s/i)?.[1]) || 45;
        pollBlockedUntil = Date.now() + Math.min(s, 60) * 1000;
        break;
      }
    } catch (e) { errs.push(`${m}: ${e.message}`); }
  }
  throw new Error(errs.join(' / ') || 'empty answer');
}

async function run(prov, model, messages, max, env, ms) {
  if (OAI[prov]) return openaiStyle(OAI[prov][0], env[OAI[prov][1]], model, messages, max, ms, prov === 'openrouter' ? { 'X-Title': 'PASIYA API' } : {});
  if (prov === 'gemini') {
    const sys = messages.find((m) => m.role === 'system')?.content;
    const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
    const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: user }] }], ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), generationConfig: { maxOutputTokens: max } })
    }, ms);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
    const t = d.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('');
    if (!t) throw new Error('empty answer');
    return t;
  }
  if (prov === 'anthropic') { // official Claude API (paid): ANTHROPIC_API_KEY
    const sys = messages.find((m) => m.role === 'system')?.content;
    const r = await fetchT('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: max, ...(sys ? { system: sys } : {}), messages: messages.filter((m) => m.role !== 'system') })
    }, ms);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
    const t = (d.content || []).map((x) => x.text || '').join('');
    if (!t) throw new Error('empty answer');
    return t;
  }
  if (prov === 'pollinations') return pollinations(model, messages, max, env, ms);
  if (prov === 'workers-ai') { // Cloudflare Workers AI over REST (free tier): needs CF_ACCOUNT_ID + CF_API_TOKEN
    const r = await fetchT(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CF_API_TOKEN}` }, body: JSON.stringify({ messages, max_tokens: max })
    }, ms);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw new Error(d.errors?.[0]?.message || `HTTP ${r.status}`);
    const x = d.result, t = x?.response ?? x?.choices?.[0]?.message?.content ?? x?.output_text;
    if (!t) throw new Error('empty answer');
    return String(t);
  }
  throw new Error('unknown provider');
}

function makeHandler(forced, persona) {
  return async (p, env) => {
    const name = forced || String(p.model || 'gpt').toLowerCase();
    const prompt = String(p.prompt ?? p.q ?? p.text ?? '').trim();
    if (!prompt) throw new HttpError(400, 'prompt is required (example: ?prompt=Hello).');
    if (prompt.length > 4000) throw new HttpError(400, 'prompt is too long (max 4000 characters).');
    const chain = chains(env)[name];
    if (!chain) throw new HttpError(400, `Unknown model "${name}". Use: ${MODEL_NAMES.join(', ')}`);
    // Pollinations is always "configured", so only count REAL keys when deciding whether the server has AI set up.
    const usable = chain.filter(([prov]) => configured(prov, env));
    const max = Math.min(Number(p.max_tokens) || 700, 1500);
    const messages = [
      ...((p.system || persona) ? [{ role: 'system', content: String(p.system || persona).slice(0, 800) }] : []),
      { role: 'user', content: prompt }
    ];
    const tried = [], deadline = Date.now() + 20000; // total budget stays under the Vercel limit and the 24 s health check
    for (const [prov, model0, kind] of usable) {
      const left = deadline - Date.now();
      if (left < 2500) { tried.push('stopped: time budget used'); break; }
      try {
        const model = await resolveModel(prov, model0, env);
        if (!model) { tried.push(`${prov}: ${model0} is not available for this key (skipped)`); continue; }
        const answer = await run(prov, model, messages, max, env, Math.min(9000, left));
        return { model: name, provider: prov, modelId: model, ...(kind === 'sub' ? { substituted: true } : {}), answer: answer.trim() };
      } catch (e) { tried.push(`${prov}: ${String(e.message).slice(0, 140)}`); }
    }
    const hasKey = usable.some(([prov]) => prov !== 'pollinations');
    throw new HttpError(hasKey ? 502 : 503, (hasKey ? 'All providers failed. ' : 'No AI key is set on this server, and the free anonymous service is limited. Owner: add free keys (GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, SAMBANOVA_API_KEY, HF_TOKEN, TOGETHER_API_KEY, POLLINATIONS_API_KEY...). ') + tried.join(' | '));
  };
}

const prompt = (ex, sys = true) => [param('prompt', ex, 'Your message'), ...(sys ? [param('system', '', 'Optional instruction', false)] : [])];
const endpoints = [
  { path: '/api/ai/gemini', category: 'AI', name: 'Gemini', cost: 1, desc: 'Google Gemini chat', params: prompt('Explain Sri Lanka in 2 lines'), run: makeHandler('gemini') },
  { path: '/api/ai/gpt', category: 'AI', name: 'GPT', cost: 1, desc: 'Open GPT model chat (free tiers first)', params: prompt('Write a haiku about rain'), run: makeHandler('gpt') },
  { path: '/api/ai/deepseek', category: 'AI', name: 'DeepSeek', cost: 1, desc: 'DeepSeek chat', params: prompt('What is 17 * 23?'), run: makeHandler('deepseek') },
  { path: '/api/ai/claude', category: 'AI', name: 'Claude', cost: 2, desc: 'Claude chat (real Claude with an OpenRouter key, otherwise a free Llama fallback)', params: prompt('Give me 3 startup ideas'), run: makeHandler('claude') },
  { path: '/api/ai/llama', category: 'AI', name: 'Llama', cost: 1, desc: 'Llama chat on Cloudflare Workers AI / Groq', params: prompt('Tell me a joke', false), run: makeHandler('llama') },
  ...[
    // [path, name, model chain, cost, description, persona]
    ['/api/chatgpt', 'ChatGPT', 'gpt', 1, 'ChatGPT-style AI chat - ask anything in Sinhala or English, with an optional custom system prompt', null, 'Tell me a fun fact about Sri Lanka'],
    ['/api/deepseek-v4-flash', 'DeepSeek Fast', 'deepseek', 1, 'DeepSeek - fast, precise reasoning AI for hard questions and logic', 'Think carefully and answer precisely. Show short step-by-step reasoning for maths and logic.', 'If 3x + 5 = 20, what is x?'],
    ['/api/gemma', 'Gemma', 'gemma', 1, "Google's open lightweight model - helpful, concise answers", null, 'Explain photosynthesis simply'],
    ['/api/kimi-k2.7', 'Kimi', 'kimi', 1, "Moonshot AI's long-context thinking model - step-by-step reasoning", 'Reason step by step, then give a clear final answer.', 'Plan a 3 day trip to Kandy'],
    ['/api/glm-5v-turbo', 'GLM', 'glm', 1, "Zhipu AI's fast assistant - great with code and structured answers", null, 'Write a JSON example of a user profile'],
    ['/api/minimax-m2.7', 'MiniMax', 'minimax', 1, 'Fast and capable general assistant - clear, direct, high-quality answers', null, 'Give me 5 study tips'],
    ['/api/gpt-5.3-codex', 'Coder', 'coder', 1, 'Coding specialist - complete runnable code with short explanations', 'You are an expert programmer. Reply with complete runnable code first, then a short explanation.', 'Python function to reverse a string'],
    ['/api/blackbox', 'BlackBox Coder', 'coder', 1, 'Elite coding assistant - complete runnable code with short explanations', 'You are an elite coding assistant. Give complete runnable code in a code block and a very short explanation.', 'JavaScript debounce function'],
    ['/api/perplexity', 'Answer Engine', 'gpt', 1, 'Direct answers first, then key points - precise answer-engine style (no live web access)', 'Answer directly in the first sentence, then give 3-5 short key points. Be precise. Say so if you are unsure.', 'What is the capital of Australia?'],
    ['/api/duckduckgo-ai', 'Quick Answers', 'llama', 1, 'Privacy-first, short and useful answers', 'Give short, useful answers (max 5 sentences).', 'What is DNS?'],
    ['/api/notegpt', 'NoteGPT', 'gpt', 1, 'Turn any text into clean notes, summaries, bullet points or flashcards', 'You turn the user text into clean study notes: a 1-line summary, bullet points, then 3 flashcards (Q/A). Keep the language of the text.', 'Paste any paragraph or topic here']
  ].map(([path, name, model, cost, desc, persona, ex]) => ({ path, category: 'AI', name, cost, isNew: true, desc, params: prompt(ex), run: makeHandler(model, persona) })),
  { path: '/api/ai/chat', hidden: true, cost: 1, run: makeHandler(null) }
];

// ---- AI image generation: returns a direct image link (keyless, via Pollinations) ----
const imageUrl = (p, model) => {
  const q = String(p.prompt ?? p.q ?? '').trim();
  if (!q || q.length > 500) throw new HttpError(400, 'prompt is required (max 500 characters).');
  const size = (v, d) => Math.min(1536, Math.max(256, Number(v) || d));
  const u = new URL('https://image.pollinations.ai/prompt/' + encodeURIComponent(q));
  u.searchParams.set('width', size(p.width, 1024)); u.searchParams.set('height', size(p.height, 1024)); u.searchParams.set('model', model); u.searchParams.set('nologo', 'true');
  if (p.seed) u.searchParams.set('seed', String(p.seed).slice(0, 10));
  return { prompt: q, model, image: u.toString(), note: 'Open the link to see / download the image (it renders on first open, can take ~10-20s).' };
};
const img = (path, name, model, desc) => ({ path, category: 'AI', name, cost: 1, isNew: true, desc, params: [param('prompt', 'a cat astronaut on the moon, digital art', 'What to draw'), param('width', '1024', '256-1536', false), param('height', '1024', '256-1536', false)], run: async (p) => imageUrl(p, model) });
export const images = [
  img('/api/ai/image/flux', 'AI Image (Flux)', 'flux', 'Text to image generator (Flux) - returns a direct image link'),
  img('/api/nanobanana', 'Nano Banana', 'gptimage', 'AI image generator - type any prompt, get a generated image with a direct link')
];

export default [...endpoints, ...images];
