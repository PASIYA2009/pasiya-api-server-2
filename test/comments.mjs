// Offline test for /api/comments (mocked Firebase Auth + Firestore). Run: node test/comments.mjs
import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
import api from '../system/router.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  FIREBASE_PROJECT_ID: 'demo', FIREBASE_WEB_API_KEY: 'k', ADMIN_EMAIL: 'Boss.Owner@gmail.com',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'x@demo.iam', token_uri: 'https://oauth2.googleapis.com/token', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })
};
const USERS = { 'tok-admin': { localId: 'u-admin', email: 'bossowner@gmail.com', emailVerified: true },
  'tok-user': { localId: 'u-user', email: 'kasun@gmail.com', emailVerified: true },
  'tok-user2': { localId: 'u-user2', email: 'nimal@gmail.com', emailVerified: true },
  'tok-fake': { localId: 'u-fake', email: 'bossowner@gmail.com', emailVerified: false } }; // same address, NOT verified
const store = new Map(); let seq = 0;
const ROOT = '/v1/projects/demo/databases/(default)/documents';
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (url.includes('oauth2.googleapis.com')) return J({ access_token: 't', expires_in: 3600 });
  if (url.includes('accounts:lookup')) { const u = USERS[JSON.parse(init.body).idToken]; return u ? J({ users: [u] }) : J({ error: {} }, 400); }
  const path = decodeURIComponent(new URL(url).pathname.replace(ROOT, '')), m = init.method || 'GET';
  if (path === ':runQuery') {
    const q = JSON.parse(init.body).structuredQuery, col = q.from[0].collectionId, f = q.orderBy?.[0];
    let rows = [...store].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ document: { name: `${ROOT}/${k}`, fields: v } }));
    if (f) rows.sort((a, b) => (a.document.fields[f.field.fieldPath].stringValue).localeCompare(b.document.fields[f.field.fieldPath].stringValue) * (f.direction === 'DESCENDING' ? -1 : 1));
    return J(rows.slice(0, q.limit));
  }
  const [, col, id] = path.match(/^\/([^/]+)(?:\/(.+))?$/) || [];
  if (m === 'POST' && col && !id) { const nid = 'c' + (++seq); store.set(`${col}/${nid}`, JSON.parse(init.body).fields); return J({ name: `${ROOT}/${col}/${nid}` }); }
  if (m === 'PATCH') { store.set(`${col}/${id}`, JSON.parse(init.body).fields); return J({}); }
  if (m === 'DELETE') { store.delete(`${col}/${id}`); return J({}); }
  if (m === 'GET') { const v = store.get(`${col}/${id}`); return v ? J({ name: path, fields: v }) : J({ error: { status: 'NOT_FOUND' } }, 404); }
  return J({ error: { message: 'unmocked ' + m + ' ' + path } }, 500);
};
const call = async (path, method = 'GET', token, body) => {
  const r = await api.fetch(new Request('https://x.test' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  return { status: r.status, body: await r.json() };
};
let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`);

let r = await call('/api/comments');                                    assert.equal(r.status, 200); assert.deepEqual(r.body.comments, []); ok('empty list is public');
r = await call('/api/comments', 'POST', null, { text: 'hi' });          assert.equal(r.status, 401); ok('guest cannot post');
r = await call('/api/comments', 'POST', 'tok-user', { text: '   ' });   assert.equal(r.status, 400); ok('blank rejected');
r = await call('/api/comments', 'POST', 'tok-user', { text: 'x'.repeat(251) }); assert.equal(r.status, 400); ok('251 chars rejected');
r = await call('/api/comments', 'POST', 'tok-user', { text: 'Hello <b>site</b>\u202E!' }); assert.equal(r.status, 200);
assert.equal(r.body.comment.name, 'kasun'); assert.equal(r.body.comment.text, 'Hello <b>site</b>!'); assert.equal(r.body.comment.admin, false);
assert.ok(!('uid' in r.body.comment) && !('email' in r.body.comment)); const userCommentId = r.body.comment.id; ok('user posts (name from account, bidi stripped, no uid/email leaked)');
r = await call('/api/comments', 'POST', 'tok-user', { text: 'again' }); assert.equal(r.status, 429); ok('15 s rate limit');
r = await call('/api/comments', 'POST', 'tok-admin', { text: 'Admin here' }); assert.equal(r.status, 200); assert.equal(r.body.comment.admin, true); ok('admin comment is badged');
r = await call('/api/comments'); assert.equal(r.body.comments.length, 2); assert.equal(r.body.comments[0].text, 'Admin here'); ok('list shows both, newest first');
r = await call('/api/comments?limit=1'); assert.equal(r.body.comments.length, 1); ok('?limit=1 works');
r = await call('/api/comments/delete', 'POST', null, { id: userCommentId });          assert.equal(r.status, 401); ok('guest cannot delete');
r = await call('/api/comments/delete', 'POST', 'tok-user2', { id: userCommentId });   assert.equal(r.status, 403); ok('normal user cannot delete');
r = await call('/api/comments/delete', 'POST', 'tok-user', { id: userCommentId });    assert.equal(r.status, 403); ok('author cannot delete either (admin only)');
r = await call('/api/comments/delete', 'POST', 'tok-fake', { id: userCommentId });    assert.equal(r.status, 403); ok('admin address with UNVERIFIED e-mail is refused');
r = await call('/api/comments/delete', 'POST', 'tok-admin', { id: '../x' });          assert.equal(r.status, 400); ok('bad id rejected');
r = await call('/api/comments/delete', 'POST', 'tok-admin', { id: userCommentId });   assert.equal(r.status, 200); ok('admin deletes (gmail dots/case ignored)');
r = await call('/api/comments/delete', 'POST', 'tok-admin', { id: userCommentId });   assert.equal(r.status, 404); ok('deleting twice -> 404');
r = await call('/api/comments'); assert.equal(r.body.comments.length, 1); assert.equal(r.body.comments[0].text, 'Admin here'); ok('deleted comment is gone for everyone');
console.log(`\nall ${n} comment tests passed`);
