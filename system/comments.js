// Public comments of the OFC portfolio (shared by every visitor, stored in Firestore "comments").
//   GET  /api/comments?limit=50     -> newest first, anyone can read (no uid / e-mail is ever returned)
//   POST /api/comments  {text}      -> signed-in users only (name comes from the account, 1 comment / 15 s)
//   POST /api/comments/delete {id}  -> ADMIN only (ADMIN_EMAIL, verified e-mail)
import { HttpError, stamp, clamp } from './util.js';
import * as fs from './db.js';
import { session } from './gateway.js';

const COL = 'comments', MAX_LEN = 250, GAP_MS = 15_000;
const lastPost = new Map(); // uid -> time of the last comment (per server instance)

const readBody = async (req) => { try { return await req.json(); } catch { throw new HttpError(400, 'Body must be valid JSON.'); } };
// no control / invisible direction-override characters, no huge blank gaps
const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
  .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const shape = (c) => ({ id: c.id, name: c.name || 'User', text: c.text || '', createdAt: c.createdAt || '', admin: !!c.admin });

export async function comments(req, env, p, m) {
  if (p === '/api/comments' && m === 'GET') {
    const raw = new URL(req.url).searchParams.get('limit'); // no ?limit= must mean 50 (Number(null) is 0, which clamp would turn into 1)
    const limit = raw ? clamp(raw, 1, 100, 50) : 50;
    return { success: true, comments: (await fs.listOrdered(env, COL, 'createdAt', limit, true)).map(shape) };
  }

  if (p === '/api/comments' && m === 'POST') {
    const c = await session(req, env);
    const text = clean((await readBody(req)).text);
    if (!text) throw new HttpError(400, 'Write a comment first.');
    if (text.length > MAX_LEN) throw new HttpError(400, `Comments can be at most ${MAX_LEN} characters.`);
    const now = Date.now(), prev = lastPost.get(c.u.uid) || 0;
    if (now - prev < GAP_MS) throw new HttpError(429, `Please wait ${Math.ceil((GAP_MS - (now - prev)) / 1000)} seconds before commenting again.`);
    if (lastPost.size > 500) lastPost.clear();
    lastPost.set(c.u.uid, now);
    const name = clean(c.p.username || (c.u.email || '').split('@')[0] || 'User').slice(0, 40) || 'User';
    const doc = { uid: c.u.uid, name, text, admin: !!c.isAdmin, createdAt: stamp() };
    const id = await fs.add(env, COL, doc);
    return { success: true, comment: shape({ id, ...doc }) };
  }

  if (p === '/api/comments/delete' && m === 'POST') {
    const c = await session(req, env);
    if (!c.isAdmin) throw new HttpError(403, 'Only the admin can delete comments.');
    const id = String((await readBody(req)).id || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError(400, 'Invalid comment id.');
    if (!(await fs.get(env, COL, id))) throw new HttpError(404, 'That comment no longer exists.');
    await fs.del(env, COL, id);
    return { success: true, message: 'Comment deleted.', id };
  }

  if (p === '/api/comments' || p === '/api/comments/delete') throw new HttpError(405, 'Method not allowed.');
  return undefined;
}
