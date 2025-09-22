// /functions/api/pindahKelasSemuaTanggal.js
// POST /api/pindahKelasSemuaTanggal
// body: {
//   kelasAsal: "kelas_012526",
//   kelasTujuan: "kelas_99",
//   ids?: ["102016009", ...],        // optional
//   nises?: ["102016009", ...],      // optional
//   idMap?: [{oldId:"x", newId:"y"}] // optional, kalau id berubah
// }
// Env: ABSENSI_DB (D1), DEBUG? ("1" untuk detail error)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export const onRequestPost = async ({ request, env }) => {
  try {
    if (!env.ABSENSI_DB) return json({ error: "ABSENSI_DB binding belum diset." }, 500);
    const db = env.ABSENSI_DB;

    let body; try { body = await request.json(); } catch { return json({ error: "Body harus JSON." }, 400); }

    const kelasAsal   = String(body?.kelasAsal || "").trim();
    const kelasTujuan = String(body?.kelasTujuan || "").trim();
    let ids           = Array.isArray(body?.ids) ? body.ids : [];
    let nises         = Array.isArray(body?.nises) ? body.nises : [];
    const idMapArr    = Array.isArray(body?.idMap) ? body.idMap : [];

    if (!kelasAsal || !kelasTujuan) return json({ error: "kelasAsal dan kelasTujuan wajib." }, 400);

    ids   = [...new Set(ids.map(x => String(x ?? "").trim()).filter(Boolean))];
    nises = [...new Set(nises.map(x => String(x ?? "").trim()).filter(Boolean))];

    // Peta id lama → id baru (kalau tak ada, id tetap)
    const idMap = new Map();
    for (const m of idMapArr) {
      const oldId = m?.oldId != null ? String(m.oldId) : "";
      const newId = m?.newId != null ? String(m.newId) : "";
      if (oldId) idMap.set(oldId, newId || oldId);
    }

    // Helper IN (?, ?, ?)
    const makeIn = (arr) => arr.length ? `(${arr.map(() => "?").join(",")})` : "(NULL)";

    // Ambil baris kandidat di kelasAsal (semua tanggal)
    const idClause  = ids.length   ? `id IN ${makeIn(ids)}`    : "0";
    const nisClause = nises.length ? `nis IN ${makeIn(nises)}` : "0";

    const sqlSelect = `
      SELECT rowid as row_id, id, nis
      FROM absensi_rows
      WHERE kelas = ?
        AND ( ${idClause} OR ${nisClause} )
    `;
    const bind = [kelasAsal, ...ids, ...nises];
    const { results: rows } = await db.prepare(sqlSelect).bind(...bind).all();

    if (!rows?.length) return json({ success: true, totalMoved: 0, info: "Tidak ada baris yang cocok." });

    // Update per baris (karena id bisa berubah)
    const stmts = [];
    for (const r of rows) {
      const oldId = String(r.id ?? "");
      const newId = idMap.get(oldId) || oldId;
      stmts.push(
        db.prepare(`UPDATE absensi_rows SET kelas=?, id=? WHERE rowid=?`).bind(kelasTujuan, newId, r.row_id)
      );
    }
    await db.batch(stmts);

    // Invalidasi cache agregat (jika pakai)
    try {
      await db.prepare(`DELETE FROM totals_store WHERE kelas IN (?, ?)`).bind(kelasAsal, kelasTujuan).run();
    } catch (e) {
      if (env.DEBUG === "1") console.warn("warn: totals_store delete failed:", e?.message);
    }

    return json({ success: true, totalMoved: rows.length, note: "Semua tanggal dipindah dari kelasAsal ke kelasTujuan." });

  } catch (err) {
    return json({
      error: "Internal Error",
      detail: env?.DEBUG === "1" ? (err?.message || String(err)) : undefined
    }, 500);
  }
};
