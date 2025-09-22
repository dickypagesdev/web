// /functions/api/pindahKelasMulaiTanggal.js
// POST body: { kelasAsal, kelasTujuan, startDate, ids?, nises?, santriIds? }
// NB: proses pindah roster di GitHub tetap di endpoint lain; ini fokus ke D1.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type":"application/json", ...CORS } });

const placeholders = (n) => Array(n).fill("?").join(",");
const uniqClean = (a=[]) => [...new Set((a||[]).map(v => String(v||"").trim()).filter(Boolean))];
const normKelas = (k) => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

function isISODate(s){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
}

async function detectTableAndCols(db){
  const t1 = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='absensi_daily'`).first();
  const t2 = !t1 ? await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='attendance'`).first() : null;
  const table = t1?.name || t2?.name;
  if (!table) throw new Error("Tabel D1 tidak ditemukan. Buat 'absensi_daily' atau 'attendance'.");

  const cols = await db.prepare(`PRAGMA table_info(${table})`).all();
  const names = new Set((cols.results||cols).map(c => c.name));

  const map = {
    table,
    colClass:   names.has("class_name")      ? "class_name"      : (names.has("kelas")      ? "kelas"      : null),
    colNis:     names.has("student_nis")     ? "student_nis"     : (names.has("nis")        ? "nis"        : null),
    colId:      names.has("student_id_text") ? "student_id_text" : (names.has("student_id") ? "student_id" : null),
    colDate:    names.has("tanggal")         ? "tanggal"         : (names.has("date")       ? "date"       : null),
  };
  if (!map.colClass) throw new Error(`Kolom kelas tidak ditemukan di ${table}. Harus 'class_name' atau 'kelas'.`);
  if (!map.colDate)  throw new Error(`Kolom tanggal tidak ditemukan di ${table}. Harus 'tanggal' atau 'date'.`);
  return map;
}

export async function onRequest(context){
  try{
    const { request, env } = context;

    if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });
    if (request.method !== "POST")   return new Response("Method Not Allowed", { status:405, headers:CORS });

    let body = {};
    try { body = await request.json(); } catch { return json(400, { error:"Body JSON tidak valid" }); }

    let { kelasAsal, kelasTujuan, startDate, ids, nises, santriIds } = body || {};
    if (!kelasAsal || !kelasTujuan) return json(400, { error:"Wajib: kelasAsal & kelasTujuan" });
    if (!startDate)                 return json(400, { error:"Wajib: startDate (format YYYY-MM-DD)" });
    if (!isISODate(startDate))      return json(400, { error:"startDate harus YYYY-MM-DD" });

    const asal   = normKelas(kelasAsal);
    const tujuan = normKelas(kelasTujuan);

    if (!env.ABSENSI_DB) {
      return json(500, { error:"Binding ABSENSI_DB tidak ada. Tambahkan D1 binding bernama ABSENSI_DB." });
    }

    const db = env.ABSENSI_DB;
    const { table, colClass, colNis, colId, colDate } = await detectTableAndCols(db);

    const idsArr   = uniqClean(ids);
    const nisesArr = uniqClean(nises);
    const legacy   = uniqClean(santriIds);
    const allIds   = uniqClean([...idsArr, ...legacy]);

    if (allIds.length === 0 && nisesArr.length === 0){
      // Tidak ada filter santri → aman tidak update apa-apa
      return json(200, { success:true, movedD1:0, touchedTotals:0, note:"Daftar id/nis kosong, tidak ada baris yang dipindah." });
    }

    // Bangun kondisi WHERE secara dinamis
    const whereParts = [`${colClass} = ?`, `${colDate} >= ?`];
    const binds = [tujuan, asal, startDate]; // catatan: tujuan dipakai di SET, asal & date di WHERE; urutan disesuaikan di bawah

    // Kita susun query terpisah untuk ID & NIS agar mudah hitung changes
    let movedD1 = 0;
    let touchedTotals = 0;

    // Update berbasis student_id_text
    if (colId && allIds.length){
      const sql = `
        UPDATE ${table}
        SET ${colClass} = ?
        WHERE ${colClass} = ?
          AND ${colDate} >= ?
          AND ${colId} IN (${placeholders(allIds.length)})
      `;
      const res = await db.prepare(sql).bind(tujuan, asal, startDate, ...allIds).run();
      movedD1 += (res.meta?.changes || 0);
    }

    // Update berbasis student_nis
    if (colNis && nisesArr.length){
      const sql = `
        UPDATE ${table}
        SET ${colClass} = ?
        WHERE ${colClass} = ?
          AND ${colDate} >= ?
          AND ${colNis} IN (${placeholders(nisesArr.length)})
      `;
      const res = await db.prepare(sql).bind(tujuan, asal, startDate, ...nisesArr).run();
      movedD1 += (res.meta?.changes || 0);
    }

    // Pindahkan cache totals_store (jika ada) — hanya jika range mu memengaruhi cache tersimpan per range.
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
    }catch(_){/* abaikan */}

    return json(200, { success:true, movedD1, touchedTotals });

  }catch(err){
    // tampilkan pesan error biar gampang debug di Network tab
    return json(500, { error: String(err?.message || err) });
  }
}
