// functions/api/getAutoUpdateAllJuzMur.js
import { ok, serverErr, str } from "./_utils";

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const url   = new URL(ctx.request.url);
    const kelas = str(url.searchParams.get("kelas")).trim();

    const stmt = kelas
      ? db.prepare(
          `SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt
             FROM auto_ranges
            WHERE kind='mur' AND kelas=?1
            ORDER BY kelas`
        ).bind(kelas)
      : db.prepare(
          `SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt
             FROM auto_ranges
            WHERE kind='mur'
            ORDER BY kelas`
        );

    const rows = await stmt.all();
    return ok(rows.results || []);
  } catch (e) {
    return serverErr(e.message || e);
  }
}
