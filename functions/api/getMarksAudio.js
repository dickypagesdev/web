import { ok, bad } from "../_lib/db.js";
export async function onRequestGet({ request, env }){
  const u=new URL(request.url);
  const kelas=u.searchParams.get("kelas");
  const tanggal=u.searchParams.get("tanggal");
  const key=(u.searchParams.get("key")||"").trim();
  if (!kelas || !tanggal || !key) return bad({ error:"kelas,tanggal,key wajib" });

  const row = await env.DB.prepare(`
    SELECT student_key FROM roster_v1
     WHERE class_name=? AND (student_key=? OR nis_text=? OR id_text=? OR lower(nama)=lower(?))
     LIMIT 1
  `).bind(kelas, key, key, key, key).first();
  if (!row) return bad({ error:"Santri tidak ditemukan." },404);

  const rec = await env.DB.prepare(`
    SELECT payload_json FROM attendance_v2 WHERE class_name=? AND tanggal=? AND student_key=? LIMIT 1
  `).bind(kelas, tanggal, row.student_key).first();
  let marks={}, audio=[];
  if (rec?.payload_json){
    const obj = JSON.parse(rec.payload_json);
    marks = obj?.marks || {};
    audio = Array.isArray(marks.audio)? marks.audio : [];
  }
  return ok({ marks, audio });
}
