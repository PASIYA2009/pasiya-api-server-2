// Minimal Firestore REST client (no firebase SDK needed). The Google access token is signed once and reused ~55 min.
import { HttpError } from './util.js';

const enc = new TextEncoder();
const b64u = (buf) => {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

let tok = { value: null, exp: 0, pending: null, cryptoKey: null, keySrc: null };

async function mintToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT_JSON secret is missing.');
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64u(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  })));
  if (tok.keySrc !== sa.private_key) {
    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    tok.cryptoKey = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    tok.keySrc = sa.private_key;
  }
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', tok.cryptoKey, enc.encode(head + '.' + claim)));
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig })
  });
  const d = await r.json();
  if (!r.ok) throw new HttpError(503, d.error_description || 'Firebase service authentication failed.');
  tok.value = d.access_token;
  tok.exp = Date.now() + Math.max(60, (d.expires_in || 3600) - 300) * 1000;
  return tok.value;
}

// Firebase custom token (RS256, signed with the service account key). Used to carry a login to another origin (OFC site <-> workers.dev). Valid 5 minutes.
export async function customToken(env, uid) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT_JSON secret is missing.');
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON), now = Math.floor(Date.now() / 1000);
  if (tok.keySrc !== sa.private_key) {
    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    tok.cryptoKey = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    tok.keySrc = sa.private_key;
  }
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64u(enc.encode(JSON.stringify({ iss: sa.client_email, sub: sa.client_email, aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 300, uid })));
  return head + '.' + claim + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', tok.cryptoKey, enc.encode(head + '.' + claim)));
}

async function token(env) {
  if (tok.value && tok.exp > Date.now()) return tok.value;
  if (!tok.pending) tok.pending = mintToken(env).finally(() => { tok.pending = null; });
  return tok.pending;
}

// ---- value encoding ---------------------------------------------------
export function field(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(field) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, field(x)])) } };
}
export function unfield(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, unfield(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unfield);
  return null;
}
const decode = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, unfield(v)]));
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, field(v)]));

const root = (env) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
export const docName = (env, col, id) => `${root(env)}/${col}/${encodeURIComponent(id)}`;

async function call(env, method, path, body) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${root(env)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(env)}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 404) return null;
  if (r.status === 409 || d.error?.status === 'ALREADY_EXISTS') throw new HttpError(409, 'already exists');
  if (!r.ok) throw new HttpError(503, d.error?.message || 'Database error.');
  return d;
}

export async function get(env, col, id) {
  const d = await call(env, 'GET', `/${col}/${encodeURIComponent(id)}`);
  return d ? decode(d) : null;
}
export async function set(env, col, id, obj) {
  await call(env, 'PATCH', `/${col}/${encodeURIComponent(id)}`, { fields: toFields(obj) });
}
export async function add(env, col, obj) {
  const d = await call(env, 'POST', `/${col}`, { fields: toFields(obj) });
  return d.name.split('/').pop();
}
export async function query(env, col, whereField, whereValue, limit = 50) {
  const q = { structuredQuery: { from: [{ collectionId: col }], limit,
    ...(whereField ? { where: { fieldFilter: { field: { fieldPath: whereField }, op: 'EQUAL', value: field(whereValue) } } } : {}) } };
  const a = await call(env, 'POST', ':runQuery', q);
  return (a || []).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), ...decode(x.document) }));
}
export async function count(env, col) {
  const a = await call(env, 'POST', ':runAggregationQuery', {
    structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: col }] }, aggregations: [{ alias: 'n', count: {} }] }
  });
  return Number(a?.[0]?.result?.aggregateFields?.n?.integerValue || 0);
}
export async function batchGet(env, col, ids) {
  const a = await call(env, 'POST', ':batchGet', { documents: ids.map((i) => docName(env, col, i)) });
  return (a || []).filter((x) => x.found).map((x) => decode(x.found));
}

// Atomic writes in ONE request. ops: { inc: {doc:[col,id], by:{field:n}} } | { create:[col, obj] } | { createId:[col,id,obj] } | { merge:[col,id,obj] }
export async function commit(env, ops) {
  const writes = [];
  for (const op of ops) {
    if (op.inc) {
      writes.push({
        update: { name: docName(env, op.inc.doc[0], op.inc.doc[1]), fields: {} },
        updateMask: { fieldPaths: [] },
        updateTransforms: Object.entries(op.inc.by).map(([fieldPath, n]) => ({ fieldPath, increment: { integerValue: String(n) } }))
      });
    } else if (op.create) {
      const id = crypto.randomUUID().replace(/-/g, '');
      writes.push({ update: { name: docName(env, op.create[0], id), fields: toFields(op.create[1]) }, currentDocument: { exists: false } });
    } else if (op.createId) {
      // fixed id + "must not exist" precondition = atomic once-only guard (used for daily claim / spin)
      writes.push({ update: { name: docName(env, op.createId[0], op.createId[1]), fields: toFields(op.createId[2]) }, currentDocument: { exists: false } });
    } else if (op.merge) {
      const obj = op.merge[2];
      writes.push({ update: { name: docName(env, op.merge[0], op.merge[1]), fields: toFields(obj) }, updateMask: { fieldPaths: Object.keys(obj) } });
    }
  }
  await call(env, 'POST', ':commit', { writes });
}
