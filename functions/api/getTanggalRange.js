import { ok } from "../_lib/db.js";
export async function onRequestGet({ env }){
  const { results } = await env.DB.prepare(`
    SELECT 'ALLJUZ' AS kind, class_name AS kelas, from_date AS fromDate, to_date AS toDate FROM class_ranges
    UNION ALL
    SELECT 'MUR', class_name, from_date, to_date FROM class_ranges_mur
  `).all();
  return ok(results||[]);
}
