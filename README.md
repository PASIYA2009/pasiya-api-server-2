# PASIYA API (Cloudflare Workers + Static Assets)

```
worker.js                      ← Cloudflare Worker entry point
wrangler.jsonc                 ← Worker + public/ static assets configuration
public/index.html              ← dashboard (served at "/")
system/                        ← the PLATFORM (no scraping here)
  util.js  db.js  gateway.js  account.js  status.js  registry.js
scrapers/                      ← one file per site / service
  youtube  facebook  tiktok  instagram  mediafire  gdrive  catbox
  news  weather  tv  ai  download      (+ _web.js = shared helpers)
```

## Add a new scraper
1. Create `scrapers/mysite.js` and `export default [{ path, category, name, cost, desc, params, run }]`
2. Add one `import` + put it in the `ALL` list in `system/registry.js`. Docs, "Test" forms, coin charging and rate limits are automatic.

## Deploy on Cloudflare Workers
1. Put this folder at the root of a GitHub repository.
2. Install Node.js 22+ and run `npm install`.
3. Configure required non-secret variables in `wrangler.jsonc` under `vars`: `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `ADMIN_EMAIL`, and optionally `PLATFORM_START`.
4. Add credentials as Worker secrets (never commit them): `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON`. Add `GEMINI_API_KEY`, `GROQ_API_KEY`, and `APIFY_TOKEN` the same way if used.
5. Run `npm run deploy`. The dashboard is served from `public/`; `/api/*` is handled by the Worker.
6. Firebase Console → Authentication → Settings → Authorized domains → add your `*.workers.dev` domain.
7. Check `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/health`.

`wrangler.jsonc` enables `nodejs_compat` for the few Node-compatible APIs used by scrapers. Cloudflare does not expose per-isolate CPU/RAM metrics, so those status fields are unavailable.

Tests: `node test/run.mjs` (offline, mocked sites, no install needed).

## Cloudflare runtime notes
- The API runs as a Cloudflare Worker and serves the dashboard with Workers Static Assets.
- Cloudflare Workers AI binding → REST (`CF_ACCOUNT_ID` + `CF_API_TOKEN`, free). Without it, set any of Gemini / OpenRouter / Groq / DeepSeek keys.
- Cache and rate-limit are per server instance memory (Cloudflare Cache API doesn't exist on Cloudflare Workers). Fine for this size; use Upstash/Cloudflare Workers KV later if you need global limits.
- **No keys needed now:** AI falls back to the free public Pollinations service; video downloads (YouTube / TikTok / Facebook / Instagram) return direct links from the platforms' public data. Real keys, when set, are tried first.
- Downloads are best effort (sites change; YouTube may refuse Cloudflare Workers's datacenter IPs). For maximum reliability host the separate yt-dlp service (`pasiya-scraper-api`) and set `SCRAPER_URL` + `SCRAPER_SHARED_SECRET`: it then answers the download endpoints instead.
- `maxDuration` is 30s in `vercel.json` (Hobby allows up to 60).

## v4.2
- **Social APIs work with no key:** YouTube search + comments, Reddit search, TikTok profile, Instagram profile / posts / reels, X profile tweets and Facebook page now use free public data first (Apify is only a backup when `APIFY_TOKEN` is set). TikTok search / hashtag / comments now use the free tikwm.com public API, and X search, Instagram hashtag and Facebook posts use Bing / DuckDuckGo (`site:` search, public indexed posts only). Instagram Comments was removed (no free source exists). YouTube and Reddit also fall back to public Piped / Invidious / PullPush mirrors when blocked. Instagram / X / TikTok sometimes refuse datacenter IPs; the admin *Run health check* shows which ones work on your Cloudflare Workers.
- **Music:** the 5 built-in songs are removed. The default is now one song (`https://youtu.be/-LDyd-Cba0A`). **Admin Panel > Background music**: paste any YouTube link + *Add song*, or *Remove* a song. Saved in Firestore `settings/music`; public list at `GET /api/music`; visitors pick up changes within ~30 s.

- **Removed (feeds were dead):** Tech (SL) TecRoom, Roar, TechKatha, Android Wedakarayo and News: Live @ SL.
- **Social fallbacks:** when Reddit / X / Instagram / TikTok refuse the Cloudflare Workers server (403 / 429), every Social API now falls back to a Bing / DuckDuckGo `site:` search (title + link + snippet of public posts) instead of failing.
- **Real test links:** the example links in the API docs / health check are now real public ones (TikTok `@scout2015`, Instagram `/p/fA9uwTtkSN/`, Facebook video, Pinterest pin, X `jack/status/20`) instead of fake ids. APIs that need your own file link or mailbox id (MediaFire, Google Drive, Pixeldrain, Tempmail mailbox / message) show *Not tested* in the health check.
- Reddit and X Profile also try public relay services (allorigins / r.jina.ai) when the server is blocked.
- **Status:** two new cards, **RAM** (memory used out of the function's limit) and **CPU** (% used + cores + load) of the server instance answering the request. They refresh with the other status cards.

## v4.1
- **Tempmail:** Guerrilla Mail is now tried first (mail.tm / mail.gw as backup). Same 3 endpoints, same `id` flow; an expired Guerrilla session is rebuilt automatically.
- **Switched-off APIs vanish for users:** the catalog is no longer cached, the server flag cache is 8 s, and the dashboard re-reads the API list every 30 s (and when the tab opens), so users no longer need to reload. A failed refresh keeps the current list.
- **Fix:** Admin > API manager: switching an API on/off no longer scrolls the page to the bottom (the list is no longer rebuilt on a toggle; scroll positions are kept when it is).
- **AI:** 9 more providers from free-ai-apis (Hugging Face, SambaNova, Together, Fireworks, DeepInfra, Hyperbolic, Novita, Cohere, AIML) join every model chain when their key is set. New: `/api/ai/translate` (keyless), `/api/ai/search` (Tavily key).
- **Social:** 16 `/api/social/*` endpoints (TikTok, Instagram, X, YouTube, Facebook, Reddit) powered by Apify actors from social-media-apis. Appear only when `APIFY_TOKEN` is set.

## v4.0 (fix release)
- **AI:** official-provider chain now also has Cerebras, Mistral, GitHub Models and Anthropic; Pollinations is last and its 45 s limit is remembered (no more 14 s timeouts). Set free keys (see `.env.example`). chatgpt.com / claude.ai themselves have no public API, so they are NOT scraped: official free APIs are the reliable way.
- **News:** each site tries its own feed + common alternate paths, then Google News (Sinhala + English, 7 days), then Bing News.
- **Web Search:** Brave (key) -> Bing RSS -> DuckDuckGo. **Tempmail:** mail.tm with mail.gw fallback. **YouTube DL:** 3 app clients + optional cobalt (`COBALT_API_URL`).
- Health check timeout 25 s. Tests: `node test/run.mjs` and `node test/fixes.mjs`.
- "NEEDS REAL INPUT" is normal: the example link in the test is fake, so that API is not proven broken.

## v3.9
- **Admin Panel > Feature switches:** turn the Daily claim and the Lucky Spin on/off for everyone (stored in Firestore `settings/features`). They are shown ONLY to signed-in normal users: guests and admins never see them (the server blocks them too).
- **Admin Panel > API manager:** *Run health check* tests every API from the live server (Cloudflare Workers) in small batches; *Switch off failed* hides the broken ones from the catalog (they answer 503). Every API also has its own on/off switch. Admins can still test switched-off APIs.
- **Removed:** `/api/thenux-ai`, `/api/twitter_v2`.
- **New:** `/api/video/hd` (best-quality links + every quality, with the "send as Document, not as Status" WhatsApp tip), `/api/tools/qr`, `/api/tools/ip`.
- **Mobile:** the menu is now a hamburger button (top right) that slides a drawer in from the right. Smaller logo + name in the bar.
- **Music:** 5 background songs with Play/Pause, Next and Previous in the menu. Browsers only allow sound after the first tap or click, so autoplay starts on the first touch. Pausing is remembered on that device.
- Not built on purpose: sinhalasub.lk (full movies / episodes = piracy), same rule as the other pirated sites below.

## v3.4: 14 more AI endpoints (ChatGPT, DeepSeek, Gemma, Kimi, GLM, MiniMax, Coder, BlackBox, Answer Engine, Quick Answers, NoteGPT, Sinhala Assistant, Flux image, Nano Banana). Model ids can be overridden with MODEL_* env vars.

## v3.5: scrapers/more_dl.js adds YouTube MP4/MP3/Thumbnail DL, TikTok/Facebook/Instagram/Pinterest DL, Twitter (X) video, Pixeldrain, Spotify info.

## v3.3 changes
- **Key system stays:** every API needs the user's PASIYA key (dashboard shows it). "Keyless" now only means the APIs use public sources and need **no third-party keys**. `ALLOW_KEYLESS=1` (optional) lets anonymous callers use free APIs.
- **Admin fix:** `ADMIN_EMAIL` is trimmed, case-insensitive, accepts a comma list, ignores Gmail dots/+tags. Admin also needs a *verified* e-mail (Google login is always verified). `/api/config` shows `adminConfigured`.
- **Pages:** `/login` (username or e-mail, Google) and `/register` (username, e-mail, confirm password, `SIGNUP_COINS` bonus). No GitHub, no Cloudflare check.
- **Endpoints:** `scrapers/newsfeeds.js` (36 news sites + all-in-one), `search.js`, `utility.js`, `extras.js` (F-Droid APK, Internet Archive music, TikTok public avatar, Wikimedia live wallpapers, Web2Zip).
- **Status:** the dashboard now has a **USERS** card (registered accounts, cached 60 s).
- Not built on purpose: WhatsApp channel reacts (spam / engagement faking), WhatsApp DP saver (privacy), pirated APK / MP3 sites.
