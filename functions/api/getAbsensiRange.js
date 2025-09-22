import { ok, bad, serverErr, str } from "./_utils";

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const url = new URL(ctx.request.url);
    const kelas = str(url.searchParams.get("kelas")).trim();
    const start = str(url.searchParams.get("start")).trim();
    const end   = str(url.searchParams.get("end")).trim();
    const aggregate = str(url.searchParams.get("aggregate")).trim() === "1";

    if (!kelas || !start || !end) return bad("kelas, start, end wajib.");

    if (!aggregate) {
      const rows = await db.prepare(
        `SELECT payload_json
         FROM attendance_snapshots
         WHERE class_name=?1 AND tanggal BETWEEN ?2 AND ?3
         ORDER BY tanggal, student_key`
      ).bind(kelas, start, end).all();

      const out = [];
      for (const r of rows.results || []) {
        try { out.push(JSON.parse(r.payload_json)); } catch {}
      }
      return ok(out);
    }

    const rows = await db.prepare(
      `SELECT student_key,
              SUM(total_juz_num) AS total_juz,
              SUM(total_mur_num) AS total_mur
       FROM attendance_snapshots
       WHERE class_name=?1 AND tanggal BETWEEN ?2 AND ?3
       GROUP BY student_key
       ORDER BY student_key`
    ).bind(kelas, start, end).all();

    const out = (rows.results || []).map(r => ({
      key: r.student_key,
      totalJuz: Number(r.total_juz || 0),
      totalMur: Number(r.total_mur || 0),
    }));
    return ok({ aggregate: true, kelas, start, end, list: out });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
