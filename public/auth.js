// Shared by /login and /register. Firebase Auth in the browser; the server only sees the ID token.
const FIREBASE = { apiKey: 'AIzaSyCPZAmh7zUmU24aRtDvhGKXydh8DCDSaxk', authDomain: 'pasiya-api.firebaseapp.com', projectId: 'pasiya-api', storageBucket: 'pasiya-api.firebasestorage.app', messagingSenderId: '1074532195422', appId: '1:1074532195422:web:3a1f26e066ad5165e3a8cf' };
export const $ = (s) => document.querySelector(s);
const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
document.documentElement.dataset.theme = store.get('pasiya_theme') || 'dark';
const tb = $('#themeBtn'); if (tb) tb.onclick = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; store.set('pasiya_theme', t); };
for (const b of document.querySelectorAll('[data-eye]')) b.onclick = () => { const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; };

let tt; export const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2400); };
export const msg = (t, cls = 'bad') => { const m = $('#msg'); m.textContent = t; m.className = 'msg ' + cls; };
const FRIENDLY = { 'auth/invalid-credential': 'Wrong email/username or password.', 'auth/wrong-password': 'Wrong password.', 'auth/email-already-in-use': 'That email already has an account. Please log in.', 'auth/weak-password': 'Use a password with at least 8 characters.', 'auth/invalid-email': 'Enter a valid email address.', 'auth/popup-closed-by-user': 'The sign-in window was closed.', 'auth/cancelled-popup-request': 'The sign-in window was closed.', 'auth/too-many-requests': 'Too many tries. Wait a minute.', 'auth/user-not-found': 'No account with that email. Register first.', 'auth/popup-blocked': 'Allow pop-ups for this site and try again.', 'auth/unauthorized-domain': 'This domain is not allowed in Firebase yet (Authentication > Settings > Authorized domains).', 'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.', 'auth/account-exists-with-different-credential': 'This email is already registered with another method (try Google or email login).', 'auth/network-request-failed': 'Network problem. Check your connection.' };
export const friendly = (e) => FRIENDLY[e.code] || e.message || 'Something went wrong.';

export async function boot() {
  const [{ initializeApp }, A] = await Promise.all([import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js')]);
  const auth = A.getAuth(initializeApp(FIREBASE));
  return { A, auth };
}
export const api = async (path, opts = {}, user) => {
  const h = { 'Content-Type': 'application/json' };
  if (user) h.Authorization = 'Bearer ' + (await user.getIdToken());
  const r = await fetch(path, { ...opts, headers: h }); const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Request failed'), { status: r.status });
  return d;
};
export async function social(ctx) {
  try { msg('Opening Google…', ''); await ctx.A.signInWithPopup(ctx.auth, new ctx.A.GoogleAuthProvider()); done(); } catch (e) { msg(friendly(e)); }
}
export const done = () => { msg('Welcome! Opening your dashboard…', 'good'); setTimeout(() => (location.href = '/'), 600); };
export function loadConfig(cb) { fetch('/api/config').then((r) => r.json()).then(cb).catch(() => {}); }
