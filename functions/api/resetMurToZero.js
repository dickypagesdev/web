// functions/api/resetMurToZero.js
import { ok, serverErr } from "./_utils";

/**
 * Body JSON (POST):
 * {
 *   scope: "one" | "class" | "range",
 *   class_name: "kelas_012526",
 *   tanggal?: "YYYY-MM-DD",           // wajib utk 'one' & 'class'
 *   student_key?: "NIS12345",         // wajib utk 'one'; opsional utk 'range'
 *   from_date?: "YYYY-MM-DD",         // wajib utk 'range'
 *   to_date?: "YYYY-MM-DD",
 *   session?: 1 | 2 | 3               // OPSIONAL: reset hanya sesi tsb; kalau absen => reset semua sesi
 * }
 */
export async function onRequestPost(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const body = await ctx.request.json().catch(() => ({}));
    const {
      scope = "one",
      class_name,
      tanggal,
      student_key,
      from_date,
      to_date,
      session, // 1|2|3 opsional
    } = body || {};

    if (!class_name) return ok({ ok: false, error: "class_name is required" });
    if (scope === "one" && (!tanggal || !student_key)) {
      return ok({ ok: false, error: "scope 'one' membutuhkan tanggal & student_key" });
    }
    if (scope === "class" && !tanggal) {
      return ok({ ok: false, error: "scope 'class' membutuhkan tanggal" });
    }
    if (scope === "range" && (!from_date || !to_date)) {
      return ok({ ok: false, error: "scope 'range' membutuhkan from_date & to_date" });
    }

    // Build potongan json_set sesuai session (atau semua sesi jika session tidak diisi)
    const makeJsonSetFor = (i) =>
      ` '$.mur${i}.score', 0, '$.mur${i}.pages', 0, '$.mur${i}.from', NULL, '$.mur${i}.to', NULL `;

    const parts = [];
    if (session === 1 || session === 2 || session === 3) {
      parts.push(makeJsonSetFor(session));
    } else {
      parts.push(makeJsonSetFor(1), makeJsonSetFor(2), makeJsonSetFor(3));
    }

    const jsonReset = `
      json_set(
        COALESCE(NULLIF(payload_json, ''), '{}'),
        ${parts.join(",")}
      )
    `;

    let sql = `
      UPDATE attendance_snapshots
      SET
        payload_json = ${jsonReset},
        total_mur_num = 0,
        updated_at = datetime('now')
    `;
    const binds = [];

    if (scope === "one") {
      sql += ` WHERE class_name = ? AND tanggal = ? AND student_key = ?`;
      binds.push(class_name, tanggal, student_key);
    } else if (scope === "class") {
      sql += ` WHERE class_name = ? AND tanggal = ?`;
      binds.push(class_name, tanggal);
    } else if (scope === "range") {
      if (student_key) {
        sql += ` WHERE class_name = ? AND student_key = ? AND tanggal BETWEEN ? AND ?`;
        binds.push(class_name, student_key, from_date, to_date);
      } else {
        sql += ` WHERE class_name = ? AND tanggal BETWEEN ? AND ?`;
        binds.push(class_name, from_date, to_date);
      }
    } else {
      return ok({ ok: false, error: "scope tidak dikenal" });
    }

    const res = await db.prepare(sql).bind(...binds).run();

    return ok({
      ok: true,
      scope,
      session: (session === 1 || session === 2 || session === 3) ? session : "all",
      changes: res.meta?.changes ?? 0
    });
  } catch (e) {
    return serverErr(e.message || String(e));
  }
}
