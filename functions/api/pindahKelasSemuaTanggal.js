// /functions/api/pindahKelasSemuaTanggal.js
// POST { kelasAsal, kelasTujuan, nises? | ids? | santriIds? }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const toArr = (v) => Array.isArray(v) ? v
  : (v === undefined || v === null || v === '') ? []
  : [v];

const normKelas = (v) => {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.startsWith("kelas_") ? s : `kelas_${s}`;
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")
    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body = {};
  try { body = await request.json(); } catch {}
  const kelasAsal   = normKelas(body.kelasAsal);
  const kelasTujuan = normKelas(body.kelasTujuan);

  const idsArr   = toArr(body.ids).map(String);
  const nisesArr = toArr(body.nises).map(String);
  const legacy   = toArr(body.santriIds).map(String);

  if (!kelasAsal || !kelasTujuan)
    return new Response(JSON.stringify({ error: "kelasAsal & kelasTujuan wajib ada." }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });

  const idList  = [...idsArr, ...legacy].filter(Boolean);
  const nisList = nisesArr.filter(Boolean);

  if (idList.length === 0 && nisList.length === 0)
    return new Response(JSON.stringify({ error: "Minimal satu id/nis (ids/nises/santriIds)" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const db = env.ABSENSI_DB;

    // WHERE dinamis
    const parts = [];
    const binds = [];
    if (nisList.length) {
      parts.push(`student_nis IN (${nisList.map(() => '?').join(',')})`);
      binds.push(...nisList);
    }
    if (idList.length) {
      parts.push(`student_id_text IN (${idList.map(() => '?').join(',')})`);
      binds.push(...idList);
    }
    const whereClause = parts.length ? `AND (${parts.join(' OR ')})` : "";

    const sql = `
      UPDATE attendance_snapshots
         SET class_name = ?
       WHERE class_name = ?
         ${whereClause}
    `;
    const stmt = db.prepare(sql).bind(kelasTujuan, kelasAsal, ...binds);
    const info = await stmt.run();

    return new Response(JSON.stringify({
      success: true,
      movedSnapshots: info.changes || 0,
      from: kelasAsal,
      to: kelasTujuan,
      scope: "ALL_DATES",
      by: {
        nises: nisList.length,
        ids: idList.length
      }
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
