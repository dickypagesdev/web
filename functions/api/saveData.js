export async function onRequest({ request, env }) {
  const { tanggal, kelas, data } = await request.json();
  if (!tanggal || !kelas || !Array.isArray(data)) return Response.json({message:'Bad payload'},{status:400});

  // pastikan kelas ID
  const cls = await env.DB.prepare("SELECT id FROM classes WHERE name=?").bind(kelas).first();
  if (!cls) return Response.json({message:'Kelas tidak ditemukan'},{status:404});

  // loop tiap santri (id/nis/hardening dikit)
  const tx = await env.DB.batch(data.map(obj => {
    // cari student_id by nis dulu, jatuh ke id bila ada
    const nis = String(obj.nis||'').trim();
    const sid = Number(obj.id)||null;
    const payload = JSON.stringify({ ...obj, tanggal, kelas });
    return env.DB.prepare(`
      INSERT INTO mutabaah_records (student_id, tanggal, kelas, data_json, updated_at)
      VALUES (
        COALESCE(
          (SELECT id FROM students WHERE nis = ?),
          ?
        ),
        ?, ?, ?, datetime('now')
      )
      ON CONFLICT(student_id, tanggal) DO UPDATE SET
        data_json=excluded.data_json,
        updated_at=datetime('now')
    `).bind(nis || null, sid, tanggal, kelas, payload);
  }));
  return Response.json({ success:true, upserts: tx.length });
}
