const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type":"application/json" } });

// Helper: normalisasi string aman
const s = (v) => (v==null ? "" : String(v));

export const onRequestPost = async ({ request, env }) => {
  try {
    const { tanggal, kelas, data } = await request.json();
    if (!tanggal || !kelas || !Array.isArray(data)) {
      return json({ success:false, error:"tanggal, kelas, data[] wajib" }, 400);
    }

    // Resolve/insert student_id dari NIS (dan perbarui nama/kelas bila ada)
    const resolveStudentId = async (row) => {
      const nis = s(row?.nis || row?.id).trim();   // kode kamu kadang pakai id di kolom 1
      if (!nis) return null;

      const found = await env.DB.prepare("SELECT id FROM students WHERE nis=?").bind(nis).first();
      if (found?.id) {
        await env.DB.prepare(
          "UPDATE students SET nama=COALESCE(NULLIF(?,''),nama), kelas=COALESCE(NULLIF(?,''),kelas) WHERE id=?"
        ).bind(s(row?.nama).trim(), s(kelas).trim(), found.id).run();
        return found.id;
      }
      const info = await env.DB.prepare(
        "INSERT INTO students (nis,nama,kelas) VALUES (?,?,?)"
      ).bind(nis, s(row?.nama).trim() || `NIS ${nis}`, s(kelas).trim()).run();
      return info.meta.last_row_id;
    };

    let saved = 0;
    for (const item of data) {
      if (!item) continue;
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

    return json({ success:true, saved });
  } catch (e) {
    return json({ success:false, error:String(e) }, 500);
  }
};
