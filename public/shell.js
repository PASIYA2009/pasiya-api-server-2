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
    { k: 'papers', n: 'Pasiya Papers', t: 'Past Papers', p: 'https://pastpaper-pro.vercel.app', ic: 'book', sub: 'Past papers' },
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
  var SOCIAL = []; // add more: ['Telegram', 'https://t.me/yourname', 'tg']
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
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5v.2h-2.4v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H6.7v-2.4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 001.9.3 1.7 1.7 0 001-1.5v-.2h2.4v.2a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.5 1h.2V14h-.2a1.7 1.7 0 00-1.5 1z"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'
  };
  var ico = function (n) { return '<svg class="ps-ico" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>'; };
  var PLAY_I = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>', PAUSE_I = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  function logo(id) { return '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--b)"/></linearGradient></defs><path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill="#0b1220" stroke="url(#' + id + ')" stroke-width="3"/><path d="M24 46V19h12a8.5 8.5 0 010 17H24" fill="none" stroke="url(#' + id + ')" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }

  // ---------- theme accent (shared by every site) ----------
  var ACCENTS = [['red', '#f04b5b', 'Red'], ['blue', '#2f7df6', 'Blue'], ['purple', '#a371f7', 'Purple'], ['green', '#14c78a', 'Green'], ['amber', '#f5a524', 'Amber'], ['pink', '#ec4899', 'Pink'], ['cyan', '#22d3ee', 'Cyan'], ['lime', '#84cc16', 'Lime']];
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
    var cur = H.dataset.accent || 'red';
    $$('[data-ps-dots]').forEach(function (el) {
      el.innerHTML = '<div class="ps-theme"><span>' + ico('palette') + 'Settings</span><div class="ps-dots">' + ACCENTS.map(function (x) { return '<button type="button" class="ps-dot' + (x[0] === cur ? ' on' : '') + '" data-a="' + x[0] + '" style="--c:' + x[1] + '" aria-label="' + x[2] + ' theme"></button>'; }).join('') + '</div></div>';
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
    if (/^https?:\/\//i.test(path)) return { href: path }; // external site (Past Papers) opens directly, no proxy
    if (ROLE === 'api' && path === '/api') return { href: isDirect() ? '/' : '/api' };
    if (isDirect()) return ofcBase() ? { href: ofcBase() + path, x: 1 } : null;
    return { href: path };
  }
  function accountHash(h) { return isDirect() ? '/#' + h : '/api#' + h; }

  function renderSites() {
    $$('[data-ps-sites]').forEach(function (el) {
      el.innerHTML = '<div class="ps-sec">OTHER SERVICES</div><nav class="ps-links">' + SITES.map(function (s) {
        var l = link(s.p); if (!l) return '';
        return '<a href="' + esc(l.href) + '"' + (l.x ? ' data-ps-x="1"' : '') + (s.k === ROLE ? ' class="on" aria-current="page"' : '') + '>' + ico(s.ic) + '<span>' + esc(s.n) + '</span>' + (s.tag ? '<em class="ps-tag">' + s.tag + '</em>' : '') + '</a>';
      }).join('') + '</nav>';
    });
    $$('[data-ps-tabs]').forEach(function (el) {
      el.innerHTML = SITES.map(function (s) { var l = link(s.p); if (!l) return ''; return '<a href="' + esc(l.href) + '"' + (l.x ? ' data-ps-x="1"' : '') + (s.k === ROLE ? ' class="on" aria-current="page"' : '') + '>' + esc(s.t) + '</a>'; }).join('');
    });
    $$('[data-ps-brandlink]').forEach(function (a) { var l = link('/'); a.setAttribute('href', ROLE === 'ofc' ? '#home' : (l ? l.href : '/')); if (l && l.x) a.dataset.psX = '1'; });
    var aiLink = link('/ai');
    var aiButton = $('.ps-ai-fab');
    if (aiButton) {
      aiButton.href = aiLink ? aiLink.href : (ofcBase() ? ofcBase() + '/ai' : '/ai');
      if (aiLink && aiLink.x) aiButton.dataset.psX = '1'; else delete aiButton.dataset.psX;
    }
    $$('.ps-ai-fab').forEach(function (a) { a.classList.toggle('on', ROLE === 'ai'); });
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
  // The login / register links always carry the page the visitor is on (?next=), so after signing in they land
  // exactly where they pressed "Log in" (path + query + #section). auth.js reads ?next= (and the sessionStorage copy).
  function backTarget() {
    var p = location.pathname + location.search.replace(/([?&])ps_ok=1&?/, '$1').replace(/[?&]$/, '') + location.hash;
    if (!/^\/(?!\/|\\)/.test(p) || /^\/(api\/)?(login|register)(\/|\?|#|$)/.test(p)) return '/';
    return p;
  }
  function loginUrl(kind) {
    var next = backTarget();
    try { sessionStorage.setItem('ps_back', next); } catch (e) {}
    if (ROLE === 'api') return (isDirect() ? '/' : '/api/') + kind + '?next=' + encodeURIComponent(next);
    return '/api/' + kind + '?next=' + encodeURIComponent(next);
  }
  // the hash / query can change while the page is open (menu anchors): keep every login link fresh
  function refreshLoginLinks() { $$('a[data-ps-login]').forEach(function (a) { a.href = loginUrl(a.getAttribute('data-ps-login')); }); }
  addEventListener('hashchange', refreshLoginLinks);

  // ---------- account card / chip ----------
  function nameOf() { var u = P.user; return (P.me && P.me.username) || (u && (u.displayName || (u.email || '').split('@')[0])) || 'User'; }
  function avatar() { var u = P.user, n = nameOf(); return '<span class="ps-av">' + (u && u.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(u.photoURL) + '">' : esc(n.charAt(0).toUpperCase())) + '</span>'; }
  var isAdmin = function () { return !!(P.me && P.me.role === 'admin'); };
  var coins = function () { return isAdmin() ? '\u221e' : (P.me && typeof P.me.coins === 'number' ? P.me.coins.toLocaleString('en-US') : '\u2026'); };
  function renderAccount() {
    $$('[data-ps-account]').forEach(function (el) {
      if (P.user) el.innerHTML = '<div class="ps-acct"><div class="ps-user">' + avatar() + '<div><b>' + esc(nameOf()) + (isAdmin() ? '<span class="ps-role">ADMIN</span>' : '') + '</b><span class="ps-coin">' + ico('coin') + '<span data-ps-coins>' + coins() + '</span></span></div></div></div>';
      else el.innerHTML = '<div class="ps-acct"><div class="row"><a class="ps-btn out" data-ps-login="login" href="' + loginUrl('login') + '">Log in</a><a class="ps-btn main" data-ps-login="register" href="' + loginUrl('register') + '">Register</a></div></div>';
    });
    $$('[data-ps-out]').forEach(function (el) { el.hidden = !P.user; if (!el.dataset.b) { el.dataset.b = 1; el.innerHTML = '<div class="ps-sec"></div><button type="button" class="ps-btn danger full" data-ps-signout>' + ico('out') + 'Sign Out</button>'; } });
    $$('[data-ps-top]').forEach(function (el) {
      el.innerHTML = P.user
        ? '<div class="ps-account-wrap"><a class="ps-chip coins" href="' + accountHash('wallet') + '" title="Coin wallet">' + ico('coin') + '<span data-ps-coins>' + coins() + '</span></a>' +
          '<button type="button" class="ps-account-trigger" id="psAccountTrigger" aria-label="Account options" aria-expanded="false">' + avatar() + '</button>' +
          '<div class="ps-account-menu" id="psAccountMenu" aria-hidden="true"><div class="ps-account-menu-user">' + avatar() + '<span><b>' + esc(nameOf()) + '</b><small>' + esc((P.user.email || 'Signed in')) + '</small></span></div>' +
          '<a href="' + accountHash('profile') + '">' + ico('user') + '<span>My Account</span></a>' +
          '<button type="button" data-ps-signout>' + ico('out') + '<span>Sign Out</span></button></div></div>'
        : '<a class="ps-chip login" data-ps-login="login" href="' + loginUrl('login') + '">Log in</a>';
    });
  }
  D.addEventListener('click', function (e) {
    var accountTrigger = e.target.closest && e.target.closest('#psAccountTrigger');
    var accountMenu = $('#psAccountMenu');
    if (accountTrigger && accountMenu) {
      e.stopPropagation();
      var accountOpen = accountMenu.classList.toggle('open');
      accountMenu.setAttribute('aria-hidden', String(!accountOpen));
      accountTrigger.setAttribute('aria-expanded', String(accountOpen));
      return;
    }
    if (accountMenu && !accountMenu.contains(e.target)) {
      accountMenu.classList.remove('open'); accountMenu.setAttribute('aria-hidden', 'true');
      var trigger = $('#psAccountTrigger'); if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
    if (e.target.closest && e.target.closest('[data-ps-signout]') && P.auth && P.A) {
      var signoutButtons = $$('[data-ps-signout]'); signoutButtons.forEach(function (b) { b.disabled = true; });
      P.A.signOut(P.auth).then(function () { P.user = null; P.me = null; renderAll(); location.reload(); })
        .catch(function () { signoutButtons.forEach(function (b) { b.disabled = false; }); });
    }
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
  // ---------- LIVE COINS ----------
  // The coin counter (top bar chip, menu, dashboard) follows the server without a refresh:
  //  - right after any API call / daily claim / spin made by this page (fetch hook),
  //  - every 12 s while the tab is visible (catches admin grants, other tabs/devices),
  //  - when the tab becomes visible again.
  function paintCoins() {
    $$('[data-ps-coins]').forEach(function (el) {
      var t = coins(); if (el.textContent === t) return;
      el.textContent = t; el.classList.remove('ps-bump'); void el.offsetWidth; el.classList.add('ps-bump');
    });
  }
  function setCoins(n) {
    if (!P.me || typeof n !== 'number' || P.me.coins === n) return;
    P.me.coins = n; paintCoins(); D.dispatchEvent(new CustomEvent('ps:coins', { detail: { coins: n } }));
    if (P.refreshSettings) P.refreshSettings();
  }
  P.setMe = function (m) { // a page that already fetched /api/me hands it over (keeps the chip in sync, no extra request)
    if (!m) return; var old = P.me; P.me = m;
    if (!old || old.role !== m.role || old.username !== m.username) renderAll(); else if (old.coins !== m.coins) { old.coins = m.coins; paintCoins(); }
    if (P.refreshSettings) P.refreshSettings();
  };
  function pollCoins() {
    if (!P.user || !P.auth || !P.auth.currentUser || !P.me || isAdmin() || D.hidden) return;
    P.auth.currentUser.getIdToken().then(function (t) { return _fetch('/api/me/coins', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' }); })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && typeof d.coins === 'number') setCoins(d.coins); }).catch(function () {});
  }
  P.refreshCoins = pollCoins;
  var _fetch = window.fetch.bind(window), coinTimers = [];
  var NOPAY = /\/api\/(me|theme|config|music|health|ping|status|load|catalog|endpoint-status|keys|usage|coins\/history|auth)(\/|\?|$)|\/api\/admin\/healthcheck/;
  window.fetch = function (input, init) {
    var pr = _fetch(input, init);
    try {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      if (P.user && !isAdmin() && /\/api\//.test(u) && !NOPAY.test(u)) {
        coinTimers.push(setTimeout(pollCoins, 1500)); // coins are taken before the API runs -> show it quickly
        var done = function () { setTimeout(pollCoins, 300); };
        pr.then(done, done);
      }
    } catch (e) {}
    return pr;
  };
  setInterval(pollCoins, 12000);
  D.addEventListener('visibilitychange', function () { if (!D.hidden) pollCoins(); });
  addEventListener('focus', pollCoins);

  function bootAuth() {
    Promise.all([import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js')]).then(function (m) {
      var A = m[1]; P.A = A; P.auth = A.getAuth(m[0].initializeApp(FB));
      var first = true;
      A.onAuthStateChanged(P.auth, function (u) {
        if (first && !u && ssoToken) { first = false; A.signInWithCustomToken(P.auth, ssoToken).catch(function () { renderAll(); }); ssoToken = null; return; }
        first = false; P.authReady = true; P.user = u; P.me = null; renderAll(); if (u) loadMe();
        D.dispatchEvent(new CustomEvent('ps:user', { detail: u }));
      });
    }).catch(function () { P.authReady = true; renderAll(); });
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
      '<button type="button" class="psb-menu" id="psDesktopMenu" aria-label="Open menu" title="Menu">' + ico('menu') + '</button>' +
      '<a class="psb-brand" data-ps-brandlink href="/" aria-label="' + esc(SITE.n) + '">' + '<span class="psb-logo">' + logo('psLgBar') + '</span><span><b>' + esc(SITE.n.toUpperCase()) + '</b><small>by Pasidu Eshan</small></span></a>' +
      '<nav class="psb-tabs" data-ps-tabs aria-label="Other services"></nav>' +
      '<div class="psb-right"><div class="psb-time" id="psTime" aria-label="Sri Lanka time"><span class="d"></span><span class="t"></span></div>' +
      '<button type="button" class="psb-music" id="psMusicBtn" aria-label="Play music" title="Music">' + ico('note') + '</button>' +
      '<button type="button" class="psb-settings" id="psTopSettings" aria-label="Open settings" title="Settings">' + ico('settings') + '</button>' +
      '<span class="psb-acct" data-ps-top></span></div>';
    back = D.createElement('div'); back.className = 'psd-back'; back.id = 'psdBack';
    drawer = D.createElement('aside'); drawer.className = 'psd'; drawer.id = 'psd'; drawer.setAttribute('aria-label', 'Main menu'); drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML =
      '<div class="psd-head psd-head-min"><button type="button" class="psd-close" id="psdClose" aria-label="Close menu">' + ico('x') + '</button></div>' +
      '<div class="psh" aria-hidden="true"><div class="psh-art"><i class="psh-blob"></i><i class="psh-ring"></i>' +
        '<svg class="psh-svg" viewBox="0 0 140 140"><g class="psh-char">' +
        '<path class="hd" d="M34 78c8-30 64-30 72 0z"/>' +
        '<path class="hy" d="M14 140c2-26 20-40 42-44h28c22 4 40 18 42 44z"/>' +
        '<path class="hyl" d="M56 96c4 10 24 10 28 0l6 2c-4 16-36 16-40 0z"/>' +
        '<path class="ds" d="M62 108v12M78 108v12"/><circle class="dsb" cx="62" cy="122" r="1.8"/><circle class="dsb" cx="78" cy="122" r="1.8"/>' +
        '<path class="nk" d="M61 82h18v14c-5 6-13 6-18 0z"/><path class="nks" d="M61 90c6 5 12 5 18 0v-4H61z"/>' +
        '<path class="fc" d="M44 56c0-20 12-32 26-32s26 12 26 32c0 22-12 36-26 36S44 78 44 56z"/>' +
        '<ellipse class="bl" cx="55" cy="72" rx="6" ry="3.4"/><ellipse class="bl" cx="85" cy="72" rx="6" ry="3.4"/>' +
        '<path class="hr" d="M41 60c-6-26 8-42 30-42 22 0 36 14 29 42-2-10-6-16-12-19-8 6-22 8-34 5-6 3-10 9-13 14z"/>' +
        '<path class="hh" d="M52 28c8-6 20-8 30-3"/>' +
        '<path class="br" d="M52 52c4-3 9-3 13-1M75 51c4-2 9-2 13 1"/>' +
        '<g class="ey"><ellipse class="eye" cx="59" cy="62" rx="4.2" ry="5.4"/><ellipse class="eye" cx="81" cy="62" rx="4.2" ry="5.4"/><circle class="shn" cx="60.6" cy="60" r="1.5"/><circle class="shn" cx="82.6" cy="60" r="1.5"/></g>' +
        '<path class="ns" d="M70 66v6"/>' +
        '<path class="mo" d="M63 77c4 5 10 5 14 0"/>' +
        '<path class="hp" d="M43 60c-4-26 10-40 27-40s31 14 27 40"/><rect class="hc" x="37" y="55" width="10" height="22" rx="5"/><rect class="hc" x="93" y="55" width="10" height="22" rx="5"/><circle class="hg" cx="42" cy="66" r="2.2"/><circle class="hg" cx="98" cy="66" r="2.2"/>' +
        '<g class="lp"><rect x="32" y="108" width="76" height="34" rx="6"/><path class="lg" d="M64 125l4-5 4 5-4 5z"/><rect class="ln l1" x="40" y="114" width="20" height="3" rx="1.5"/><rect class="ln l2" x="80" y="114" width="20" height="3" rx="1.5"/></g>' +
        '</g></svg>' +
        '<span class="psh-sy s1">&lt;/&gt;</span><span class="psh-sy s2">{ }</span><span class="psh-sy s3">( )</span><span class="psh-sy s4">;</span>' +
        '<span class="psh-js">JS</span><span class="psh-ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>' +
        '<div class="psh-txt"><span class="psh-pill"><i></i>DEVELOPER</span><b>PASIDU<br>ESHAN</b><em class="psh-term">&gt; <span>pasiya --online</span><u></u></em></div></div>' +
      '<div data-ps-account></div><div data-ps-admin></div><div data-ps-pagehost></div><div data-ps-acctlinks></div><div data-ps-sites></div>' +
      '<div class="ps-sec">MUSIC</div>' +
      '<div class="psp" id="psPlayer">' +
        '<div class="psp-top"><div class="psp-art" id="psArt" aria-hidden="true"><span class="psp-disc"><i></i></span></div>' +
        '<div class="psp-info"><small class="psp-kick">NOW PLAYING</small><b id="psTitle">Music</b><small id="psSub">Loading\u2026</small></div>' +
        '<span class="psp-eq" id="psEq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>' +
        '<div class="psp-prog"><span id="psCur">0:00</span><input type="range" id="psSeek" min="0" max="1000" value="0" step="1" aria-label="Seek" disabled><span id="psDur">0:00</span></div>' +
        '<div class="psp-ctl"><button type="button" id="psPrev" aria-label="Previous song"><svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9.500 12z"/></svg></button><button type="button" id="psPlay" class="main" aria-label="Play music"></button><button type="button" id="psNext" aria-label="Next song"><svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5v14l10.500-7z"/></svg></button></div>' +
        '<div class="psp-vol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16.500 8.500a5 5 0 010 7"/></svg><input type="range" id="psVol" min="0" max="100" value="80" step="1" aria-label="Volume"></div>' +
      '</div>' +
      '<div data-ps-dots></div><div data-ps-out hidden></div>';
    b.insertBefore(drawer, b.firstChild); b.insertBefore(back, b.firstChild); b.insertBefore(bar, b.firstChild);

    // Mobile service dock: compact, fixed navigation shared by every PASIYA page.
    var dock = D.createElement('nav'); dock.className = 'ps-mobile-dock'; dock.id = 'psMobileDock';
    var dockItems = [
      { k: 'ofc', t: 'Home', p: '/', ic: 'home' },
      { k: 'api', t: 'API', p: '/api', ic: 'bolt' },
      { k: 'bot', t: 'WhatsApp', p: '/bot', ic: 'bot' },
      { k: 'papers', t: 'Papers', p: 'https://pastpaper-pro.vercel.app', ic: 'book' }
    ];
    dock.innerHTML = dockItems.map(function (it) {
      var l = link(it.p); if (!l) return '';
      return '<a class="ps-md-item' + (it.k === ROLE ? ' on' : '') + '" href="' + esc(l.href) + '"' +
        (l.x ? ' data-ps-x="1"' : '') + (it.k === ROLE ? ' aria-current="page"' : '') + '>' +
        ico(it.ic) + '<span>' + esc(it.t) + '</span></a>';
    }).join('') +
      '<button type="button" class="ps-md-item ps-md-settings" id="psDockSettings" aria-label="Open settings">' +
      ico('palette') + '<span>Settings</span></button>';
    b.appendChild(dock);
    var settingsPop = D.createElement('div');
    settingsPop.className = 'ps-settings-pop';
    settingsPop.id = 'psSettingsPop';
    settingsPop.setAttribute('aria-hidden', 'true');
    settingsPop.innerHTML = '<div class="ps-settings-title">' + ico('settings') + '<b>Settings · ' + esc(SITE.n) + '</b><button type="button" class="ps-settings-close" aria-label="Close settings">×</button></div>' +
      ('<section class="ps-api-settings" id="psApiSettings"><div class="ps-api-balance"><small>YOUR COIN BALANCE</small><strong id="psApiCoins">—</strong></div><div class="ps-api-shortcuts">' + [['wallet', 'Coin wallet'], ['history', 'Coin history'], ['profile', 'API keys & profile']].map(function (x) { return ROLE === 'api' ? '<button type="button" data-go="' + x[0] + '">' + x[1] + '</button>' : '<a href="' + accountHash(x[0]) + '">' + x[1] + '</a>'; }).join('') + '</div><div class="ps-api-history-head">Recent coin activity</div><div class="ps-api-history" id="psApiHistory">Sign in to view coin history.</div><div class="ps-api-keys-head">API keys</div><div class="ps-api-keys" id="psApiKeys">Sign in to view your API keys.</div></section><div class="ps-settings-divider"></div>') +
      '<div class="ps-settings-page" data-ps-settings-page></div><div class="ps-settings-divider"></div><div class="ps-settings-music"><div><small>BACKGROUND MUSIC</small><b id="psSettingsTrack">PASIYA Music Player</b></div><div class="ps-settings-music-controls"><button type="button" data-ps-music="prev" aria-label="Previous song">‹</button><button type="button" data-ps-music="play" aria-label="Play or pause">▶</button><button type="button" data-ps-music="next" aria-label="Next song">›</button></div></div><div class="ps-settings-divider"></div><div class="ps-settings-theme-label">' + ico('palette') + '<span>Theme colour</span></div><div data-ps-dots></div>';
    b.appendChild(settingsPop);
    var aiFab = D.createElement('a');
    aiFab.className = 'ps-ai-fab'; aiFab.href = '/ai';
    aiFab.setAttribute('aria-label', 'Open PASIYA AI'); aiFab.title = 'PASIYA AI';
    aiFab.innerHTML = '<span class="ps-ai-fab-orbit"></span><span class="ps-ai-fab-core">' + ico('bot') + '</span><small>AI</small>';
    b.appendChild(aiFab);
    var aiDismiss = D.createElement('button');
    aiDismiss.type = 'button'; aiDismiss.className = 'ps-ai-dismiss'; aiDismiss.setAttribute('aria-label', 'Hide AI shortcut'); aiDismiss.textContent = '×';
    b.appendChild(aiDismiss);
    function setAiShortcutVisible(show) {
      aiFab.hidden = !show; aiDismiss.hidden = !show;
      if (restoreAi) restoreAi.hidden = show;
      try { LS.set('pasiya_ai_shortcut_hidden', show ? '0' : '1'); } catch (e) {}
    }
    var aiHidden = false; try { LS.set('pasiya_ai_shortcut_hidden', '0'); } catch (e) {} // the little x was removed: the shortcut always stays
    setAiShortcutVisible(!aiHidden);
    aiDismiss.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setAiShortcutVisible(false); });
    var restoreAi = D.createElement('button');
    restoreAi.type = 'button'; restoreAi.className = 'ps-ai-restore'; restoreAi.textContent = 'Show AI shortcut';
    restoreAi.hidden = !aiHidden;
    restoreAi.addEventListener('click', function () { setAiShortcutVisible(true); restoreAi.hidden = true; });
    b.appendChild(restoreAi);
    var settingsTitle = $('.ps-settings-title', settingsPop);
    if (settingsTitle) settingsPop.appendChild(restoreAi);
    function toggleSettings(e) {
      if (e) e.stopPropagation();
      var opened = settingsPop.classList.toggle('open');
      settingsPop.setAttribute('aria-hidden', String(!opened));
      if (opened && P.refreshSettings) P.refreshSettings();
    }
    $('#psDockSettings').addEventListener('click', toggleSettings);
    var topSettings = $('#psTopSettings');
    if (topSettings) topSettings.addEventListener('click', toggleSettings);
    $('.ps-settings-close', settingsPop).addEventListener('click', function () {
      settingsPop.classList.remove('open'); settingsPop.setAttribute('aria-hidden', 'true');
    });
    $$('[data-ps-music]', settingsPop).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-ps-music');
        var original = target === 'prev' ? $('#psPrev') : target === 'next' ? $('#psNext') : $('#psPlay');
        if (original) original.click();
      });
    });
    var trackNode = $('#psTitle');
    var settingsTrack = $('#psSettingsTrack');
    if (trackNode && settingsTrack && window.MutationObserver) {
      new MutationObserver(function () { settingsTrack.textContent = trackNode.textContent || 'PASIYA Music Player'; }).observe(trackNode, { childList: true, characterData: true, subtree: true });
      settingsTrack.textContent = trackNode.textContent || 'PASIYA Music Player';
    }
    function refreshApiSettings() {
      var coinNode = $('#psApiCoins'), historyNode = $('#psApiHistory'), keysNode = $('#psApiKeys');
      if (!P.user) { // signed out: a real, working Sign in button (it comes back to this page after login)
        var ready = !!P.authReady;
        if (coinNode) coinNode.innerHTML = ready ? '<a class="ps-signin" data-ps-login="login" href="' + loginUrl('login') + '">Sign in</a>' : '…';
        if (historyNode) historyNode.innerHTML = '<small>' + (ready ? 'Sign in to see your coin activity.' : 'Loading…') + '</small>';
        if (keysNode) keysNode.innerHTML = '<small>' + (ready ? 'Sign in to see your API keys.' : 'Loading…') + '</small>';
        return;
      }
      if (coinNode) coinNode.textContent = P.me ? (isAdmin() ? '∞' : (typeof P.me.coins === 'number' ? P.me.coins.toLocaleString('en-US') : '—')) : '…';
      if (!P.auth || !P.auth.currentUser) return;
      P.auth.currentUser.getIdToken().then(function (token) {
        return Promise.all([
          fetch('/api/coins/history', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }),
          fetch('/api/keys', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
        ]);
      }).then(function (results) {
        if (historyNode) {
          var items = results[0] && results[0].items || [];
          historyNode.innerHTML = items.slice(0, 3).map(function (item) {
            var amount = Number(item.amount || 0), sign = amount > 0 ? '+' : '';
            return '<div class="ps-api-row"><span>' + esc(item.reason || 'Coin activity') + '</span><b>' + sign + amount + '</b></div>';
          }).join('') || '<small>No coin activity yet.</small>';
        }
        if (keysNode) {
          var keys = results[1] && results[1].keys || [];
          keysNode.innerHTML = keys.slice(0, 2).map(function (key) {
            return '<div class="ps-api-row"><span>' + esc(key.label || 'API key') + '</span><code>' + esc(key.prefix || 'pasiya_') + '••••</code></div>';
          }).join('') || '<small>No API key found.</small>';
        }
      }).catch(function () {
        if (historyNode) historyNode.textContent = 'Could not load coin history.';
        if (keysNode) keysNode.textContent = 'Could not load API keys.';
      });
    }
    settingsPop.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-go]')) {
        settingsPop.classList.remove('open'); settingsPop.setAttribute('aria-hidden', 'true');
      }
    });
    refreshApiSettings();
    P.refreshSettings = refreshApiSettings;
    D.addEventListener('click', function (e) {
      if (!settingsPop.contains(e.target) && !$('#psDockSettings').contains(e.target) && !($('#psTopSettings') && $('#psTopSettings').contains(e.target))) {
        settingsPop.classList.remove('open'); settingsPop.setAttribute('aria-hidden', 'true');
      }
    });
    D.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { settingsPop.classList.remove('open'); settingsPop.setAttribute('aria-hidden', 'true'); }
    });

    // the page can hand over its own menu links (e.g. the API sections / the portfolio sections)
    var slot = $('[data-ps-page]');
    if (slot) { slot.hidden = false; $('[data-ps-settings-page]', settingsPop).appendChild(slot); }
    else { $('[data-ps-settings-page]', settingsPop).innerHTML = '<div class="ps-settings-page-empty">No extra settings for this page</div>'; }

    var desktopMenu = $('#psDesktopMenu');
    if (desktopMenu) desktopMenu.addEventListener('click', function () { openMenu(true); });
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
    if (on) $$('.ps-sec,.ps-links a,.psp,.ps-acct,[data-ps-pagehost] .nav', drawer).forEach(function (el, i) { el.style.setProperty('--i', Math.min(i, 14)); });
    drawer.classList.toggle('open', on); back.classList.toggle('open', on); H.classList.toggle('ps-lock', on);
    drawer.setAttribute('aria-hidden', String(!on));
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
    set('psEq', function (e) { e.classList.toggle('on', M.playing); });
    $$('[data-ps-music="play"]').forEach(function (e) { e.innerHTML = M.playing ? PAUSE_I : PLAY_I; e.classList.toggle('on', M.playing); });
    paintProg();
    keepAlive(M.want && !M.yielded && TRACKS.length > 0); setSession();
    set('psMusicBtn', function (e) { e.classList.toggle('on', M.playing); e.setAttribute('aria-label', M.playing ? 'Pause music' : 'Play music'); });
  }
  // ---------- progress bar + volume (menu player) ----------
  var seeking = false;
  function mmss(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function paintProg() {
    var bar = D.getElementById('psSeek'); if (!bar) return;
    var dur = 0, cur = 0;
    try { dur = (M.ready && M.yt && M.yt.getDuration && M.yt.getDuration()) || 0; cur = (M.ready && M.yt && M.yt.getCurrentTime && M.yt.getCurrentTime()) || 0; } catch (e) {}
    bar.disabled = !(dur > 0);
    if (!seeking) { bar.value = dur > 0 ? Math.round(Math.min(1, cur / dur) * 1000) : 0; bar.style.setProperty('--p', (dur > 0 ? Math.min(100, cur / dur * 100) : 0) + '%'); }
    var c = D.getElementById('psCur'), d = D.getElementById('psDur'); if (c) c.textContent = mmss(seeking ? bar.value / 1000 * dur : cur); if (d) d.textContent = dur > 0 ? mmss(dur) : '0:00';
  }
  function bindProg() {
    var bar = D.getElementById('psSeek'), vol = D.getElementById('psVol');
    if (bar) {
      bar.addEventListener('input', function () { seeking = true; bar.style.setProperty('--p', (bar.value / 10) + '%'); paintProg(); });
      bar.addEventListener('change', function () { try { var dur = M.yt.getDuration(); if (dur > 0) M.yt.seekTo(bar.value / 1000 * dur, true); } catch (e) {} seeking = false; paintProg(); });
    }
    if (vol) {
      var v = parseInt(LS.get('pasiya_vol') || '80', 10); if (isNaN(v)) v = 80; vol.value = v; vol.style.setProperty('--p', v + '%');
      vol.addEventListener('input', function () { LS.set('pasiya_vol', vol.value); vol.style.setProperty('--p', vol.value + '%'); applyVol(); });
    }
    setInterval(function () { if (!D.hidden && D.getElementById('psd') && D.getElementById('psd').classList.contains('open')) paintProg(); }, 500);
  }
  function applyVol() { try { var v = parseInt(LS.get('pasiya_vol') || '80', 10); if (M.yt && M.yt.setVolume) M.yt.setVolume(isNaN(v) ? 80 : v); } catch (e) {} }

  // ---------- background playback: keep the song going when the person leaves the tab / app / locks the phone ----------
  var KEEP = null, KEEP_URL = '';
  function keepWav() { // 10 s mono 16-bit, 8 kHz: a 30 Hz tone at about -60 dB (inaudible, but not "silent" so the browser keeps the media session alive)
    var sr = 8000, n = sr * 10, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
    var w = function (o, t) { for (var k = 0; k < t.length; k++) v.setUint8(o + k, t.charCodeAt(k)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 30 * i / sr) * 40), true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function keepAlive(on) { if (M.native) return; // runs for as long as the person wants music (NOT only while YouTube reports "playing"), otherwise the phone freezes the page the moment YouTube pauses in the background
    try {
      if (!KEEP) { KEEP = D.createElement('audio'); KEEP.loop = true; KEEP.preload = 'auto'; KEEP.setAttribute('playsinline', ''); KEEP.setAttribute('aria-hidden', 'true'); KEEP_URL = keepWav(); KEEP.src = KEEP_URL; KEEP.volume = 1; }
      if (on) { if (KEEP.paused) { var pr = KEEP.play(); if (pr && pr.catch) pr.catch(function () {}); } } else if (!KEEP.paused) KEEP.pause();
    } catch (e) {}
  }
  function resumeIfWanted() { if (M.yielded) return; if (M.ready && M.want && !M.playing && TRACKS.length && M.fails < TRACKS.length) { try { M.yt.playVideo(); } catch (e) {} } }
  function setSession() { // lock-screen / notification controls (Android, iOS, desktop)
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: trackName(), artist: 'PASIYA OFC', album: 'Cyber Ecosystem', artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] });
      navigator.mediaSession.playbackState = (M.playing || (M.want && D.hidden)) ? 'playing' : 'paused';
    } catch (e) {}
  }
  function bindSession() {
    if (!('mediaSession' in navigator)) return;
    var h = function (a, f) { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) {} };
    h('play', function () { plWant(true); LS.set('pasiya_owner', M.tab); resumeIfWanted(); });
    h('pause', function () { plWant(false); try { M.yt.pauseVideo(); } catch (e) {} });
    h('nexttrack', function () { plWant(true); plGo(M.i + 1); });
    h('previoustrack', function () { plWant(true); plGo(M.i - 1); });
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
  // Real background play: put mp3 files in /public/music and list them in /public/music/tracks.json  ->  [{ "title": "Song", "url": "/music/song.mp3" }]
  // ("on": false on a song = switched off from /music-admin.) Those songs play through a normal <audio> element (works with the screen off / other apps open). With no list, the YouTube playlist from /api/music is used.
  function loadLocal() { // resolves null = no local list (use YouTube); otherwise the songs that are switched ON (can be empty = everything off)
    return fetch('/music/tracks.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var l = (Array.isArray(d) ? d : (d && d.tracks)) || [];
      l = l.filter(function (t) { return t && typeof t.url === 'string' && /^(\/|https:\/\/)/.test(t.url); });
      if (!l.length) return null;
      return l.filter(function (t) { return t.on !== false; }).map(function (t) { return { id: t.url, title: t.title || '', url: t.url }; });
    }).catch(function () { return null; });
  }
  function loadMusic() {
    return loadLocal().then(function (loc) {
      if (loc) { M.native = true; applyTracks(loc); return; } // [] here = every song switched off -> silence, not YouTube
      return fetch('/api/music', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { if (d && Array.isArray(d.tracks)) applyTracks(d.tracks); });
    }).catch(function () {}).then(function () {
      var first = !M.loaded; M.loaded = true;
      if (first) { // continue the same song at the same place if the previous page was playing a moment ago
        try {
          var s = JSON.parse(LS.get('pasiya_mpos') || 'null'), ix = s ? TRACKS.findIndex(function (t) { return t.id === s.id; }) : -1;
          if (ix >= 0) { M.i = ix; M.start = (s.p && Date.now() - s.at < 20000) ? Math.max(0, Math.floor(s.t + (Date.now() - s.at) / 1000)) : 0; }
        } catch (e) {}
      }
      if (M.native && !M.yt) initPlayer(); else if (M.pendingInit) { M.pendingInit(); M.pendingInit = null; }
    });
  }
  function initNative(ev) { // same player interface as YT.Player, driven by an <audio> element
    var a = D.createElement('audio'); a.preload = 'auto'; a.setAttribute('playsinline', ''); a.style.display = 'none'; D.body.appendChild(a); M.audio = a;
    var ad = {
      playVideo: function () { var p = a.play(); if (p && p.catch) p.catch(function () { M.blocked = true; plRender(); }); },
      pauseVideo: function () { a.pause(); }, stopVideo: function () { a.pause(); a.removeAttribute('src'); },
      getCurrentTime: function () { return a.currentTime || 0; }, getVideoData: function () { return { title: '' }; },
      getDuration: function () { return isFinite(a.duration) ? a.duration : 0; }, seekTo: function (s) { try { a.currentTime = s; } catch (e) {} }, setVolume: function (v) { a.volume = Math.max(0, Math.min(1, v / 100)); },
      loadVideoById: function (u) { a.src = u; ad.playVideo(); }, cueVideoById: function (u) { a.src = u; }
    };
    M.yt = ad;
    a.addEventListener('playing', function () { ev.onStateChange({ data: 1 }); });
    a.addEventListener('pause', function () { if (!a.ended) ev.onStateChange({ data: 2 }); });
    a.addEventListener('ended', function () { ev.onStateChange({ data: 0 }); });
    a.addEventListener('error', function () { ev.onError(); });
    var t = TRACKS[M.i]; if (t) { a.src = t.id; if (M.start) a.addEventListener('loadedmetadata', function () { try { a.currentTime = M.start; } catch (e) {} }, { once: true }); }
    ev.onReady();
  }
  function initPlayer() {
    if (M.yt) return;
    var ev = {
      onReady: function () { M.ready = true; applyVol(); if (M.want && TRACKS.length) { try { M.yt.playVideo(); } catch (e) {} setTimeout(function () { if (!M.playing && M.want) { M.blocked = true; plRender(); } }, 2000); } plRender(); },
      onAutoplayBlocked: function () { M.blocked = true; plRender(); },
      onStateChange: function (e) {
        if (e.data === 1) { M.playing = true; M.yielded = false; M.blocked = false; M.fails = 0; LS.set('pasiya_owner', M.tab); try { var t = M.yt.getVideoData().title; if (t && TRACKS[M.i]) M.titles[TRACKS[M.i].id] = t; } catch (x) {} }
        else if (e.data === 2 || e.data === 5) { M.playing = false; if (e.data === 2 && D.hidden && M.want) setTimeout(resumeIfWanted, 250); }
        else if (e.data === 0) { M.playing = false; plGo(M.i + 1); }
        plRender(); plSave();
      },
      onError: function () { M.playing = false; if (++M.fails < TRACKS.length) plGo(M.i + 1); else plRender(); }
    };
    if (M.native) { initNative(ev); return; }
    if (!D.getElementById('ytWrap')) { var w = D.createElement('div'); w.id = 'ytWrap'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = '<div id="ytHost"></div>'; D.body.appendChild(w); }
    M.yt = new YT.Player('ytHost', { width: 200, height: 200, videoId: (TRACKS[M.i] || {}).id, playerVars: { autoplay: M.want ? 1 : 0, controls: 0, playsinline: 1, rel: 0, disablekb: 1, fs: 0, start: M.start || 0, origin: location.origin }, events: ev });
  }
  function bootMusic() {
    D.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('#psPlay,#psMusicBtn,#psNext,#psPrev'); if (!t) return;
      if (t.id === 'psNext') { plWant(true); plGo(M.i + 1); } else if (t.id === 'psPrev') { plWant(true); plGo(M.i - 1); } else plToggle();
    });
    var kick = function () { if (M.want && TRACKS.length) keepAlive(true); if (M.ready && M.want && !M.playing && TRACKS.length) { M.yielded = false; try { M.yt.playVideo(); } catch (e) {} } };
    // browsers only allow sound after a real gesture: pointerdown / touchstart do NOT count, the "up" / click events do, so listen to all of them (the first tap, scroll-tap or key starts the music at once)
    ['pointerdown', 'pointerup', 'mouseup', 'touchstart', 'touchend', 'click', 'keydown'].forEach(function (ev) { addEventListener(ev, kick, { passive: true, capture: true }); });
    addEventListener('load', function () { setTimeout(kick, 300); setTimeout(kick, 2500); }); // try once more when the page + loader finished (works where the browser allows autoplay)
    bindSession(); bindProg();
    // leaving the page / app and coming back: carry on (the browser often pauses embedded players in the background)
    D.addEventListener('visibilitychange', function () { setTimeout(resumeIfWanted, D.hidden ? 300 : 0); setSession(); });
    // while the app/browser is in the background the embedded player is often paused by the phone: keep nudging it (only if the person never pressed pause)
    setInterval(function () { if (D.hidden && M.want && M.ready && !M.playing && !M.yielded && TRACKS.length) { keepAlive(true); resumeIfWanted(); } }, 1500);
    addEventListener('pageshow', function () { setTimeout(resumeIfWanted, 0); });
    addEventListener('focus', function () { setTimeout(resumeIfWanted, 0); });
    // only one tab plays at a time
    addEventListener('storage', function (e) { if (e.key === 'pasiya_owner' && e.newValue && e.newValue !== M.tab && M.playing) { M.yielded = true; try { M.yt.pauseVideo(); } catch (x) {} } });
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
    if (ROLE === 'ai') { var old = $('#ps-footer'); if (old) old.remove(); return; } // PASIYA AI is a full-screen app: no footer (other sites keep theirs)
    var el = $('#ps-footer');
    if (!el) { el = D.createElement('footer'); el.id = 'ps-footer'; D.body.appendChild(el); }
    var soc = SOCIAL.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener" aria-label="' + esc(s[0]) + '">' + ico(s[2]) + '</a>'; }).join('');
    el.className = 'ps-footer';
    el.innerHTML = '<div class="brand"><span class="logo">' + logo('psLgFoot') + '</span><div><b>PASIYA <em>OFC</em></b><span class="ps-up" id="psUp"><i></i>checking\u2026</span></div></div>' +
      '<p>Pasidu Eshan\'s home for the free PASIYA API, past papers, WhatsApp bot, QR editor and AI tools. One login works everywhere.</p>' +
      '<div class="ps-info"><a href="' + WA + '" target="_blank" rel="noopener"><span class="bx">' + ico('chat') + '</span>WhatsApp support</a><div><span class="bx">' + ico('globe') + '</span>' + esc(location.host) + '</div><div><span class="bx">' + ico('pin') + '</span>Sri Lanka \ud83c\uddf1\ud83c\uddf0</div><div><span class="bx">' + ico('clock') + '</span>24/7 Global Support</div></div>' +
      (soc ? '<div class="ps-social">' + soc + '</div>' : '') +
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

  function renderAll() { renderDots(); renderSites(); renderAccount(); renderAdmin(); renderAccountLinks(); if (P.refreshSettings) P.refreshSettings(); }
  function start() {
    H.dataset.psRole = ROLE;
    H.dataset.accent = LS.get('pasiya_accent') || LS.get('pasiya_def_accent') || H.dataset.accent || 'red'; loadDefaultAccent();
    // one pro font on every site: Plus Jakarta Sans (headings + body) with Inter as the fallback
    if (!$('link[href*="Plus+Jakarta+Sans"]')) { var l = D.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap'; D.head.appendChild(l); }
    if (!window.__psReveal && ROLE !== 'ofc') { var rv = D.createElement('script'); rv.src = '/_pasiya/reveal.js'; rv.defer = true; D.head.appendChild(rv); }
    updateFavicon(); bootBg(); buildChrome(); renderAll(); tick(); setInterval(tick, 1000); bootMusic(); renderFooter();
    fetch('/api/config').then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) { P.cfg = c || {}; renderAll(); });
    bootAuth();
    fixTops(); setTimeout(fixTops, 900); setTimeout(fixTops, 3000); addEventListener('resize', fixTops);
  }
  P.setAccent = setAccent; P.applyDefaultAccent = applyDefaultAccent; P.render = renderAll; P.openMenu = openMenu;
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
