// functions/api/pindahKelasMulaiTanggal.js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function onRequest({ request, env }) {
  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // HANYA POST
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  try {
    const body = await request.json();
    const {
      kelasAsal, kelasTujuan,
      ids = [], nises = [],
      idMap = [],
      startDate // YYYY-MM-DD wajib utk endpoint ini
    } = body || {};

    if (!kelasAsal || !kelasTujuan) {
      return new Response(JSON.stringify({ error: "kelasAsal & kelasTujuan wajib." }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    if (!startDate) {
      return new Response(JSON.stringify({ error: "startDate wajib (YYYY-MM-DD)." }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // ===== 1) Pindah roster di GitHub (FLOW LAMA) =====
    // (kalau proses ini ada di endpoint lain, lewati bagian ini)
    // TODO: panggil/mirror logika lama kamu kalau memang di sini
    // NOTE: kalau roster sudah dipindah di /api/pindahRosterKelas (dipanggil duluan dari UI),
    // bagian ini bisa di-skip.

    // ===== 2) Pindah baris absensi di D1 (FLOW BARU) =====
    const D1 = env.ABSENSI_DB;
    if (!D1 || typeof D1.prepare !== "function") {
      return new Response(JSON.stringify({ error: "D1 binding ABSENSI_DB tidak tersedia." }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // Buat set key utk cocokkan (id, nis, nama)
    const rawKeys = [
      ...new Set([
        ...ids.map(v => String(v || "").trim()),
        ...nises.map(v => String(v || "").trim()),
      ]),
    ].filter(Boolean);
    const keySet = new Set(rawKeys);
    const nameSetLower = new Set(rawKeys.map(v => v.toLowerCase()));

    // Ambil kandidat rows dari asal mulai tanggal
    const rows = await D1.prepare(`
      SELECT id, tanggal, student_nis, student_id_text,
             LOWER(json_extract(payload_json,'$.nama')) AS nm
      FROM attendance_rows
      WHERE class_name = ?
        AND tanggal >= ?
    `).bind(kelasAsal, startDate).all();

    // Filter yang match id/nis/nama
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

    // Siapkan id remap kalau ada
    const remap = {};
    for (const m of (idMap || [])) {
      if (m && m.oldId != null && m.newId != null) {
        remap[String(m.oldId)] = String(m.newId);
      }
    }

    // Update di dalam transaksi
    await D1.prepare("BEGIN").run();
    try {
      for (const r of batch) {
        const newIdTxt = remap[String(r.student_id_text || "")] ?? r.student_id_text;
        await D1.prepare(
          `UPDATE attendance_rows
             SET class_name = ?, 
                 student_id_text = ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(kelasTujuan, newIdTxt, r.id).run();
      }
      await D1.prepare("COMMIT").run();
    } catch (e) {
      await D1.prepare("ROLLBACK").run();
      throw e;
    }

    // Invalidate cache rekap kalau dipakai
    await D1.prepare(
      `DELETE FROM totals_store WHERE class_name IN (?,?)`
    ).bind(kelasAsal, kelasTujuan).run();

    return new Response(JSON.stringify({
      success: true,
      totalMoved: batch.length,
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
