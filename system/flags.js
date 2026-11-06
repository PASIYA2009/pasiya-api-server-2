// Admin-controlled switches, stored in Firestore settings/features and cached ~20 s per server instance.
//   dailyEnabled / spinEnabled : show + allow the daily claim / lucky spin (normal users only)
//   disabledApis               : endpoint paths the admin switched off (hidden from the catalog, answer 503)
import * as fs from './db.js';

let mem = { v: null, exp: 0 };
export async function getFlags(env) {
  if (mem.v && mem.exp > Date.now()) return mem.v;
  let s = null;
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { s = await fs.get(env, 'settings', 'features'); } catch { if (mem.v) return mem.v; }
  }
  const v = { dailyEnabled: s?.dailyEnabled !== false, spinEnabled: s?.spinEnabled !== false, disabledApis: Array.isArray(s?.disabledApis) ? s.disabledApis.filter((x) => typeof x === 'string') : [] };
  mem = { v, exp: Date.now() + 8_000 };
  return v;
}
export const resetFlags = () => { mem = { v: null, exp: 0 }; };
