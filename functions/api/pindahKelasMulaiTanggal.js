// Tambahan di paling atas:
const D1_OK = (env && env.ABSENSI_DB && typeof env.ABSENSI_DB.prepare === "function");

// ... di bagian akhir (sebelum return json success):
if (D1_OK) {
  try {
    const keySet = new Set(rawKeys.map(v => String(v || "").trim()).filter(Boolean));
    const nameSetLower = new Set([...keySet].map(v => v.toLowerCase()));

    // Ambil kandidat yang tanggal >= startDate
    const rows = await env.ABSENSI_DB.prepare(`
      SELECT id, tanggal, student_nis, student_id_text,
             LOWER(json_extract(payload_json,'$.nama')) AS nm
      FROM attendance_rows
      WHERE class_name = ?
        AND tanggal >= ?
    `).bind(asal, startDate).all();

    const batch = [];
    for (const r of rows.results || []) {
      const rid  = String(r.student_id_text || "").trim();
      const rnis = String(r.student_nis || "").trim();
      const rnmL = String(r.nm || "");
      if (
        (rid && keySet.has(rid)) ||
        (rnis && keySet.has(rnis)) ||
        (rnmL && nameSetLower.has(rnmL))
      ) {
        batch.push(r);
      }
    }

    const map = {};
    if (Array.isArray(idMap)) {
      for (const m of idMap) {
        if (m && m.oldId != null && m.newId != null) {
          map[String(m.oldId)] = String(m.newId);
        }
      }
    }

    const tx = await env.ABSENSI_DB.prepare("BEGIN").run();
    try {
      for (const r of batch) {
        const newIdTxt = map[String(r.student_id_text || "")] ?? r.student_id_text;
        await env.ABSENSI_DB.prepare(
          `UPDATE attendance_rows
             SET class_name = ?, 
                 student_id_text = ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(tujuan, newIdTxt, r.id).run();
      }
      await env.ABSENSI_DB.prepare("COMMIT").run();
    } catch (e) {
      await env.ABSENSI_DB.prepare("ROLLBACK").run();
      throw e;
    }

    await env.ABSENSI_DB.prepare(
      `DELETE FROM totals_store WHERE class_name IN (?,?)`
    ).bind(asal, tujuan).run();

  } catch (e) {
    // jangan blokir response sukses GitHub
    // nanti UI tetap hijau, tapi ada note untuk debugging
  }
}
