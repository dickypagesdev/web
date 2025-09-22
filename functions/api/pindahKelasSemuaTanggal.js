// /functions/api/pindahKelasSemuaTanggal.js
// POST body: { kelasAsal, kelasTujuan, ids?, nises?, santriIds?, idMap? }
// NB: Bagian GitHub kamu tetap—letakkan patch D1 ini SETELAH proses GitHub selesai.

// ===== util ringkas =====
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type":"application/json", ...CORS } });
const placeholders = (n) => Array(n).fill("?").join(",");
const uniqueClean  = (arr=[]) => [...new Set((arr||[]).map(v => String(v||"").trim()).filter(Boolean))];

async function detectTableAndCols(db){
  // cari tabel absensi harian yang ada
  const t1 = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='absensi_daily'`).first();
  const t2 = !t1 ? await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='attendance'`).first() : null;
  const table = t1?.name || t2?.name;
  if(!table) throw new Error("Tabel D1 tidak ditemukan. Harus ada 'absensi_daily' atau 'attendance'.");

  // ambil kolom
  const cols = await db.prepare(`PRAGMA table_info(${table})`).all();
  const names = new Set((cols.results||cols).map(c => c.name));
  // toleransi nama kolom berbeda
  const has = (n) => names.has(n);

  const map = {
    table,
    colClass: has("class_name") ? "class_name" : (has("kelas") ? "kelas" : null),
    colNis:   has("student_nis") ? "student_nis" : (has("nis") ? "nis" : null),
    colId:    has("student_id_text") ? "student_id_text" : (has("student_id") ? "student_id" : null),
    colDate:  has("tanggal") ? "tanggal" : (has("date") ? "date" : null),
  };
  if(!map.colClass) throw new Error(`Kolom kelas tidak ditemukan di ${table}. Butuh 'class_name' atau 'kelas'.`);
  // colDate tidak dipakai di "SemuaTanggal", jadi boleh null.
  return map;
}

export async function onRequest(context){
  try{
    const { request, env } = context;

    if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });
    if (request.method !== "POST")   return new Response("Method Not Allowed", { status:405, headers:CORS });

    // ======= ambil body
    let body = {};
    try { body = await request.json(); } catch { return json(400,{ error:"Body JSON tidak valid" }); }
    let { kelasAsal, kelasTujuan, ids, nises, santriIds, idMap } = body || {};
    if(!kelasAsal || !kelasTujuan) return json(400,{ error:"Wajib: kelasAsal & kelasTujuan" });

    const asal   = String(kelasAsal).startsWith("kelas_") ? String(kelasAsal)   : `kelas_${kelasAsal}`;
    const tujuan = String(kelasTujuan).startsWith("kelas_") ? String(kelasTujuan) : `kelas_${kelasTujuan}`;

    // ======== (BAGIAN GITHUB MU TETAP DI SINI) ========
    //  ... pindah roster di GitHub seperti file aslimu ...
    //  ... hitung totalMoved dan report persis sebelumnya ...
    // >>> pastikan variabel berikut terisi seperti biasa:
    const totalMoved = body._mockTotalMoved ?? 0; // <-- hanya placeholder; hapus baris ini di file asli
    const report     = { github: "OK" };          // <-- hanya placeholder; hapus baris ini di file asli
    // ==================================================

    // ======== PATCH D1 ========
    let movedD1 = 0, touchedTotals = 0;

    // daftarkan id/nis
    const idsArr   = uniqueClean(ids);
    const nisesArr = uniqueClean(nises);
    const legacy   = uniqueClean(santriIds);
    const allIds   = uniqueClean([...idsArr, ...legacy]);

    if (!env.ABSENSI_DB) {
      // Tidak fatal: repo GitHub tetap pindah. Tapi kasih info ke client.
      return json(200, { success:true, note:"ABSENSI_DB tidak dikonfigurasi", totalMoved, movedD1:0, touchedTotals:0, details:report });
    }

    const db = env.ABSENSI_DB;
    const meta = await detectTableAndCols(db);
    const { table, colClass, colNis, colId } = meta;

    // kalau kosong semua, tidak usah update D1
    if (allIds.length === 0 && nisesArr.length === 0) {
      return json(200, { success:true, totalMoved, movedD1:0, touchedTotals:0, details:report });
    }

    // Update berdasarkan student_id_text (atau aliasnya)
    if (colId && allIds.length){
      const sql = `
        UPDATE ${table}
        SET ${colClass} = ?
        WHERE ${colClass} = ?
          AND ${colId} IN (${placeholders(allIds.length)})
      `;
      const res = await db.prepare(sql).bind(tujuan, asal, ...allIds).run();
      movedD1 += (res.meta?.changes || 0);
    }

    // Update berdasarkan student_nis (atau aliasnya)
    if (colNis && nisesArr.length){
      const sql = `
        UPDATE ${table}
        SET ${colClass} = ?
        WHERE ${colClass} = ?
          AND ${colNis} IN (${placeholders(nisesArr.length)})
      `;
      const res = await db.prepare(sql).bind(tujuan, asal, ...nisesArr).run();
      movedD1 += (res.meta?.changes || 0);
    }

    // (Opsional) pindahkan cache totals_store bila ada
    try{
      const t = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='totals_store'`).first();
      if (t?.name === 'totals_store') {
        if (allIds.length){
          const r1 = await db.prepare(
            `UPDATE totals_store SET class_name=? WHERE class_name=? AND student_id_text IN (${placeholders(allIds.length)})`
          ).bind(tujuan, asal, ...allIds).run();
          touchedTotals += (r1.meta?.changes || 0);
        }
        if (nisesArr.length){
          const r2 = await db.prepare(
            `UPDATE totals_store SET class_name=? WHERE class_name=? AND student_nis IN (${placeholders(nisesArr.length)})`
          ).bind(tujuan, asal, ...nisesArr).run();
          touchedTotals += (r2.meta?.changes || 0);
        }
      }
    }catch(_){/* biarkan diam */ }

    return json(200, {
      success: true,
      totalMoved,     // dari proses GitHub (tidak berubah)
      movedD1,        // baris di D1 yang tergeser kelasnya
      touchedTotals,  // entri cache yang ikut pindah (jika ada)
      details: report
    });
  }catch(err){
    // Kembalikan pesan error agar gampang dilihat di Network tab
    return json(500, { error: String(err?.message || err) });
  }
}
