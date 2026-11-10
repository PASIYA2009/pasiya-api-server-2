/* PASIYA shared shell v2 - the SAME file runs on every site (OFC, API, QR, AI, Past Papers, Bot).
   It builds: animated background, top bar (P logo + site name + site tabs + Sri Lanka live time + account),
   left menu drawer (account, admin, this-page links, all sites, music player, colour dots, sign out) and the footer.
   - colour: saved in localStorage "pasiya_accent" (shared by all sites on the same domain)
   - music : one playlist (/api/music), position saved every second so the next page continues the same song
   - login : Firebase auth shared on the same domain, plus a cross-domain hand-off for the direct workers.dev address
   Page setup (optional): window.PS_ROLE = 'ofc'|'api'|'qr'|'ai'|'papers'|'bot' BEFORE this script (auto-detected from the path otherwise).
   A page can hand its own menu links to the drawer: <div data-ps-page hidden> ...links... </div> */
(function () {
  'use strict';
  if (window.__psShell) return; window.__psShell = 1;
  var D = document, H = D.documentElement;

  var SITES = [
    { k: 'ofc', n: 'Pasiya OFC', t: 'OFC', p: '/', ic: 'home', sub: 'Portfolio' },
    { k: 'api', n: 'Pasiya API', t: 'API', p: '/api', ic: 'bolt', sub: 'Developer platform' },
    { k: 'qr', n: 'Pasiya QR', t: 'QR', p: '/qr', ic: 'qr', sub: 'QR editor', tag: 'NEW' },
    { k: 'ai', n: 'Pasiya AI', t: 'AI', p: '/ai', ic: 'ai', sub: 'Chat, image, video', tag: 'NEW' },
    { k: 'papers', n: 'Pasiya Papers', t: 'Past Papers', p: '/pastpapers', ic: 'book', sub: 'Past papers' },
    { k: 'bot', n: 'Pasiya Bot', t: 'Bot', p: '/bot', ic: 'bot', sub: 'WhatsApp bot' }
  ];
  function detectRole() {
    var p = location.pathname;
    if (/^\/api(\/|$)/.test(p)) return 'api';
    if (/^\/qr(\/|$)/.test(p)) return 'qr';
    if (/^\/ai(\/|$)/.test(p)) return 'ai';
    if (/^\/pastpapers(\/|$)/.test(p)) return 'papers';
    if (/^\/bot(\/|$)/.test(p)) return 'bot';
    return /\.workers\.dev$/i.test(location.hostname) ? 'api' : 'ofc';
  }
  var ROLE = window.PS_ROLE || detectRole();
  var SITE = SITES.filter(function (s) { return s.k === ROLE; })[0] || SITES[0];

  var FB = { apiKey: 'AIzaSyCPZAmh7zUmU24aRtDvhGKXydh8DCDSaxk', authDomain: 'pasiya-api.firebaseapp.com', projectId: 'pasiya-api', storageBucket: 'pasiya-api.firebasestorage.app', messagingSenderId: '1074532195422', appId: '1:1074532195422:web:3a1f26e066ad5165e3a8cf' };
  var WA = 'https://wa.me/94741500792';
  var SOCIAL = [['WhatsApp', WA, 'wa']]; // add more: ['Telegram', 'https://t.me/yourname', 'tg']
  var LS = { get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var $ = function (s, r) { return (r || D).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || D).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var P = { cfg: {}, user: null, me: null, auth: null, A: null, role: ROLE };
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
    wa: '<path d="M20 12a8 8 0 01-11.8 7L3 20.5l1.6-5A8 8 0 1120 12z"/><path d="M9 9c0 3 3 6 6 6l1.2-1.4-2-1-1 .6c-.8-.4-1.6-1.2-2-2l.6-1-1-2z"/>', tg: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'
  };
  var ico = function (n) { return '<svg class="ps-ico" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>'; };
  var PLAY_I = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>', PAUSE_I = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  function logo(id) { return '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--b)"/></linearGradient></defs><path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill="#0b1220" stroke="url(#' + id + ')" stroke-width="3"/><path d="M24 46V19h12a8.5 8.5 0 010 17H24" fill="none" stroke="url(#' + id + ')" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }

  // ---------- theme accent (shared by every site) ----------
  var ACCENTS = [['blue', '#3b9cf5', 'Blue'], ['purple', '#a371f7', 'Purple'], ['green', '#14c78a', 'Green'], ['amber', '#f5a524', 'Amber'], ['red', '#f04b5b', 'Red'], ['pink', '#ec4899', 'Pink'], ['cyan', '#22d3ee', 'Cyan'], ['lime', '#84cc16', 'Lime']];
  var ACC_IDS = ACCENTS.map(function (x) { return x[0]; });
  // admin default colour (Admin Panel > Default theme): used ONLY while the visitor has not picked a colour themselves
  function applyDefaultAccent(a) {
    if (ACC_IDS.indexOf(a) < 0) return;
    LS.set('pasiya_def_accent', a);
    if (LS.get('pasiya_accent')) return; // the visitor's own choice always wins
    if (H.dataset.accent !== a) { H.dataset.accent = a; renderDots(); D.dispatchEvent(new CustomEvent('ps:accent', { detail: a })); }
  }
  function loadDefaultAccent() { fetch('/api/theme', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { if (d && d.accent) applyDefaultAccent(d.accent); }).catch(function () {}); }
  function setAccent(a) {
    H.dataset.accent = a; LS.set('pasiya_accent', a);
    $$('.ps-dot').forEach(function (b) { b.classList.toggle('on', b.dataset.a === a); });
    D.dispatchEvent(new CustomEvent('ps:accent', { detail: a }));
  }
  function renderDots() {
    var cur = H.dataset.accent || 'blue';
    $$('[data-ps-dots]').forEach(function (el) {
      el.innerHTML = '<div class="ps-theme"><span>' + ico('palette') + 'Theme</span><div class="ps-dots">' + ACCENTS.map(function (x) { return '<button type="button" class="ps-dot' + (x[0] === cur ? ' on' : '') + '" data-a="' + x[0] + '" style="--c:' + x[1] + '" aria-label="' + x[2] + ' theme"></button>'; }).join('') + '</div></div>';
    });
  }
  D.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.ps-dot'); if (b) setAccent(b.dataset.a); });
  // another tab / site page changed the colour -> follow it
  addEventListener('storage', function (e) {
    if (e.key === 'pasiya_accent' && e.newValue && e.newValue !== H.dataset.accent) { H.dataset.accent = e.newValue; renderDots(); D.dispatchEvent(new CustomEvent('ps:accent', { detail: e.newValue })); }
  });

  // browser tab icon follows the chosen colour
  function updateFavicon() {
    try {
      var cs = getComputedStyle(H), a = cs.getPropertyValue('--a').trim(), b = cs.getPropertyValue('--b').trim(); if (!a || !b) return;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs><path d="M32 4.5 55.5 18v28L32 59.5 8.5 46V18z" fill="#061218" stroke="url(#g)" stroke-width="4.5" stroke-linejoin="round"/><path d="M26.5 44.5v-25h8.5a7.6 7.6 0 0 1 0 15.2h-8.5" fill="none" stroke="url(#g)" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var l = $('link#psFav') || D.createElement('link'); l.id = 'psFav'; l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
      if (!l.parentNode) D.head.appendChild(l);
    } catch (e) {}
  }
  D.addEventListener('ps:accent', updateFavicon);

  // ---------- where do links go ----------
  // direct = the API worker opened on its own address (workers.dev). Then the other sites live on the OFC domain and need the SSO hand-off.
  function ofcBase() { return String(P.cfg.ofcOrigin || '').replace(/\/+$/, ''); }
  function isDirect() { if (ROLE !== 'api') return false; var o = ofcBase(); return o ? new URL(o).host !== location.host : /\.workers\.dev$/i.test(location.hostname); }
  function link(path) { // returns {href, x} ; x = needs hand-off
    if (ROLE === 'api' && path === '/api') return { href: isDirect() ? '/' : '/api' };
    if (isDirect()) return ofcBase() ? { href: ofcBase() + path, x: 1 } : null;
    return { href: path };
  }
  function accountHash(h) { return isDirect() ? '/#' + h : '/api#' + h; }

  function renderSites() {
    $$('[data-ps-sites]').forEach(function (el) {
      el.innerHTML = '<div class="ps-sec">PASIYA SITES</div><nav class="ps-links">' + SITES.map(function (s) {
        var l = link(s.p); if (!l) return '';
        return '<a href="' + esc(l.href) + '"' + (l.x ? ' data-ps-x="1"' : '') + (s.k === ROLE ? ' class="on" aria-current="page"' : '') + '>' + ico(s.ic) + '<span>' + esc(s.n) + '</span>' + (s.tag ? '<em class="ps-tag">' + s.tag + '</em>' : '') + '</a>';
      }).join('') + '</nav>';
    });
    $$('[data-ps-tabs]').forEach(function (el) {
      el.innerHTML = SITES.map(function (s) { var l = link(s.p); if (!l) return ''; return '<a href="' + esc(l.href) + '"' + (l.x ? ' data-ps-x="1"' : '') + (s.k === ROLE ? ' class="on" aria-current="page"' : '') + '>' + esc(s.t) + '</a>'; }).join('');
    });
    $$('[data-ps-brandlink]').forEach(function (a) { var l = link('/'); a.setAttribute('href', ROLE === 'ofc' ? '#home' : (l ? l.href : '/')); if (l && l.x) a.dataset.psX = '1'; });
  }
  function renderAdmin() {
    $$('[data-ps-admin]').forEach(function (el) {
      var adm = P.me && P.me.role === 'admin';
      // the API page already owns an "Admin Panel" item in its own menu links
      if (!adm || ROLE === 'api') { el.innerHTML = ''; return; }
      var l = accountHash('admin');
      el.innerHTML = '<div class="ps-sec">ADMIN</div><nav class="ps-links"><a href="' + l + '">' + ico('shield') + '<span>Admin Panel</span><em class="ps-tag adm">ADMIN</em></a></nav>';
    });
  }
  function renderAccountLinks() {
    $$('[data-ps-acctlinks]').forEach(function (el) {
      if (!P.user || ROLE === 'api') { el.innerHTML = ''; return; }
      el.innerHTML = '<div class="ps-sec">ACCOUNT</div><nav class="ps-links">' + [['coin', 'Coin Wallet', 'wallet'], ['gift', 'Daily Rewards', 'rewards'], ['hist', 'Coin History', 'history'], ['user', 'Profile & Keys', 'profile']].map(function (n) { return '<a href="' + accountHash(n[2]) + '">' + ico(n[0]) + '<span>' + n[1] + '</span></a>'; }).join('') + '</nav>';
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
  function avatar() { var u = P.user, n = nameOf(); return '<span class="ps-av">' + (u && u.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(u.photoURL) + '">' : esc(n.charAt(0).toUpperCase())) + '</span>'; }
  var isAdmin = function () { return !!(P.me && P.me.role === 'admin'); };
  var coins = function () { return isAdmin() ? '\u221e' : (P.me && typeof P.me.coins === 'number' ? P.me.coins.toLocaleString('en-US') : '\u2026'); };
  function renderAccount() {
    $$('[data-ps-account]').forEach(function (el) {
      if (P.user) el.innerHTML = '<div class="ps-acct"><div class="ps-user">' + avatar() + '<div><b>' + esc(nameOf()) + (isAdmin() ? '<span class="ps-role">ADMIN</span>' : '') + '</b><span class="ps-coin">' + ico('coin') + '<span data-ps-coins>' + coins() + '</span></span></div></div></div>';
      else el.innerHTML = '<div class="ps-acct"><div class="row"><a class="ps-btn out" href="' + loginUrl('login') + '">Log in</a><a class="ps-btn main" href="' + loginUrl('register') + '">Register</a></div></div>';
    });
    $$('[data-ps-out]').forEach(function (el) { el.hidden = !P.user; if (!el.dataset.b) { el.dataset.b = 1; el.innerHTML = '<div class="ps-sec"></div><button type="button" class="ps-btn danger full" data-ps-signout>' + ico('out') + 'Sign Out</button>'; } });
    $$('[data-ps-top]').forEach(function (el) {
      el.innerHTML = P.user ? '<a class="ps-chip coins" href="' + accountHash('wallet') + '" title="Coin wallet">' + ico('coin') + '<span data-ps-coins>' + coins() + '</span>' + avatar() + '</a>' : '<a class="ps-chip login" href="' + loginUrl('login') + '">Log in</a>';
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
  if (/[?&]ps_ok=1/.test(location.search)) { try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])ps_ok=1&?/, '$1').replace(/[?&]$/, '') + location.hash); } catch (e) {} }

  // ---------- firebase ----------
  function loadMe() {
    if (!P.auth || !P.auth.currentUser) return;
    P.auth.currentUser.getIdToken().then(function (t) { return fetch('/api/me', { headers: { Authorization: 'Bearer ' + t } }); })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { if (m) { P.me = m; renderAll(); D.dispatchEvent(new CustomEvent('ps:me', { detail: m })); } }).catch(function () {});
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

  // ====================================================================================
  //  TOP BAR + LEFT DRAWER
  // ====================================================================================
  var bar, drawer, back, lastFocus;
  function buildChrome() {
    if (D.getElementById('psb')) return;
    var b = D.body;
    b.classList.add('ps-hasbar');
    bar = D.createElement('header'); bar.className = 'psb'; bar.id = 'psb';
    bar.innerHTML =
      '<button type="button" class="psb-menu" id="psMenuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="psd">' + ico('menu') + '</button>' +
      '<a class="psb-brand" data-ps-brandlink href="/" aria-label="' + esc(SITE.n) + '">' + '<span class="psb-logo">' + logo('psLgBar') + '</span><span><b>' + esc(SITE.n.toUpperCase()) + '</b><small>by Pasidu Eshan</small></span></a>' +
      '<nav class="psb-tabs" data-ps-tabs aria-label="Pasiya sites"></nav>' +
      '<div class="psb-right"><div class="psb-time" id="psTime" aria-label="Sri Lanka time"><span class="d"></span><span class="t"></span></div>' +
      '<button type="button" class="psb-music" id="psMusicBtn" aria-label="Play music" title="Music">' + ico('note') + '</button>' +
      '<span class="psb-acct" data-ps-top></span></div>';
    back = D.createElement('div'); back.className = 'psd-back'; back.id = 'psdBack';
    drawer = D.createElement('aside'); drawer.className = 'psd'; drawer.id = 'psd'; drawer.setAttribute('aria-label', 'Main menu'); drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML =
      '<div class="psd-head"><div><small>' + esc(SITE.n.toUpperCase()) + '</small><strong>Menu</strong></div><button type="button" class="psd-close" id="psdClose" aria-label="Close menu">' + ico('x') + '</button></div>' +
      '<div data-ps-account></div><div data-ps-admin></div><div data-ps-pagehost></div><div data-ps-acctlinks></div><div data-ps-sites></div>' +
      '<div class="ps-sec">MUSIC</div>' +
      '<div class="psp" id="psPlayer"><div class="psp-art" id="psArt" aria-hidden="true">' + ico('note') + '</div><div class="psp-info"><b id="psTitle">Music</b><small id="psSub">Loading\u2026</small></div>' +
      '<div class="psp-ctl"><button type="button" id="psPrev" aria-label="Previous song"><svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9.500 12z"/></svg></button><button type="button" id="psPlay" class="main" aria-label="Play music"></button><button type="button" id="psNext" aria-label="Next song"><svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l10.500-7z"/></svg></button></div></div>' +
      '<div data-ps-dots></div><div data-ps-out hidden></div>';
    b.insertBefore(drawer, b.firstChild); b.insertBefore(back, b.firstChild); b.insertBefore(bar, b.firstChild);

    // the page can hand over its own menu links (e.g. the API sections / the portfolio sections)
    var slot = $('[data-ps-page]');
    if (slot) { slot.hidden = false; $('[data-ps-pagehost]', drawer).appendChild(slot); }

    $('#psMenuBtn').addEventListener('click', function () { openMenu(true); });
    $('#psdClose').addEventListener('click', function () { openMenu(false); });
    back.addEventListener('click', function () { openMenu(false); });
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape') openMenu(false); });
    drawer.addEventListener('click', function (e) { var a = e.target.closest('a[href],.nav,[data-go]'); if (a && !a.matches('[data-ps-x]')) setTimeout(function () { openMenu(false); }, 60); });
    D.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-ps-x]')) openMenu(false); });
    P.closeMenu = function () { openMenu(false); };
  }
  function openMenu(on) {
    if (!drawer) return;
    if (on) lastFocus = D.activeElement;
    drawer.classList.toggle('open', on); back.classList.toggle('open', on); H.classList.toggle('ps-lock', on);
    drawer.setAttribute('aria-hidden', String(!on)); $('#psMenuBtn').setAttribute('aria-expanded', String(on));
    if (on) { setTimeout(function () { var c = $('#psdClose'); if (c) c.focus(); }, 60); } else if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} lastFocus = null; }
  }
  // Sri Lanka live time
  var fmtD, fmtT;
  function tick() {
    var el = $('#psTime'); if (!el) return;
    try {
      fmtD = fmtD || new Intl.DateTimeFormat('en-LK', { timeZone: 'Asia/Colombo', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      fmtT = fmtT || new Intl.DateTimeFormat('en-LK', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      var n = new Date(); el.querySelector('.d').textContent = fmtD.format(n); el.querySelector('.t').textContent = fmtT.format(n);
    } catch (e) {}
  }
  // third-party sites (Past Papers / Bot) have their own fixed headers at top:0 -> push them under our bar
  function fixTops() {
    if (!bar || ROLE === 'ofc' || ROLE === 'api' || ROLE === 'qr' || ROLE === 'ai') return;
    var h = bar.offsetHeight || 60, list = D.body.querySelectorAll('body *'), n = Math.min(list.length, 2500);
    for (var i = 0; i < n; i++) {
      var el = list[i]; if (el.closest && el.closest('.psb,.psd,.psd-back,.ps-loader,#ps-footer,#ytWrap')) continue;
      if (el.dataset && el.dataset.psOffset) continue;
      var cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && parseFloat(cs.top) === 0 && el.offsetHeight && el.offsetHeight < 260 && el.offsetWidth > innerWidth * 0.5) { el.style.setProperty('top', h + 'px', 'important'); el.dataset.psOffset = '1'; }
    }
  }

  // ====================================================================================
  //  MUSIC (one playlist for every site; the song + position survive page changes)
  // ====================================================================================
  var TRACKS = [{ id: '-LDyd-Cba0A', title: '' }];
  var M = { yt: null, i: 0, want: LS.get('pasiya_music') !== 'off', playing: false, ready: false, blocked: false, fails: 0, titles: {}, loaded: false, tab: Math.random().toString(36).slice(2), start: 0 };
  var trackName = function () { return M.titles[(TRACKS[M.i] || {}).id] || (TRACKS[M.i] || {}).title || (M.ready ? 'Song ' + (M.i + 1) : 'Music'); };
  function plRender() {
    var set = function (id, f) { var e = D.getElementById(id); if (e) f(e); };
    set('psTitle', function (e) { e.textContent = trackName(); });
    set('psSub', function (e) { e.textContent = !M.ready ? 'Loading\u2026' : !TRACKS.length ? 'No songs added' : M.fails >= TRACKS.length ? 'Songs unavailable' : M.playing ? 'Playing \u00b7 ' + (M.i + 1) + ' / ' + TRACKS.length : M.want && M.blocked ? 'Tap anywhere to start' : 'Paused \u00b7 ' + (M.i + 1) + ' / ' + TRACKS.length; });
    set('psPlay', function (e) { e.innerHTML = M.playing ? PAUSE_I : PLAY_I; e.setAttribute('aria-label', M.playing ? 'Pause music' : 'Play music'); });
    set('psArt', function (e) { e.classList.toggle('on', M.playing); });
    set('psMusicBtn', function (e) { e.classList.toggle('on', M.playing); e.setAttribute('aria-label', M.playing ? 'Pause music' : 'Play music'); });
  }
  var plWant = function (on) { M.want = on; LS.set('pasiya_music', on ? 'on' : 'off'); };
  function plSave() {
    if (!M.yt || !M.ready || !TRACKS[M.i]) return;
    try { LS.set('pasiya_mpos', JSON.stringify({ id: TRACKS[M.i].id, t: M.yt.getCurrentTime() || 0, at: Date.now(), p: M.playing ? 1 : 0 })); } catch (e) {}
  }
  function plGo(i, play) {
    if (play === undefined) play = true; if (!TRACKS.length) return;
    M.i = (i + TRACKS.length) % TRACKS.length; LS.set('pasiya_track', TRACKS[M.i].id); LS.set('pasiya_mpos', JSON.stringify({ id: TRACKS[M.i].id, t: 0, at: Date.now(), p: play ? 1 : 0 }));
    if (M.yt && M.yt.loadVideoById) { try { play ? M.yt.loadVideoById(TRACKS[M.i].id) : M.yt.cueVideoById(TRACKS[M.i].id); } catch (e) {} }
    plRender();
  }
  function plToggle() {
    if (!M.ready || !TRACKS.length) return;
    if (M.playing) { plWant(false); try { M.yt.pauseVideo(); } catch (e) {} } else { plWant(true); LS.set('pasiya_owner', M.tab); try { M.yt.playVideo(); } catch (e) {} }
  }
  function applyTracks(list) {
    var cur = (TRACKS[M.i] || {}).id, same = JSON.stringify(list.map(function (t) { return t.id; })) === JSON.stringify(TRACKS.map(function (t) { return t.id; }));
    TRACKS = list; list.forEach(function (t) { if (t.title && !M.titles[t.id]) M.titles[t.id] = t.title; });
    if (same) { plRender(); return; }
    var keep = list.findIndex(function (t) { return t.id === cur; });
    if (keep >= 0) { M.i = keep; plRender(); return; }
    var saved = list.findIndex(function (t) { return t.id === LS.get('pasiya_track'); });
    M.i = M.loaded ? 0 : Math.max(saved, 0); M.fails = 0;
    if (!list.length) { try { M.yt && M.yt.stopVideo(); } catch (e) {} M.playing = false; plRender(); return; }
    if (M.yt && M.yt.loadVideoById) { try { M.want && M.loaded ? M.yt.loadVideoById(list[M.i].id) : M.yt.cueVideoById(list[M.i].id); } catch (e) {} }
    plRender();
  }
  function loadMusic() {
    return fetch('/api/music', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { if (d && Array.isArray(d.tracks)) applyTracks(d.tracks); }).catch(function () {}).then(function () {
      var first = !M.loaded; M.loaded = true;
      if (first) { // continue the same song at the same place if the previous page was playing a moment ago
        try {
          var s = JSON.parse(LS.get('pasiya_mpos') || 'null'), ix = s ? TRACKS.findIndex(function (t) { return t.id === s.id; }) : -1;
          if (ix >= 0) { M.i = ix; M.start = (s.p && Date.now() - s.at < 20000) ? Math.max(0, Math.floor(s.t + (Date.now() - s.at) / 1000)) : 0; }
        } catch (e) {}
      }
      if (M.pendingInit) { M.pendingInit(); M.pendingInit = null; }
    });
  }
  function initPlayer() {
    if (!D.getElementById('ytWrap')) { var w = D.createElement('div'); w.id = 'ytWrap'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = '<div id="ytHost"></div>'; D.body.appendChild(w); }
    M.yt = new YT.Player('ytHost', { width: 200, height: 200, videoId: (TRACKS[M.i] || {}).id, playerVars: { autoplay: M.want ? 1 : 0, controls: 0, playsinline: 1, rel: 0, disablekb: 1, fs: 0, start: M.start || 0, origin: location.origin }, events: {
      onReady: function () { M.ready = true; if (M.want && TRACKS.length) { try { M.yt.playVideo(); } catch (e) {} setTimeout(function () { if (!M.playing && M.want) { M.blocked = true; plRender(); } }, 2000); } plRender(); },
      onAutoplayBlocked: function () { M.blocked = true; plRender(); },
      onStateChange: function (e) {
        if (e.data === 1) { M.playing = true; M.blocked = false; M.fails = 0; LS.set('pasiya_owner', M.tab); try { var t = M.yt.getVideoData().title; if (t && TRACKS[M.i]) M.titles[TRACKS[M.i].id] = t; } catch (x) {} }
        else if (e.data === 2 || e.data === 5) M.playing = false;
        else if (e.data === 0) { M.playing = false; plGo(M.i + 1); }
        plRender(); plSave();
      },
      onError: function () { M.playing = false; if (++M.fails < TRACKS.length) plGo(M.i + 1); else plRender(); }
    } });
  }
  function bootMusic() {
    D.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('#psPlay,#psMusicBtn,#psNext,#psPrev'); if (!t) return;
      if (t.id === 'psNext') { plWant(true); plGo(M.i + 1); } else if (t.id === 'psPrev') { plWant(true); plGo(M.i - 1); } else plToggle();
    });
    var kick = function () { if (M.ready && M.want && !M.playing && TRACKS.length) { try { M.yt.playVideo(); } catch (e) {} } };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { addEventListener(ev, kick, { passive: true }); });
    // only one tab plays at a time
    addEventListener('storage', function (e) { if (e.key === 'pasiya_owner' && e.newValue && e.newValue !== M.tab && M.playing) { try { M.yt.pauseVideo(); } catch (x) {} } });
    setInterval(function () { if (M.playing) plSave(); }, 1000);
    addEventListener('pagehide', plSave); D.addEventListener('visibilitychange', function () { if (D.hidden) plSave(); });
    setInterval(function () { if (!D.hidden) loadMusic(); }, 30000);
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (typeof prev === 'function') { try { prev(); } catch (e) {} } M.apiReady = true; M.loaded ? initPlayer() : (M.pendingInit = initPlayer); };
    loadMusic(); plRender();
    var load = function () { if (window.YT && window.YT.Player) { window.onYouTubeIframeAPIReady(); return; } var s = D.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true; s.onerror = function () { var e = D.getElementById('psSub'); if (e) e.textContent = 'Music unavailable'; }; D.head.appendChild(s); };
    if (D.readyState === 'complete') load(); else addEventListener('load', load);
  }
  P.music = { reload: loadMusic, toggle: plToggle, next: function () { plWant(true); plGo(M.i + 1); } };

  // ====================================================================================
  //  ANIMATED BACKGROUND (soft aurora + floating network, follows the chosen colour)
  // ====================================================================================
  function bootBg() {
    if (D.getElementById('psbg')) return;
    var c = D.createElement('canvas'); c.id = 'psbg'; c.setAttribute('aria-hidden', 'true'); D.body.insertBefore(c, D.body.firstChild);
    var x = c.getContext('2d'); if (!x) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, Hh = 0, nodes = [], last = 0, par = { x: 0, y: 0, tx: 0, ty: 0 };
    var cur = { a: [59, 156, 245], b: [106, 91, 230] }, tgt = { a: [59, 156, 245], b: [106, 91, 230] };
    function readColors() {
      var cs = getComputedStyle(H), pa = cs.getPropertyValue('--a-rgb').split(',').map(Number), pb = cs.getPropertyValue('--b-rgb').split(',').map(Number);
      if (pa.length === 3 && !pa.some(isNaN)) tgt.a = pa; if (pb.length === 3 && !pb.some(isNaN)) tgt.b = pb;
    }
    function resize(ev) {
      // Mobile browsers fire 'resize' while scrolling (address bar hides/shows). Re-allocating the canvas clears it = white flash. Ignore height-only changes.
      if (ev && W && Math.abs(innerWidth - W) < 2 && Math.abs(innerHeight - Hh) < 220) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = innerWidth; Hh = innerHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(64, Math.max(20, W * Hh / 24000))); nodes = [];
      for (var i = 0; i < n; i++) nodes.push({ x: Math.random() * W, y: Math.random() * Hh, vx: (Math.random() - .5) * .24, vy: (Math.random() - .5) * .24, r: Math.random() * 1.3 + .6, k: Math.random() });
      draw(performance.now(), 1);
    }
    var rgb = function (v, a) { return 'rgba(' + (v[0] | 0) + ',' + (v[1] | 0) + ',' + (v[2] | 0) + ',' + a + ')'; };
    var BL = [{ fx: .9, fy: 1.1, ph: 0, s: .62, w: 'a', al: .2 }, { fx: 1.2, fy: .8, ph: 2.1, s: .56, w: 'b', al: .19 }, { fx: .7, fy: 1.3, ph: 4.2, s: .5, w: 'm', al: .12 }];
    function draw(now, dt) {
      for (var k = 0; k < 3; k++) { cur.a[k] += (tgt.a[k] - cur.a[k]) * .06; cur.b[k] += (tgt.b[k] - cur.b[k]) * .06; }
      par.x += (par.tx - par.x) * .05; par.y += (par.ty - par.y) * .05;
      var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#070a14'); g.addColorStop(.55, '#0a1020'); g.addColorStop(1, '#05070e');
      x.globalCompositeOperation = 'source-over'; x.fillStyle = g; x.fillRect(0, 0, W, Hh);
      x.globalCompositeOperation = 'lighter';
      var mix = [(cur.a[0] + cur.b[0]) / 2, (cur.a[1] + cur.b[1]) / 2, (cur.a[2] + cur.b[2]) / 2], t = now * .00009, m = Math.max(W, Hh);
      for (var i = 0; i < BL.length; i++) {
        var b = BL[i], col = b.w === 'a' ? cur.a : b.w === 'b' ? cur.b : mix;
        var cx = W * (.5 + .42 * Math.sin(t * b.fx * 6 + b.ph)) + par.x * (18 + i * 10), cy = Hh * (.45 + .38 * Math.cos(t * b.fy * 5 + b.ph * 1.3)) + par.y * (18 + i * 10), r = m * b.s;
        var rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, rgb(col, b.al)); rg.addColorStop(.55, rgb(col, b.al * .35)); rg.addColorStop(1, rgb(col, 0));
        x.fillStyle = rg; x.fillRect(0, 0, W, Hh);
      }
      x.globalCompositeOperation = 'source-over';
      var link = 130, i2, j, n = nodes.length;
      for (i2 = 0; i2 < n; i2++) { var p = nodes[i2]; if (!reduce) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20; if (p.y < -20) p.y = Hh + 20; else if (p.y > Hh + 20) p.y = -20; } }
      x.lineWidth = 1;
      for (i2 = 0; i2 < n; i2++) for (j = i2 + 1; j < n; j++) {
        var dx = nodes[i2].x - nodes[j].x, dy = nodes[i2].y - nodes[j].y, d = dx * dx + dy * dy;
        if (d < link * link) { x.strokeStyle = rgb(cur.a, (1 - Math.sqrt(d) / link) * .17); x.beginPath(); x.moveTo(nodes[i2].x + par.x * 6 * nodes[i2].k, nodes[i2].y + par.y * 6 * nodes[i2].k); x.lineTo(nodes[j].x + par.x * 6 * nodes[j].k, nodes[j].y + par.y * 6 * nodes[j].k); x.stroke(); }
      }
      for (i2 = 0; i2 < n; i2++) { var q = nodes[i2]; x.fillStyle = rgb(q.k > .5 ? cur.a : cur.b, .35 + q.k * .35); x.beginPath(); x.arc(q.x + par.x * 6 * q.k, q.y + par.y * 6 * q.k, q.r, 0, 6.2832); x.fill(); }
      var v = x.createRadialGradient(W / 2, Hh * .45, Math.min(W, Hh) * .35, W / 2, Hh * .45, m * .85); v.addColorStop(0, 'rgba(3,5,12,0)'); v.addColorStop(1, 'rgba(3,5,12,.55)'); x.fillStyle = v; x.fillRect(0, 0, W, Hh);
    }
    function frame(now) { requestAnimationFrame(frame); if (now - last < 36) return; var dt = Math.min(60, now - last) / 16.7; last = now; draw(now, dt); }
    readColors(); cur.a = tgt.a.slice(); cur.b = tgt.b.slice(); resize();
    addEventListener('resize', resize);
    D.addEventListener('ps:accent', function () { readColors(); if (reduce) { for (var k = 0; k < 3; k++) { cur.a[k] = tgt.a[k]; cur.b[k] = tgt.b[k]; } draw(performance.now(), 0); } });
    if (!reduce) {
      addEventListener('pointermove', function (e) { par.tx = e.clientX / W - .5; par.ty = e.clientY / Hh - .5; }, { passive: true });
      requestAnimationFrame(frame);
    }
  }

  // ====================================================================================
  //  FOOTER (same on every site: P logo + PASIYA OFC)
  // ====================================================================================
  function renderFooter() {
    var el = $('#ps-footer');
    if (!el) { el = D.createElement('footer'); el.id = 'ps-footer'; D.body.appendChild(el); }
    var soc = SOCIAL.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener" aria-label="' + esc(s[0]) + '">' + ico(s[2]) + '</a>'; }).join('');
    el.className = 'ps-footer';
    el.innerHTML = '<div class="brand"><span class="logo">' + logo('psLgFoot') + '</span><div><b>PASIYA <em>OFC</em></b><span class="ps-up" id="psUp"><i></i>checking\u2026</span></div></div>' +
      '<p>Pasidu Eshan\'s home for the free PASIYA API, past papers, WhatsApp bot, QR editor and AI tools. One login works everywhere.</p>' +
      '<div class="ps-info"><a href="' + WA + '" target="_blank" rel="noopener"><span class="bx">' + ico('chat') + '</span>WhatsApp support</a><div><span class="bx">' + ico('globe') + '</span>' + esc(location.host) + '</div><div><span class="bx">' + ico('pin') + '</span>Sri Lanka \ud83c\uddf1\ud83c\uddf0</div><div><span class="bx">' + ico('clock') + '</span>24/7 Global Support</div></div>' +
      '<div class="ps-social">' + soc + '</div>' +
      '<div class="ps-copy">\u00a9 ' + new Date().getFullYear() + ' \u00b7 Designed &amp; built by <b>Pasidu Eshan</b></div>';
    fetch('/api/health', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { setUp(d && d.ok); }).catch(function () { setUp(false); });
    function setUp(ok) { var u = $('#psUp'); if (!u) return; u.className = 'ps-up' + (ok ? '' : ' warn'); u.innerHTML = '<i></i>' + (ok ? 'All systems online \u2713' : 'Status unavailable'); }
  }

  // ====================================================================================
  //  BACK-TO-TOP BUTTON (round, scroll-progress ring) - same look as the portfolio, on every site.
  //  The portfolio has its own #toTop, so nothing is added there.
  // ====================================================================================
  function bootTop() {
    if (D.getElementById('toTop') || D.getElementById('psTop')) return;
    var b = D.createElement('button'); b.id = 'psTop'; b.type = 'button'; b.className = 'ps-top'; b.setAttribute('aria-label', 'Back to top');
    b.innerHTML = '<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="19"></circle><circle class="pr" cx="22" cy="22" r="19"></circle></svg><svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    D.body.appendChild(b);
    var pr = b.querySelector('.pr'), circ = 2 * Math.PI * 19, tick = false;
    pr.style.strokeDasharray = circ; pr.style.strokeDashoffset = circ;
    function upd() {
      tick = false;
      var se = D.scrollingElement || D.documentElement, max = se.scrollHeight - window.innerHeight, y = window.pageYOffset || se.scrollTop || 0;
      pr.style.strokeDashoffset = circ - circ * (max > 0 ? Math.min(1, y / max) : 0);
      b.classList.toggle('show', y > 280 && max > 400);
    }
    addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    addEventListener('resize', upd);
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    upd();
  }

  function renderAll() { renderDots(); renderSites(); renderAccount(); renderAdmin(); renderAccountLinks(); }
  function start() {
    H.dataset.accent = LS.get('pasiya_accent') || LS.get('pasiya_def_accent') || H.dataset.accent || 'blue'; loadDefaultAccent();
    if (!$('link[href*="family=Inter"]')) { var l = D.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'; D.head.appendChild(l); }
    updateFavicon(); bootBg(); buildChrome(); renderAll(); tick(); setInterval(tick, 1000); bootMusic(); renderFooter(); bootTop();
    fetch('/api/config').then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) { P.cfg = c || {}; renderAll(); });
    bootAuth();
    fixTops(); setTimeout(fixTops, 900); setTimeout(fixTops, 3000); addEventListener('resize', fixTops);
  }
  P.setAccent = setAccent; P.applyDefaultAccent = applyDefaultAccent; P.render = renderAll; P.openMenu = openMenu;
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
