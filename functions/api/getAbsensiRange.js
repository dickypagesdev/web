// functions/api/getAbsensiRange.js
import { ok, bad, serverErr, str } from "./_utils";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;

  try {
    const url   = new URL(ctx.request.url);
    const kelas = str(url.searchParams.get("kelas")).trim();
    let   start = str(url.searchParams.get("start")).trim();
    let   end   = str(url.searchParams.get("end")).trim();
    const aggregate = str(url.searchParams.get("aggregate")).trim() === "1";

    if (!kelas || !start || !end) return bad("kelas, start, end wajib.");
    if (!ISO.test(start) || !ISO.test(end)) return bad("format tanggal harus YYYY-MM-DD.");

    // pastikan start <= end
    if (start > end) { const t = start; start = end; end = t; }

    if (!aggregate) {
      // ================= NON-AGGREGATE: kembalikan snapshot harian (kompatibel UI lama) =================
      // Ambil tanggal + payload_json (nama kolom JSON bisa bervariasi -> COALESCE)
      const rows = await db.prepare(
        `SELECT
            tanggal,
            student_key,
            COALESCE(payload_json, record_json, rec, data) AS payload_json,
            -- kolom numerik opsional hasil normalisasi saat saveData
            total_juz_num,
            total_mur_num
         FROM attendance_snapshots
        WHERE class_name = ?1
          AND tanggal BETWEEN ?2 AND ?3
        ORDER BY tanggal, student_key`
      ).bind(kelas, start, end).all();

      const list = [];
      for (const r of rows.results || []) {
        // parse payload_json dengan aman
        let obj = {};
        try {
          if (typeof r.payload_json === "string") obj = JSON.parse(r.payload_json);
          else if (r.payload_json && typeof r.payload_json === "object") obj = r.payload_json;
        } catch {
          obj = {};
        }

        // Inject tanggal selalu ada (UI bergantung pada ini)
        if (!obj.tanggal) obj.tanggal = r.tanggal;

        // Inject totalJuz / juzmurajaah dari kolom numerik bila belum ada atau kosong
        // (UI menghitung dari field ini; ini membuat data lebih konsisten)
        const hasTotalJuz = obj.totalJuz != null && String(obj.totalJuz).trim() !== "";
        const hasMur      = (obj.juzmurajaah != null && String(obj.juzmurajaah).trim() !== "") ||
                            (obj.murajaah    != null && String(obj.murajaah).trim()    !== "") ||
                            (obj.mur_juz     != null && String(obj.mur_juz).trim()     !== "");
        if (!hasTotalJuz && r.total_juz_num != null) {
          obj.totalJuz = Number(r.total_juz_num);
        }
        if (!hasMur && r.total_mur_num != null) {
          obj.juzmurajaah = Number(r.total_mur_num);
        }

        list.push(obj);
      }

      // >>> SELALU bentuk { list: [...] } agar front-end bisa dinormalisasi dengan mudah
      return ok({ aggregate: false, kelas, start, end, list });
    }

    // ================= AGGREGATE: ringkas per santri (hemat payload, cepat) =================
    const rows = await db.prepare(
      `SELECT
          student_key,
          SUM(total_juz_num) AS total_juz,
          SUM(total_mur_num) AS total_mur
       FROM attendance_snapshots
      WHERE class_name = ?1
        AND tanggal BETWEEN ?2 AND ?3
      GROUP BY student_key
      ORDER BY student_key`
    ).bind(kelas, start, end).all();

    const list = (rows.results || []).map(r => ({
      key: String(r.student_key || "").trim(),
      totalJuz: Number(r.total_juz || 0),
      totalMur: Number(r.total_mur || 0),
    }));

    return ok({ aggregate: true, kelas, start, end, list });
  } catch (e) {
    return serverErr(e?.message || String(e));
  }
}
