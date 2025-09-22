import { ok, bad, parseJSON } from "../_lib/db.js";
export async function onRequestPost({ request, env }){
  const b=await parseJSON(request);
  const { kelas, fromDate, toDate } = b || {};
  if (!kelas) return bad({ success:false, error:"kelas wajib" });
  await env.DB.prepare(`
    INSERT INTO class_ranges (class_name, from_date, to_date, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(class_name) DO UPDATE SET from_date=excluded.from_date, to_date=excluded.to_date, updated_at=datetime('now')
  `).bind(kelas, fromDate||null, toDate||null).run();
  return ok({ success:true });
}
