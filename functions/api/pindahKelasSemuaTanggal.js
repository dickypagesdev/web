// Tambahan di paling atas file:
const D1_OK = (env && env.ABSENSI_DB && typeof env.ABSENSI_DB.prepare === "function");

// ... di bagian akhir, setelah totalMoved & report sudah dihitung dan GitHub sukses:

// ==== D1 MOVE (semua tanggal) ====
// Pindahkan semua baris D1 dari `asal` -> `tujuan` untuk id/nis/nama yang dipilih
if (D1_OK) {
  try {
    // Kumpulan key dari payload (lihat kode asli untuk sumber ids/nises/legacy/rawKeys)
    const keySet = new Set(rawKeys.map(v => String(v || "").trim()).filter(Boolean));
    const nameSetLower = new Set([...keySet].map(v => v.toLowerCase()));

    // 1) UPDATE class_name untuk yang match by nis / id / nama (nama dari JSON)
    //    Catatan: match by nama pakai json_extract(payload_json,'$.nama') lowercase
    const rows = await env.ABSENSI_DB.prepare(`
      SELECT id, student_nis, student_id_text,
             LOWER(json_extract(payload_json,'$.nama')) AS nm
      FROM attendance_rows
      WHERE class_name = ?
    `).bind(asal).all();

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

    // 2) apply remap id jika ada
    const map = {};
    if (Array.isArray(idMap)) {
      for (const m of idMap) {
        if (m && m.oldId != null && m.newId != null) {
          map[String(m.oldId)] = String(m.newId);
        }
      }
    }

    // 3) jalankan update per-row (aman & sederhana)
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

    // 4) (opsional) invalidasi cache totals kelas asal & tujuan
    await env.ABSENSI_DB.prepare(
      `DELETE FROM totals_store WHERE class_name IN (?,?)`
    ).bind(asal, tujuan).run();

  } catch (e) {
    // jangan gagal total; laporkan saja di response
    report.push({ note: "D1 move warning: " + (e?.message || String(e)) });
  }
}
