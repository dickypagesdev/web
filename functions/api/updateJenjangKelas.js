// /api/updateJenjangKelas?kelas=kelas_01  {key, jenjang}
export async function onRequest({ request, env }) {
  const u = new URL(request.url); const kelas = u.searchParams.get('kelas')||'';
  const { key, jenjang } = await request.json();
  // temukan student via nis->id fallback
  const s = await env.DB.prepare(`SELECT s.id
    FROM students s
    JOIN class_students cs ON cs.student_id=s.id
    JOIN classes c ON c.id=cs.class_id
    WHERE c.name=? AND (s.nis=? OR s.id=?)`).bind(kelas, String(key), Number(key)||-1).first();
  if(!s) return Response.json({message:'Santri tidak ditemukan'},{status:404});
  await env.DB.prepare("UPDATE students SET jenjang=? WHERE id=?").bind(String(jenjang||''), s.id).run();
  return Response.json({ success:true });
}
