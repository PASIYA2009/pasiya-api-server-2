/* PASIYA FX: animations for every page + the YouTube quality downloader panel on the dashboard. No dependencies. */
(() => {
  'use strict';
  const doc = document, root = doc.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, props = {}, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); } n.append(...kids); return n; };
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } } };

  /* ---- background + progress bar ---- */
  function backdrop() {
    doc.body.prepend(el('div', { class: 'fx-grid', 'aria-hidden': 'true' }), el('div', { class: 'fx-aurora', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')));
    const bar = el('div', { class: 'fx-progress', 'aria-hidden': 'true' }); doc.body.append(bar);
    let tick = false;
    const upd = () => { tick = false; const h = root.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  /* ---- splash (first page of a browser session only) ---- */
  function splash() {
    if (reduce) return;
    try { if (sessionStorage.getItem('fx_splash')) return; sessionStorage.setItem('fx_splash', '1'); } catch { return; }
    const l = el('div', { class: 'fx-loader', role: 'status', 'aria-label': 'Loading' }, el('div', { class: 'mark' }, el('div', { class: 'hex', text: 'P' }), el('b', { text: 'PASIYA API' }), el('div', { class: 'bar' })));
    doc.body.append(l);
    const done = () => { l.classList.add('out'); setTimeout(() => l.remove(), 600); };
    setTimeout(done, 900); // never blocks the page for longer than this
  }

  /* ---- scroll reveal (also for cards the dashboard renders later) ---- */
  const REV = '.panel,.analytics-card,.auth-card,.card,.columns>*'; // revealed on scroll (NOT the live-refreshing stat / API cards)
  const SEL = REV + ',.stats>*,.api-grid>*';
  function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('fx-in'); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    const seen = new WeakSet();
    const scan = () => {
      let i = 0;
      doc.querySelectorAll(REV).forEach((n) => {
        if (seen.has(n) || n.closest('[hidden]')) return;
        seen.add(n); n.style.setProperty('--fx-d', Math.min(i++, 8) * 60 + 'ms');
        n.classList.add('fx-reveal'); io.observe(n);
      });
    };
    scan();
    let t; new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 120); }).observe(doc.body, { childList: true, subtree: true });
  }

  /* ---- cursor spotlight on cards ---- */
  function spotlight() {
    if (matchMedia('(hover: none)').matches) return;
    doc.addEventListener('pointermove', (e) => {
      const c = e.target.closest?.(SEL + ',.fx-dl-card'); if (!c) return;
      const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px');
    }, { passive: true });
  }

  /* ---- YouTube quality downloader (dashboard only) ---- */
  const fmtSize = (b) => (b ? (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB') : 'size unknown');
  function downloader() {
    const anchor = doc.getElementById('apis'); if (!anchor) return;
    const input = el('input', { type: 'url', placeholder: 'Paste a YouTube link, e.g. https://youtu.be/dQw4w9WgXcQ', 'aria-label': 'YouTube link', autocomplete: 'off' });
    const rights = el('input', { type: 'checkbox', id: 'fxRights' });
    const go = el('button', { class: 'btn primary', type: 'button' }, el('span', { class: 'fx-spin' }), el('span', { text: 'Get download links' }));
    const hint = el('p', { class: 'muted fx-hint', text: 'Gives direct links for 144p, 240p, 360p, 480p, 720p and 1080p, plus audio. Uses 2 coins per call.' });
    const out = el('div', { class: 'fx-result', 'aria-live': 'polite' });
    const panel = el('section', { class: 'panel', id: 'fxDl' },
      el('div', { class: 'eyebrow', text: 'DOWNLOADER' }), el('h2', { text: 'YouTube video downloader' }),
      el('div', { class: 'fx-row' }, input, go),
      el('label', { class: 'fx-rights', for: 'fxRights' }, rights, el('span', { text: 'I own this video or have permission to download it.' })), hint, out);
    anchor.before(panel);

    const say = (msg, bad) => { hint.textContent = msg; hint.style.color = bad ? 'var(--bad,#fb7185)' : ''; };
    const card = (title, sub, badge, ok, url, d) => el('div', { class: 'fx-dl-card', style: '--fx-d:' + d + 'ms' },
      el('div', { class: 'q', text: title }), el('span', { class: 'fx-badge ' + (ok ? 'ok' : 'warn'), text: badge }), el('small', { class: 'muted', text: sub }),
      el('a', { class: 'btn primary', href: url, target: '_blank', rel: 'noopener noreferrer', download: '' }, doc.createTextNode('Download')));

    async function run() {
      const key = store.get('pasiya_key');
      if (!input.value.trim()) return say('Paste a YouTube link first.', true);
      if (!rights.checked) return say('Tick the permission box first.', true);
      if (!key) { say('Sign in (or paste your API key in the API Explorer) first, then try again.', true); return; }
      out.replaceChildren(); go.classList.add('fx-busy'); go.disabled = true; say('Fetching links…');
      try {
        const u = new URL('/api/yt/quality', location.origin); u.searchParams.set('url', input.value.trim()); u.searchParams.set('rightsConfirmed', 'true');
        const r = await fetch(u, { headers: { 'X-API-Key': key } }); const d = await r.json().catch(() => ({}));
        if (!r.ok || d.success === false) throw new Error(d.error || 'Request failed (HTTP ' + r.status + ').');
        const x = d.data || d.result || d; const list = x.qualities || [];
        if (!list.length) throw new Error('No qualities came back for this video.');
        out.append(el('div', { class: 'fx-meta' }, ...(x.thumbnail ? [el('img', { src: x.thumbnail, alt: '', loading: 'lazy' })] : []), el('div', {}, el('b', { text: x.title || 'YouTube video' }), el('small', { class: 'muted', text: list.length + ' qualities found' }))));
        const grid = el('div', { class: 'fx-qgrid' });
        list.forEach((q, i) => grid.append(card(q.quality, fmtSize(q.filesize) + (q.fps ? ' · ' + q.fps + ' fps' : ''), q.hasAudio ? 'with sound' : 'video only', q.hasAudio, q.url, i * 70)));
        if (x.audio?.url) grid.append(card('Audio', fmtSize(x.audio.filesize) + ' · m4a', 'audio only', true, x.audio.url, list.length * 70));
        out.append(grid);
        if (list.some((q) => !q.hasAudio)) out.append(el('p', { class: 'muted', text: '“Video only” files have no sound (YouTube splits HD this way). Download the Audio file too and merge them with ffmpeg, or use a 360p / 720p “with sound” row.' }));
        say(x.unavailable?.length ? 'Not available for this video: ' + x.unavailable.join(', ') + '.' : 'Done. Links expire after a few hours, so download soon.');
      } catch (e) { say(e.message, true); }
      go.classList.remove('fx-busy'); go.disabled = false;
    }
    go.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  }

  const start = () => { backdrop(); splash(); reveal(); spotlight(); downloader(); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
