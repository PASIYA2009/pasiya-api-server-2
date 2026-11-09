/* PASIYA shared shell (same file in the API repo and the OFC repo).
   - theme dots (accent saved in localStorage "pasiya_accent")
   - one menu block + footer for both sites
   - Firebase login state, shared between the portfolio and /api because both run on the same origin
   - cross-origin SSO (e.g. the direct workers.dev URL -> main site) using a short-lived Firebase custom token in the URL #hash
   Page setup: window.PS_ROLE = 'ofc' | 'api' BEFORE this script. Placeholders: [data-ps-dots] [data-ps-sites] [data-ps-account] [data-ps-top] #ps-footer */
(function () {
  'use strict';
  var ROLE = window.PS_ROLE || 'ofc', D = document, H = D.documentElement;
  var FB = { apiKey: 'AIzaSyCPZAmh7zUmU24aRtDvhGKXydh8DCDSaxk', authDomain: 'pasiya-api.firebaseapp.com', projectId: 'pasiya-api', storageBucket: 'pasiya-api.firebasestorage.app', messagingSenderId: '1074532195422', appId: '1:1074532195422:web:3a1f26e066ad5165e3a8cf' };
  var WA = 'https://wa.me/94741500792';
  var SOCIAL = [['WhatsApp', WA, 'wa']]; // add more: ['Telegram', 'https://t.me/yourname', 'tg']
  var LS = { get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var $ = function (s, r) { return (r || D).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || D).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var P = { cfg: {}, user: null, me: null, auth: null, A: null };
  window.PS = P;

  // ---------- icons ----------
  var IC = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>', bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5M9 7h6"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v2M15 13v2M2 14v2M22 14v2"/>', qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7M17 17v4"/>',
    ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    coin: '<circle cx="9" cy="12" r="6"/><path d="M15.5 6.5a6 6 0 010 11"/>', gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M12 8c-2-4-6-3-5 0 .5 1 3 1 5 0zm0 0c2-4 6-3 5 0-.5 1-3 1-5 0z"/>',
    out: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>', palette: '<path d="M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 004-4c0-5-4-9.5-9-9.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    chat: '<path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6A8 8 0 1121 12z"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', pin: '<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>', head: '<path d="M4 14v-2a8 8 0 0116 0v2M4 14a2 2 0 002 2h1v-5H6a2 2 0 00-2 2zM20 14a2 2 0 01-2 2h-1v-5h1a2 2 0 012 2z"/>', hist: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wa: '<path d="M20 12a8 8 0 01-11.8 7L3 20.5l1.6-5A8 8 0 1120 12z"/><path d="M9 9c0 3 3 6 6 6l1.2-1.4-2-1-1 .6c-.8-.4-1.6-1.2-2-2l.6-1-1-2z"/>', tg: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>'
  };
  var ico = function (n) { return '<svg class="ps-ico" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>'; };

  // ---------- theme accent ----------
  var ACCENTS = [['blue', '#3b9cf5', 'Blue'], ['purple', '#a371f7', 'Purple'], ['green', '#14c78a', 'Green'], ['amber', '#f5a524', 'Amber']];
  function setAccent(a) {
    H.dataset.accent = a; LS.set('pasiya_accent', a);
    try { var u = new URL(location.href); u.searchParams.set('pasiya_accent', a); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
    $$('.ps-dot').forEach(function (b) { b.classList.toggle('on', b.dataset.a === a); });
    renderSites(); renderFooter();
  }
  function renderDots() {
    var cur = H.dataset.accent || 'blue';
    $$('[data-ps-dots]').forEach(function (el) {
      el.innerHTML = '<div class="ps-theme"><span>' + ico('palette') + 'Theme</span><div class="ps-dots">' + ACCENTS.map(function (x) { return '<button type="button" class="ps-dot' + (x[0] === cur ? ' on' : '') + '" data-a="' + x[0] + '" style="--c:' + x[1] + '" aria-label="' + x[2] + ' theme"></button>'; }).join('') + '</div></div>';
    });
  }
  D.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.ps-dot'); if (b) setAccent(b.dataset.a); });

  // ---------- where do links go ----------
  // direct = the API worker opened on its own address (workers.dev). Then the other sites live on the OFC domain and need the SSO hand-off.
  function ofcBase() { return String(P.cfg.ofcOrigin || '').replace(/\/+$/, ''); }
  function isDirect() { if (ROLE !== 'api') return false; var o = ofcBase(); return o ? new URL(o).host !== location.host : /\.workers\.dev$/i.test(location.hostname); }
  function link(path) { // returns {href, x} ; x = needs hand-off
    if (ROLE === 'api' && path === '/api') return { href: isDirect() ? '/' : '/api' };
    if (isDirect()) return ofcBase() ? { href: ofcBase() + path, x: 1 } : null;
    return { href: path };
  }
  var NAV = [['home', 'Portfolio', '/'], ['bolt', 'API Dashboard', '/api'], ['book', 'Past Papers', '/pastpapers'], ['bot', 'WhatsApp Bot', '/bot'], ['qr', 'QR Editor', '/qr', 'NEW'], ['ai', 'PASIYA AI', '/ai', 'NEW']];
  function navHtml(list, cls) {
    return list.map(function (n) { var l = link(n[2]); if (!l) return '';
      try { var u = new URL(l.href, location.href); u.searchParams.set('pasiya_accent', H.dataset.accent || 'blue'); l.href = (/^https?:/.test(l.href) ? u.href : (u.pathname + u.search + u.hash)); } catch (e) {}
      return '<a href="' + esc(l.href) + '"' + (l.x ? ' data-ps-x="1"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + ico(n[0]) + '<span>' + esc(n[1]) + '</span>' + (n[3] ? '<em class="ps-tag">' + n[3] + '</em>' : '') + '</a>'; }).join('');
  }
  function accountLinks() { // account pages live in the API dashboard
    var base = isDirect() ? '' : '/api';
    var h = function (hash) { return isDirect() ? '/#' + hash : '/api#' + hash; };
    return [['coin', 'Coin Wallet', h('wallet')], ['gift', 'Daily Rewards', h('rewards')], ['hist', 'Coin History', h('history')], ['user', 'Profile & Keys', h('profile')]];
  }
  function renderSites() {
    $$('[data-ps-sites]').forEach(function (el) {
      var isAdmin = !!(P.me && P.me.role === 'admin');
      var adminHref = ROLE === 'ofc' ? '/#admin-settings' : '/api#admin'; var adminLink = isAdmin ? '<div class="ps-sec">ADMIN</div><nav class="ps-links"><a href="' + adminHref + '">' + ico('term') + '<span>Admin Panel</span></a></nav>' : '';
      var acc = (P.user && ROLE !== 'api') ? '<div class="ps-sec">ACCOUNT</div><nav class="ps-links">' + accountLinks().map(function (n) { return '<a href="' + n[2] + '">' + ico(n[0]) + '<span>' + n[1] + '</span></a>'; }).join('') + '</nav>' : '';
      el.innerHTML = '<div class="ps-sec">PASIYA SITES</div><nav class="ps-links">' + navHtml(NAV) + '</nav>' + acc + adminLink + '<div class="ps-sec">SUPPORT</div><nav class="ps-links"><a href="' + WA + '" target="_blank" rel="noopener">' + ico('head') + '<span>Contact Us</span><em class="ps-tag live">LIVE</em></a></nav>';
    });
  }

  // ---------- login urls ----------
  function loginUrl(kind) {
    if (ROLE === 'api') return '/' + kind;
    var next = location.pathname + location.search; if (!/^\/(?!\/)/.test(next)) next = '/';
    return '/api/' + kind + '?next=' + encodeURIComponent(next);
  }

  // ---------- account card / chip ----------
  function nameOf() { var u = P.user; return (P.me && P.me.username) || (u && (u.displayName || (u.email || '').split('@')[0])) || 'User'; }
  function avatar(big) { var u = P.user, n = nameOf(); return '<span class="ps-av">' + (u && u.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(u.photoURL) + '">' : esc(n.charAt(0).toUpperCase())) + '</span>'; }
  var coins = function () { return P.me && typeof P.me.coins === 'number' ? P.me.coins.toLocaleString('en-US') : '…'; };
  function renderAccount() {
    $$('[data-ps-account]').forEach(function (el) {
      if (P.user) el.innerHTML = '<div class="ps-acct"><div class="ps-user">' + avatar() + '<div><b>' + esc(nameOf()) + '</b><span class="ps-coin">' + ico('coin') + '<span data-ps-coins>' + coins() + '</span></span></div></div></div>';
      else el.innerHTML = '<div class="ps-acct"><div class="row"><a class="ps-btn out" href="' + loginUrl('login') + '">Log in</a><a class="ps-btn main" href="' + loginUrl('register') + '">Register</a></div></div>';
    });
    $$('[data-ps-out]').forEach(function (el) { el.hidden = !P.user; if (!el.dataset.b) { el.dataset.b = 1; el.innerHTML = '<button type="button" class="ps-btn danger full" data-ps-signout>' + ico('out') + 'Sign Out</button>'; } });
    $$('[data-ps-top]').forEach(function (el) {
      el.innerHTML = P.user ? '<a class="ps-chip coins" href="' + (isDirect() ? '/' : '/api') + '#wallet" title="Coin wallet">' + ico('coin') + '<span data-ps-coins>' + coins() + '</span>' + avatar() + '</a>' : '<a class="ps-chip login" href="' + loginUrl('login') + '">Log in</a>';
    });
  }
  D.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-ps-signout]') && P.auth) P.A.signOut(P.auth).then(function () { location.reload(); });
    var a = e.target.closest && e.target.closest('a[data-ps-x]');
    if (a && P.user && P.auth && P.auth.currentUser) { e.preventDefault(); handoff(a.href); }
  });

  // ---------- SSO hand-off (custom token in #hash) ----------
  function handoff(url) {
    P.auth.currentUser.getIdToken().then(function (t) { return fetch('/api/auth/handoff', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); })
      .then(function (r) { return r.json(); }).then(function (d) { if (!d.customToken) throw 0; location.href = url + '#sso=' + encodeURIComponent(d.customToken); })
      .catch(function () { location.href = url; });
  }
  var ssoToken = (location.hash.match(/[#&]sso=([^&]+)/) || [])[1];
  if (ssoToken) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} ssoToken = decodeURIComponent(ssoToken); }
  // drop the one-time ?ps_ok flag (lets the login page return to the portfolio root)
  if (/[?&]ps_ok=1/.test(location.search)) { try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])ps_ok=1&?/, '$1').replace(/[?&]$/, '') + location.hash); } catch (e) {} }

  // ---------- firebase ----------
  function loadMe() {
    if (!P.auth || !P.auth.currentUser) return;
    P.auth.currentUser.getIdToken().then(function (t) { return fetch('/api/me', { headers: { Authorization: 'Bearer ' + t } }); })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { if (m) { P.me = m; renderAccount(); D.dispatchEvent(new CustomEvent('ps:me', { detail: m })); } }).catch(function () {});
  }
  function bootAuth() {
    Promise.all([import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js')]).then(function (m) {
      var A = m[1]; P.A = A; P.auth = A.getAuth(m[0].initializeApp(FB));
      var first = true;
      A.onAuthStateChanged(P.auth, function (u) {
        if (first && !u && ssoToken) { first = false; A.signInWithCustomToken(P.auth, ssoToken).catch(function () { renderAll(); }); ssoToken = null; return; }
        first = false; P.user = u; P.me = null; renderAll(); if (u) loadMe();
        D.dispatchEvent(new CustomEvent('ps:user', { detail: u }));
      });
    }).catch(function () { renderAll(); });
  }

  // ---------- footer ----------
  function renderFooter() {
    var el = $('#ps-footer'); if (!el) return;
    var host = location.host;
    var soc = SOCIAL.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener" aria-label="' + esc(s[0]) + '">' + ico(s[2]) + '</a>'; }).join('');
    var plat = [['bolt', 'Dashboard', '/api'], ['book', 'Past Papers', '/pastpapers'], ['bot', 'WhatsApp Bot', '/bot'], ['qr', 'QR Editor', '/qr'], ['ai', 'PASIYA AI', '/ai']];
    var sup = [['head', 'Contact Us', WA], ['coin', 'Coin Wallet', accountLinks()[0][2]], ['gift', 'Daily Rewards', accountLinks()[1][2]], ['chat', 'Feedback', WA]];
    var foot = function (list) { return list.map(function (n) { var ext = /^https?:/.test(n[2]); var l = ext ? { href: n[2] } : link(n[2]) || { href: n[2] }; return '<a href="' + esc(l.href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + (l.x ? ' data-ps-x="1"' : '') + '><span class="bx">' + ico(n[0]) + '</span>' + esc(n[1]) + '</a>'; }).join(''); };
    el.className = 'ps-footer';
    var showP = !/^\/pastpapers(?:\/|$)/i.test(location.pathname);
    el.innerHTML = '<div class="brand">' + (showP ? '<span class="logo ps-p-logo">P</span>' : '') + '<div><b>' + (ROLE === 'api' ? 'PASIYA <em>API</em>' : 'PASIYA <em>OFC</em>') + '</b><span class="ps-up" id="psUp"><i></i>checking…</span></div></div>' +
      '<p>Pasidu Eshan\'s home for the free PASIYA API, past papers, WhatsApp bot, QR editor and AI tools. One login works everywhere.</p>' +
      '<div class="ps-info"><a href="' + WA + '" target="_blank" rel="noopener"><span class="bx">' + ico('chat') + '</span>WhatsApp support</a><div><span class="bx">' + ico('globe') + '</span>' + esc(host) + '</div><div><span class="bx">' + ico('pin') + '</span>Sri Lanka 🇱🇰</div><div><span class="bx">' + ico('clock') + '</span>24/7 Global Support</div></div>' +
      '<div class="ps-social">' + soc + '</div>' +
      '<div class="ps-cols"><div><h4><span>' + ico('head') + '</span>SUPPORT</h4><nav class="ps-foot-links">' + foot(sup) + '</nav></div></div>' +
      '<div class="ps-copy">© ' + new Date().getFullYear() + ' · Designed &amp; built by <b>Pasidu Eshan</b></div>';
    fetch('/api/health', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { setUp(d && d.ok); }).catch(function () { setUp(false); });
    function setUp(ok) { var u = $('#psUp'); if (!u) return; u.className = 'ps-up' + (ok ? '' : ' warn'); u.innerHTML = '<i></i>' + (ok ? 'All systems online ✓' : 'Status unavailable'); }
  }

  function renderAll() { renderDots(); renderSites(); renderAccount(); }
  function start() {
    var incoming = ''; try { incoming = new URLSearchParams(location.search).get('pasiya_accent') || ''; } catch (e) {}
    var a = incoming || LS.get('pasiya_accent') || 'blue'; H.dataset.accent = a; LS.set('pasiya_accent', a);
    fetch('/api/config').then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) { P.cfg = c || {}; renderAll(); renderFooter(); });
    renderAll(); bootAuth();
  }
  P.setAccent = setAccent; P.render = renderAll;
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
