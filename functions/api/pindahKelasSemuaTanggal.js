// functions/api/pindahKelasSemuaTanggal.js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  try {
    const body = await request.json();
    const {
      kelasAsal, kelasTujuan,
      ids = [], nises = [],
      idMap = []
    } = body || {};

    if (!kelasAsal || !kelasTujuan) {
      return new Response(JSON.stringify({ error: "kelasAsal & kelasTujuan wajib." }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // ===== (Opsional) roster GitHub di sini bila belum dipindah di endpoint lain =====
    // TODO: panggil logika lama kalau perlu

    // ===== D1 =====
    const D1 = env.ABSENSI_DB;
    if (!D1 || typeof D1.prepare !== "function") {
      return new Response(JSON.stringify({ error: "D1 binding ABSENSI_DB tidak tersedia." }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const rawKeys = [
      ...new Set([
        ...ids.map(v => String(v || "").trim()),
        ...nises.map(v => String(v || "").trim()),
      ]),
    ].filter(Boolean);
    const keySet = new Set(rawKeys);
    const nameSetLower = new Set(rawKeys.map(v => v.toLowerCase()));

    const rows = await D1.prepare(`
      SELECT id, student_nis, student_id_text,
             LOWER(json_extract(payload_json,'$.nama')) AS nm
      FROM attendance_rows
      WHERE class_name = ?
    `).bind(kelasAsal).all();

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

    const remap = {};
    for (const m of (idMap || [])) {
      if (m && m.oldId != null && m.newId != null) {
        remap[String(m.oldId)] = String(m.newId);
      }
    }

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
