// /functions/api/pindahKelasMulaiTanggal.js
// POST /api/pindahKelasMulaiTanggal
// Body JSON: { kelasAsal, kelasTujuan, ids?, nises?, santriIds?, startDate, idMap? }
//
// >>> POTONGAN ATAS & GITHUB SECTION SAMA DENGAN VERSI LAMA <<<

const CORS = { /* ... */ };
const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const placeholders = (n) => Array(n).fill("?").join(",");
const uniqueClean = (arr=[]) => [...new Set((arr||[]).map(v => String(v||"").trim()).filter(Boolean))];

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  // ... validasi & normalisasi input sama dgn file asli ...
  // dapatkan: asal, tujuan, startDate, arrays ids/nises/santriIds ...
  // jalankan keseluruhan proses pindah GitHub seperti file aslimu (commit src/dst) ...
  // peroleh `report` & `totalMoved`.
  // ===================================================================

  const idsArr   = uniqueClean(ids);
  const nisesArr = uniqueClean(nises);
  const legacy   = uniqueClean(santriIds);
  const allIds   = uniqueClean([...idsArr, ...legacy]);

  let movedD1 = 0, touchedTotals = 0;

  if (env.ABSENSI_DB) {
    const tx = env.ABSENSI_DB;

    // 1) D1 update dengan filter tanggal >= startDate
    if (allIds.length) {
      const sql = `
        UPDATE absensi_daily
        SET class_name = ?
        WHERE class_name = ?
          AND tanggal >= ?
          AND student_id_text IN (${placeholders(allIds.length)})
      `;
      const res = await tx.prepare(sql).bind(tujuan, asal, startDate, ...allIds).run();
      movedD1 += (res.meta?.changes || 0);
    }
    if (nisesArr.length) {
      const sql = `
        UPDATE absensi_daily
        SET class_name = ?
        WHERE class_name = ?
          AND tanggal >= ?
          AND student_nis IN (${placeholders(nisesArr.length)})
      `;
      const res = await tx.prepare(sql).bind(tujuan, asal, startDate, ...nisesArr).run();
      movedD1 += (res.meta?.changes || 0);
    }

    // 1.b (opsional) pindahkan cache agregat yang terkait rentang (jika dipakai)
    try {
      const tableExists = await tx.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='totals_store'`
      ).first();
      if (tableExists?.name === 'totals_store') {
        if (allIds.length) {
          const res1 = await tx.prepare(
            `UPDATE totals_store
             SET class_name = ?
             WHERE class_name = ?
               AND date_end >= ?
               AND student_id_text IN (${placeholders(allIds.length)})`
          ).bind(tujuan, asal, startDate, ...allIds).run();
          touchedTotals += (res1.meta?.changes || 0);
        }
        if (nisesArr.length) {
          const res2 = await tx.prepare(
            `UPDATE totals_store
             SET class_name = ?
             WHERE class_name = ?
               AND date_end >= ?
               AND student_nis IN (${placeholders(nisesArr.length)})`
          ).bind(tujuan, asal, startDate, ...nisesArr).run();
          touchedTotals += (res2.meta?.changes || 0);
        }
      }
    } catch(_){}
  }

  return json(200, {
    success: true,
    totalMoved,   // dari operasi GitHub (tidak berubah)
    movedD1,      // baris D1 yang ikut pindah kelas
    touchedTotals,
    details: report
  });
}
