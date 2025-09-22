import { ok, bad } from "../_lib/db.js";
export async function onRequestPost({ request, env }){
  const b=await request.json().catch(()=>null);
  const { fromClass, toClass, key, startDate } = b || {};
  if (!fromClass || !toClass || !key || !startDate) return bad({ success:false, error:"fromClass,toClass,key,startDate wajib" });

  const row = await env.DB.prepare(`
    SELECT student_key FROM roster_v1
     WHERE class_name=? AND (student_key=? OR nis_text=? OR id_text=? OR lower(nama)=lower(?))
     LIMIT 1
  `).bind(fromClass, key, key, key, key).first();
  if (!row) return bad({ success:false, error:"Santri tidak ditemukan." },404);

  // Pindahkan absensi mulai tanggal
  const { results } = await env.DB.prepare(`
    SELECT tanggal, payload_json FROM attendance_v2
     WHERE class_name=? AND student_key=? AND tanggal >= ?
  `).bind(fromClass, row.student_key, startDate).all();

  const ops=[];
  for (const r of results||[]) {
    ops.push(env.DB.prepare(
      `INSERT INTO attendance_v2 (class_name, tanggal, student_key, payload_json, updated_at)
       VALUES (?,?,?,?,datetime('now'))
       ON CONFLICT(class_name, tanggal, student_key) DO UPDATE SET payload_json=excluded.payload_json, updated_at=datetime('now')`
    ).bind(toClass, r.tanggal, row.student_key, r.payload_json));
    ops.push(env.DB.prepare(
      `DELETE FROM attendance_v2 WHERE class_name=? AND tanggal=? AND student_key=?`
    ).bind(fromClass, r.tanggal, row.student_key));
  }
  if (ops.length) await env.DB.batch(ops);

  // pindah roster (kalau belum)
  await env.DB.prepare(`
    INSERT INTO roster_v1 (class_name, student_key, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(class_name, student_key) DO NOTHING
  `).bind(toClass, row.student_key).run();

  return ok({ success:true, moved:(results||[]).length });
}
