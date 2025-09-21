export async function onRequest({ request, env }) {
  const kelas = new URL(request.url).searchParams.get('kelas') || '';
  const sql = `
    SELECT s.id, s.nis, s.nama, s.semester, s.jenjang, s.keterangan
    FROM students s
    JOIN class_students cs ON cs.student_id = s.id
    JOIN classes c ON c.id = cs.class_id
    WHERE c.name = ?
    ORDER BY s.nama COLLATE NOCASE`;
  const { results } = await env.DB.prepare(sql).bind(kelas).all();
  return Response.json(results);
}
