import { ok } from "../_lib/db.js";
export async function onRequestGet({ env }){
  const { results } = await env.DB.prepare(`SELECT username, nis_json FROM users_v1 WHERE role='wali'`).all();
  return ok((results||[]).map(r=>({ username:r.username, nis:JSON.parse(r.nis_json||"[]") })));
}
