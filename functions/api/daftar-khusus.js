import { ok } from "../_lib/db.js";
export async function onRequestGet({ env }){
  const { results } = await env.DB.prepare(`SELECT username FROM users_v1 WHERE role='wali' ORDER BY username`).all();
  return ok((results||[]).map(r=>r.username));
}
