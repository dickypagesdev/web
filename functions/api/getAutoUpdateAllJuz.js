import { ok } from "../_lib/db.js";
export async function onRequestGet({ env }){
  const { results } = await env.DB.prepare(`SELECT class_name AS kelas, from_date AS fromDate, to_date AS toDate FROM class_ranges`).all();
  return ok(results||[]);
}
