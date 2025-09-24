// functions/api/aksesAutoUpdateAllJuzMur.js
import { ok, bad, serverErr, str } from "./_utils";

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

export async function onRequestPost(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const body = await ctx.request.json();
    const kelas    = str(body?.kelas).trim();
    const fromDate = str(body?.fromDate).trim(); // YYYY-MM-DD (boleh kosong)
    const toDate   = str(body?.toDate).trim();   // YYYY-MM-DD (boleh kosong)
    if (!kelas) return bad("kelas wajib.");

    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO auto_ranges (kelas, kind, from_date, to_date, updated_at)
       VALUES (?1, 'mur', ?2, ?3, ?4)
       ON CONFLICT(kelas, kind)
       DO UPDATE SET
         from_date = excluded.from_date,
         to_date   = excluded.to_date,
         updated_at= excluded.updated_at`
    ).bind(kelas, fromDate, toDate, now).run();

    // kembalikan baris terbaru untuk verifikasi cepat di client
    const latest = await db.prepare(
      `SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt
         FROM auto_ranges
        WHERE kind='mur' AND kelas=?1`
    ).bind(kelas).all();

    return ok({ success: true, item: (latest.results || [])[0] || null });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
