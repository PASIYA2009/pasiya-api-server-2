/* PASIYA FX (light): scroll-reveal for panels + a short splash. No scroll listeners, no per-frame work. */
(() => {
  'use strict';
  const doc = document;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  function splash() {
    if (reduce) return;
    try { if (sessionStorage.getItem('fx_splash')) return; sessionStorage.setItem('fx_splash', '1'); } catch { return; }
    const mark = el('div', 'mark'); mark.append(el('div', 'hex', 'P'), el('b', '', 'PASIYA API'));
    const l = el('div', 'fx-loader'); l.setAttribute('role', 'status'); l.append(mark); doc.body.append(l);
    setTimeout(() => { l.classList.add('out'); setTimeout(() => l.remove(), 450); }, 800);
  }

  // Only elements that are still BELOW the screen get the animation, and each one animates once, then is left alone.
  function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const n = e.target; io.unobserve(n); n.classList.add('fx-in');
      setTimeout(() => n.classList.remove('fx-reveal', 'fx-in'), 700); // free the compositor layer afterwards
    }), { threshold: 0.06 });
    let i = 0;
    doc.querySelectorAll('.panel,.analytics-card,.columns>*').forEach((n) => {
      if (n.closest('[hidden]') || n.getBoundingClientRect().top < innerHeight) return;
      n.style.setProperty('--fx-d', (i++ % 3) * 70 + 'ms'); n.classList.add('fx-reveal'); io.observe(n);
    });
  }

  const start = () => { splash(); reveal(); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
