// POST /api/saveData
export const onRequestPost = async ({ request, env }) => {
  try {
    const { tanggal, kelas, data } = await request.json();
    if (!tanggal || !kelas || !Array.isArray(data)) {
      return new Response(JSON.stringify({ success: false, error: "tanggal, kelas, data[] wajib" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // helper: pastikan student_id
    const resolveStudentId = async (row) => {
      const nis = String(row?.nis || row?.id || "").trim();
      if (!nis) return null;

      const found = await env.DB.prepare("SELECT id FROM students WHERE nis=?").bind(nis).first();
      if (found?.id) {
        await env.DB.prepare("UPDATE students SET nama=?, kelas=? WHERE id=?")
          .bind(row?.nama || "", kelas, found.id)
          .run();
        return found.id;
      }
      const info = await env.DB.prepare("INSERT INTO students (nis,nama,kelas) VALUES (?,?,?)")
        .bind(nis, row?.nama || `NIS ${nis}`, kelas)
        .run();
      return info.meta.last_row_id;
    };

    let saved = 0;
    for (const item of data) {
      const sid = await resolveStudentId(item);
      if (!sid) continue;

      const payload = JSON.stringify(item);
      await env.DB.prepare(
        `INSERT INTO mutabaah_records (student_id,tanggal,kelas,data_json,updated_at)
         VALUES (?,?,?,?,datetime('now'))
         ON CONFLICT(student_id,tanggal)
         DO UPDATE SET kelas=excluded.kelas, data_json=excluded.data_json, updated_at=datetime('now')`
      ).bind(sid, tanggal, kelas, payload).run();

      saved++;
    }

    return new Response(JSON.stringify({ success: true, saved }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
