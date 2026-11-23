/* PASIYA FX (light): scroll-reveal for panels. No scroll listeners, no per-frame work. */
(() => {
  'use strict';
  const doc = document;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  // Only elements that are still BELOW the screen get the animation, and each one animates once, then is left alone.
  function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const n = e.target; io.unobserve(n); n.classList.add('fx-in');
      setTimeout(() => n.classList.remove('fx-reveal', 'fx-in'), 700); // free the compositor layer afterwards
    }), { threshold: 0, rootMargin: '0px 0px -6% 0px' });
    let i = 0;
    doc.querySelectorAll('.panel,.analytics-card,.columns>*').forEach((n) => {
      // never hide the API list (very tall on phones) or anything taller than ~1.5 screens: it must always be visible
      if (n.id === 'apis' || n.querySelector('#list') || n.offsetHeight > innerHeight * 1.5) return;
      if (n.closest('[hidden]') || n.getBoundingClientRect().top < innerHeight) return;
      n.style.setProperty('--fx-d', (i++ % 3) * 70 + 'ms'); n.classList.add('fx-reveal'); io.observe(n);
    });
  }

  const start = () => { reveal(); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
