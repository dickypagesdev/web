import { ok, bad } from "../_lib/db.js";
export async function onRequestPost({ request, env }){
  const b=await request.json().catch(()=>null);
  const { fromClass, toClass, key } = b || {};
  if (!fromClass || !toClass || !key) return bad({ success:false, error:"fromClass, toClass, key wajib" });

  const row = await env.DB.prepare(`
    SELECT * FROM roster_v1
     WHERE class_name=? AND (student_key=? OR nis_text=? OR id_text=? OR lower(nama)=lower(?))
     LIMIT 1
  `).bind(fromClass, key, key, key, key).first();
  if (!row) return bad({ success:false, error:"Santri tidak ditemukan di kelas sumber." },404);

  // insert ke kelas baru (copy)
  await env.DB.prepare(`
    INSERT INTO roster_v1 (class_name, student_key, id_text, nis_text, nama, jenjang, semester, keterangan, meta_json, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(class_name, student_key) DO UPDATE SET
      id_text=excluded.id_text, nis_text=excluded.nis_text, nama=excluded.nama,
      jenjang=excluded.jenjang, semester=excluded.semester, keterangan=excluded.keterangan, meta_json=excluded.meta_json,
      updated_at=datetime('now')
  `).bind(toClass, row.student_key, row.id_text, row.nis_text, row.nama, row.jenjang, row.semester, row.keterangan, row.meta_json).run();

  // hapus dari kelas lama
  await env.DB.prepare(`DELETE FROM roster_v1 WHERE class_name=? AND student_key=?`).bind(fromClass, row.student_key).run();

  return ok({ success:true });
}
