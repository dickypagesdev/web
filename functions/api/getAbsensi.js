// functions/api/getAbsensi.js
import { ok, bad, serverErr, str } from "./_utils";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const url = new URL(ctx.request.url);
    const kelas   = str(url.searchParams.get("kelas")).trim();
    const tanggal = str(url.searchParams.get("tanggal")).trim();

    if (!kelas || !tanggal) return bad("kelas & tanggal wajib.");
    if (!ISO.test(tanggal)) return bad("format tanggal harus YYYY-MM-DD.");

    const rows = await db.prepare(
      `SELECT tanggal, payload_json
         FROM attendance_snapshots
        WHERE class_name=?1 AND tanggal=?2
        ORDER BY student_key`
    ).bind(kelas, tanggal).all();

    const list = [];
    for (const r of rows.results || []) {
      try {
        const obj = JSON.parse(r.payload_json);
        if (!obj.tanggal) obj.tanggal = r.tanggal || tanggal;
        list.push(obj);
      } catch {}
    }
    return ok({ kelas, tanggal, list });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
