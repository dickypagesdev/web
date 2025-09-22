import { ok, bad, parseJSON } from "../_lib/db.js";
export async function onRequestPost({ request, env }){
  const b=await parseJSON(request);
  const { kelas, tanggal, key, fileName } = b || {};
  if (!kelas || !tanggal || !key || !fileName) return bad({ success:false, error:"kelas,tanggal,key,fileName wajib" });

  // temukan student_key nyata
  const row = await env.DB.prepare(`
    SELECT student_key FROM roster_v1
     WHERE class_name=? AND (student_key=? OR nis_text=? OR id_text=? OR lower(nama)=lower(?))
     LIMIT 1
  `).bind(kelas, key, key, key, key).first();
  if (!row) return bad({ success:false, error:"Santri tidak ditemukan." },404);

  const rec = await env.DB.prepare(`
    SELECT payload_json FROM attendance_v2 WHERE class_name=? AND tanggal=? AND student_key=? LIMIT 1
  `).bind(kelas, tanggal, row.student_key).first();

  let obj = rec?.payload_json ? JSON.parse(rec.payload_json) : {};
  obj.marks = obj.marks || {};
  obj.marks.audio = Array.isArray(obj.marks.audio) ? obj.marks.audio : [];
  if (!obj.marks.audio.includes(fileName)) obj.marks.audio.push(fileName);

  await env.DB.prepare(`
    INSERT INTO attendance_v2 (class_name, tanggal, student_key, payload_json, updated_at)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(class_name, tanggal, student_key) DO UPDATE SET payload_json=excluded.payload_json, updated_at=datetime('now')
  `).bind(kelas, tanggal, row.student_key, JSON.stringify(obj)).run();

  return ok({ success:true, audio: obj.marks.audio });
}
