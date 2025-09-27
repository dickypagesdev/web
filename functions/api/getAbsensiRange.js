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
    if (start > end) { const t = start; start = end; end = t; }

    if (!aggregate) {
      const rows = await db.prepare(
        `SELECT tanggal, payload_json
           FROM attendance_snapshots
          WHERE class_name=?1
            AND tanggal BETWEEN ?2 AND ?3
          ORDER BY tanggal, student_key`
      ).bind(kelas, start, end).all();

      const list = [];
      for (const r of rows.results || []) {
        try {
          const obj = JSON.parse(r.payload_json);
          if (!obj.tanggal) obj.tanggal = r.tanggal;
          list.push(obj);
        } catch {}
      }
      return ok({ aggregate: false, kelas, start, end, list });
    }

    // 🔧 AGGREGATE: sum nilai numerik dari kolom *_num ATAU dari JSON payload
    const rows = await db.prepare(
      `SELECT
          student_key AS key,
          SUM(
            COALESCE(
              CAST(total_juz_num AS REAL),
              CAST(json_extract(payload_json, '$.tilawahTotalJuz') AS REAL),
              CAST(json_extract(payload_json, '$.totalJuz') AS REAL),
              CAST(json_extract(payload_json, '$.total_juz') AS REAL),
              CAST(json_extract(payload_json, '$.juzTerbaca') AS REAL),
              CAST(json_extract(payload_json, '$.juz_total') AS REAL),
              0.0
            )
          ) AS totalJuz,
          SUM(
            COALESCE(
              CAST(total_mur_num AS REAL),
              CAST(json_extract(payload_json, '$.totalMur') AS REAL),
              CAST(json_extract(payload_json, '$.mur_total') AS REAL),
              0.0
            )
          ) AS totalMur
        FROM attendance_snapshots
       WHERE class_name=?1
         AND tanggal BETWEEN ?2 AND ?3
       GROUP BY student_key
       ORDER BY student_key`
    ).bind(kelas, start, end).all();

    const list = (rows.results || []).map(r => ({
      key: r.key,
      totalJuz: Number(r.totalJuz ?? 0),
      totalMur: Number(r.totalMur ?? 0),
    }));

    return ok({ aggregate: true, kelas, start, end, list });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
