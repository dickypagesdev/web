// /functions/api/pindahKelasSemuaTanggal.js
// POST /api/pindahKelasSemuaTanggal
// Body JSON: { kelasAsal, kelasTujuan, ids?, nises?, santriIds?, idMap? }
//
// NOTE: Tambahan untuk D1:
//  - binding: env.ABSENSI_DB (D1)
//  - setelah GitHub sukses, update baris D1: SET class_name = kelasTujuan
//    utk semua tanggal (no date filter).
//  - opsional: kalau ada tabel totals_store (cache agregat), ikut dipindahkan.
//
// >>> POTONGAN ATAS TETAP SAMA DENGAN VERSI LAMA <<<

const CORS = { /* ... sama seperti sebelumnya ... */ };
// ... semua helper GitHub & util kamu tetap ...

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// helper kecil untuk IN(?) dinamis
const placeholders = (n) => Array(n).fill("?").join(",");
const uniqueClean = (arr=[]) => [...new Set((arr||[]).map(v => String(v||"").trim()).filter(Boolean))];

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let payload = {};
  try { payload = await request.json(); } catch { return json(400, { error: "Body bukan JSON valid" }); }

  let { kelasAsal, kelasTujuan, ids, nises, santriIds, idMap } = payload || {};
  if (!kelasAsal || !kelasTujuan) return json(400, { error: "Wajib: kelasAsal & kelasTujuan" });

  const asal   = (String(kelasAsal).startsWith("kelas_") ? kelasAsal : `kelas_${kelasAsal}`);
  const tujuan = (String(kelasTujuan).startsWith("kelas_") ? kelasTujuan : `kelas_${kelasTujuan}`);

  // ====== BAGIAN GITHUB (TETAP SAMA PERSIS DENGAN VERSI LAMA) ======
  // ... seluruh kode lama kamu untuk scan folder absensi, baca tulis JSON,
  // ... dedup, commit asal/tujuan, hitung totalMoved ...
  // hasilkan variabel `report` dan `totalMoved` seperti sebelumnya
  // (lihat file aslinya utk detail).  <-- tidak aku ulangi penuh biar ringkas
  // ==================================================================

  // === Tambahan: sinkron D1 (absensi_daily + optional totals_store) ===
  // Konstruksi daftar key yang valid
  const idsArr   = uniqueClean(ids);
  const nisesArr = uniqueClean(nises);
  const legacy   = uniqueClean(santriIds); // alias lama
  const allIds   = uniqueClean([...idsArr, ...legacy]); // ID campur alias

  let movedD1 = 0, touchedTotals = 0;

  if (env.ABSENSI_DB) {
    // 1) Update semua baris absensi_daily tanpa filter tanggal (semua tanggal)
    //    NB: dua query terpisah: berdasarkan student_id_text dan berdasarkan student_nis
    const tx = env.ABSENSI_DB; // D1 binding

    if (allIds.length) {
      const sql = `
        UPDATE absensi_daily
        SET class_name = ?
        WHERE class_name = ?
          AND student_id_text IN (${placeholders(allIds.length)})
      `;
      const res = await tx.prepare(sql).bind(tujuan, asal, ...allIds).run();
      movedD1 += (res.meta?.changes || 0);
    }
    if (nisesArr.length) {
      const sql = `
        UPDATE absensi_daily
        SET class_name = ?
        WHERE class_name = ?
          AND student_nis IN (${placeholders(nisesArr.length)})
      `;
      const res = await tx.prepare(sql).bind(tujuan, asal, ...nisesArr).run();
      movedD1 += (res.meta?.changes || 0);
    }

    // 1.b (opsional) kalau kamu pakai cache agregat totals_store, ikut pindahkan
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
               AND student_id_text IN (${placeholders(allIds.length)})`
          ).bind(tujuan, asal, ...allIds).run();
          touchedTotals += (res1.meta?.changes || 0);
        }
        if (nisesArr.length) {
          const res2 = await tx.prepare(
            `UPDATE totals_store
             SET class_name = ?
             WHERE class_name = ?
               AND student_nis IN (${placeholders(nisesArr.length)})`
          ).bind(tujuan, asal, ...nisesArr).run();
          touchedTotals += (res2.meta?.changes || 0);
        }
      }
    } catch(_){}
  }

  return json(200, {
    success: true,
    totalMoved,         // dari GitHub (seperti sebelumnya)
    movedD1,            // baris D1 yang tergeser kelasnya
    touchedTotals,      // entri cache agregat yang ikut dipindah (jika ada)
    details: report
  });
}
