import { ok } from "../_lib/db.js";
export async function onRequestGet({ env }){
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT class_name AS nama FROM roster_v1 ORDER BY class_name"
  ).all();
  return ok((results||[]).map(r=>r.nama));
}
