import { ok, bad } from "../_lib/db.js";

export async function onRequestPost({ request, env }){
  const b = await request.json().catch(()=>null);
  const kelas=(b?.kelas||"").toString().trim();
  const key  =(b?.key  ||"").toString().trim(); // bisa NIS | ID | nama | student_key
  if (!kelas || !key) return bad({ success:false, error:"kelas & key wajib" });

  // temukan student_key sebenarnya
  const row = await env.DB.prepare(`
    SELECT student_key FROM roster_v1
     WHERE class_name=? AND (student_key=? OR nis_text=? OR id_text=? OR lower(nama)=lower(?))
     LIMIT 1
  `).bind(kelas, key, key, key, key).first();
  if (!row) return bad({ success:false, error:"Santri tidak ditemukan." }, 404);

  // hapus dari roster
  await env.DB.prepare(`DELETE FROM roster_v1 WHERE class_name=? AND student_key=?`)
    .bind(kelas, row.student_key).run();

  // opsional: hapus semua absensi santri ini
  await env.DB.prepare(`DELETE FROM attendance_v2 WHERE class_name=? AND student_key=?`)
    .bind(kelas, row.student_key).run();

  return ok({ success:true });
}
