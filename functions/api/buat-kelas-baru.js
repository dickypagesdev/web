import { ok, bad } from "../_lib/db.js";
export async function onRequestPost({ request, env }){
  const body = await request.json().catch(()=>null);
  const nama = (body?.kelas || "").toString().trim();
  if (!nama) return bad({ success:false, error:"kelas wajib" });

  // sentinel student_key
  const key = `ROW:${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO roster_v1 (class_name, student_key, meta_json, updated_at)
    VALUES (?, ?, "{}", datetime('now'))
    ON CONFLICT(class_name, student_key) DO NOTHING
  `).bind(nama, key).run();

  return ok({ success:true, kelas:nama });
}
