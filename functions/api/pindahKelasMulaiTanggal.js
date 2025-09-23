// functions/api/pindahKelasMulaiTanggal.js
// POST body: { kelasAsal, kelasTujuan, ids:[], nises:[], idMap:[], startDate: "YYYY-MM-DD" }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function uniqStrings(arr = []) {
  return [...new Set((arr || []).map(v => String(v || "").trim()).filter(Boolean))];
}

async function runBatches(db, stmts, chunkSize = 500) {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    const chunk = stmts.slice(i, i + chunkSize);
    await db.batch(chunk);
  }
}

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
      idMap = [],
      startDate
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

    const D1 = env.ABSENSI_DB;
    if (!D1 || typeof D1.prepare !== "function") {
      return new Response(JSON.stringify({ error: "D1 binding ABSENSI_DB tidak tersedia." }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // Kumpulan key yang bisa dipakai match (id, nis, nama-lower)
    const rawKeys  = uniqStrings([...ids, ...nises]);
    const keySet   = new Set(rawKeys);
    const nameSetL = new Set(rawKeys.map(v => v.toLowerCase()));

    // Ambil kandidat rows dari kelasAsal mulai startDate
    const sel = await D1
      .prepare(`
        SELECT id, tanggal, student_nis, student_id_text,
               LOWER(json_extract(payload_json,'$.nama')) AS nm
        FROM attendance_rows
        WHERE class_name = ?
          AND tanggal >= ?
      `)
      .bind(kelasAsal, startDate)
      .all();

    const candidates = [];
    for (const r of (sel.results || [])) {
      const rid  = String(r.student_id_text || "").trim();
      const rnis = String(r.student_nis || "").trim();
      const rnmL = String(r.nm || "");
      if (
        (rid && keySet.has(rid)) ||
        (rnis && keySet.has(rnis)) ||
        (rnmL && nameSetL.has(rnmL))
      ) {
        candidates.push(r);
      }
    }

    // Siapkan remap id (oldId -> newId) dari hasil pindah roster GitHub
    const remap = {};
    for (const m of (idMap || [])) {
      if (m && m.oldId != null && m.newId != null) {
        remap[String(m.oldId)] = String(m.newId);
      }
    }

    // Build batch statements (tanpa BEGIN/COMMIT)
    const updates = candidates.map(r => {
      const newIdTxt = remap[String(r.student_id_text || "")] ?? r.student_id_text;
      return D1.prepare(
        `UPDATE attendance_rows
           SET class_name = ?, 
               student_id_text = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(kelasTujuan, newIdTxt, r.id);
    });

    // Invalidate cache rekap (hapus totals_store utk kedua kelas)
    const invalidate = [
      D1.prepare(`DELETE FROM totals_store WHERE class_name = ?`).bind(kelasAsal),
      D1.prepare(`DELETE FROM totals_store WHERE class_name = ?`).bind(kelasTujuan),
    ];

    await runBatches(D1, updates, 400);
    await D1.batch(invalidate);

    return new Response(JSON.stringify({
      success: true,
      totalMoved: candidates.length,
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
