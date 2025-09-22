// /functions/api/pindahKelasMulaiTanggal.js
// POST /api/pindahKelasMulaiTanggal
// body: { kelasAsal, kelasTujuan, ids?: string[], nises?: string[], idMap?: [{oldId,newId}], startDate: "YYYY-MM-DD" }
// Env: ABSENSI_DB (D1), DEBUG? ("1" untuk error detail)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export const onRequestPost = async ({ request, env }) => {
  try {
    if (!env.ABSENSI_DB) return json({ error: "ABSENSI_DB binding belum diset di Pages → Functions." }, 500);
    const db = env.ABSENSI_DB;

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Body harus JSON." }, 400); }

    // ========= Validasi & normalisasi input =========
    const kelasAsal    = String(body?.kelasAsal || "").trim();
    const kelasTujuan  = String(body?.kelasTujuan || "").trim();
    const startDate    = String(body?.startDate || "").trim();
    let ids            = Array.isArray(body?.ids) ? body.ids : [];
    let nises          = Array.isArray(body?.nises) ? body.nises : [];
    const idMapArr     = Array.isArray(body?.idMap) ? body.idMap : [];

    if (!kelasAsal || !kelasTujuan || !startDate) {
      return json({ error: "kelasAsal, kelasTujuan, startDate wajib ada." }, 400);
    }

    // Set → string
    ids   = [...new Set(ids.map(x => String(x ?? "").trim()).filter(Boolean))];
    nises = [...new Set(nises.map(x => String(x ?? "").trim()).filter(Boolean))];

    if (!ids.length && !nises.length) {
      // masih boleh lanjut, tapi efeknya nol; kita izinkan (biar idMap bisa dipakai tanpa ids/nises)
      // return json({ error: "Minimal salah satu dari ids/nises harus diisi." }, 400);
    }

    // petakan id lama → id baru
    const idMap = new Map();
    for (const m of idMapArr) {
      const oldId = m?.oldId != null ? String(m.oldId) : "";
      const newId = m?.newId != null ? String(m.newId) : "";
      if (oldId) idMap.set(oldId, newId || oldId);
    }

    // ========= Ambil daftar tanggal di kelasAsal sejak startDate =========
    const { results: dates } = await db.prepare(
      `SELECT DISTINCT tanggal FROM absensi_rows
       WHERE kelas = ? AND tanggal >= ?
       ORDER BY tanggal ASC`
    ).bind(kelasAsal, startDate).all();

    if (!Array.isArray(dates) || dates.length === 0) {
      return json({ success: true, info: "Tidak ada data sejak startDate.", totalMoved: 0 });
    }

    let totalMoved = 0;
    let totalDatesTouched = 0;

    // ========= Helper kecil: buat placeholder IN (?, ?, ...) dinamis =========
    const makeIn = (arr) => arr.length ? `(${arr.map(() => "?").join(",")})` : "(NULL)"; // (NULL) safe no match

    // ========= Loop per-tanggal agar aman & hemat memori =========
    for (const d of dates) {
      const tanggal = d.tanggal;

      // Ambil baris kandidat di tanggal tsb
      // Filter by id OR nis (kalau list kosong → no-match)
      const idClause  = ids.length   ? `id IN ${makeIn(ids)}`     : "0"; // 0 = false
      const nisClause = nises.length ? `nis IN ${makeIn(nises)}`  : "0";

      const sqlSelect = `
        SELECT row_id, id, nis
        FROM absensi_rows
        WHERE kelas = ?
          AND tanggal = ?
          AND ( ${idClause} OR ${nisClause} )
      `;
      const bind = [kelasAsal, tanggal, ...ids, ...nises];

      const { results: rows } = await db.prepare(sqlSelect).bind(...bind).all();
      if (!rows?.length) continue;

      // UPDATE satu per baris (kita perlu set id baru per baris)
      const statements = [];
      for (const r of rows) {
        const oldId = String(r.id ?? "");
        const newId = idMap.get(oldId) || oldId; // default tidak berubah
        statements.push(
          db.prepare(
            `UPDATE absensi_rows
             SET kelas = ?, id = ?
             WHERE row_id = ?`
          ).bind(kelasTujuan, newId, r.row_id)
        );
      }

      await db.batch(statements);
      totalMoved += rows.length;
      totalDatesTouched++;
    }

    // ========= Invalidate cache agregat (opsional) =========
    // Kalau kamu BELUM punya tabel totals_store, hapus blok ini.
    try {
      await db.prepare(`DELETE FROM totals_store WHERE kelas IN (?, ?)`).bind(kelasAsal, kelasTujuan).run();
    } catch (e) {
      if (env.DEBUG === "1") console.warn("warn: totals_store delete failed:", e?.message);
      // boleh diabaikan jika tabel belum ada.
    }

    return json({
      success: true,
      totalMoved,
      totalDatesTouched,
      note: "Baris harian dipindah ke kelas tujuan + id disesuaikan via idMap (jika ada).",
    });

  } catch (err) {
    // Saat DEBUG=1, kita expose pesan agar kamu cepat menemukan sumber masalah.
    const msg = err?.message || String(err);
    return json({
      error: "Internal Error",
      detail: (typeof msg === "string" ? msg : String(msg)),
      hint: "Set env DEBUG=1 untuk log lebih verbose di response ini.",
    }, 500);
  }
};
