import { ok } from "../_lib/db.js";
export async function onRequestGet({ env }){
  const { results } = await env.DB.prepare(`SELECT username, role, kelas_json, nis_json FROM users_v1 ORDER BY username`).all();
  return ok((results||[]).map(r=>({
    username:r.username,
    role:r.role||"",
    kelas: JSON.parse(r.kelas_json||"[]"),
    nis:   JSON.parse(r.nis_json||"[]")
  })));
}
