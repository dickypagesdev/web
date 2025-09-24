// functions/api/saveData.js
import {
  ok,
  bad,
  serverErr,
  str,
  parseNum,
  studentKeyOf,
  totalMurFromPayload,
} from "./_utils";

/**
 * Normalisasi struktur Murajaah agar Sesi 1–3 selalu ada di payload_json.
 * - Mengambil dari p.murSessions[i] jika tersedia
 * - Melengkapi field legacy (murFrom/murTo/murPages) ke bentuk per-sesi
 * - Memastikan nilai numerik terekam meskipun 0 (0.00 tidak hilang)
 * - Menjaga juzmurajaah konsisten (prioritas existing, fallback sum sesi 1..3)
 */
function normalizeMurPayload(p0 = {}) {
  const p = { ...p0 };

  // Ambil sumber array sesi jika ada
  const S = Array.isArray(p.murSessions) ? p.murSessions : [];

  for (let i = 1; i <= 3; i++) {
    const s = S[i - 1] || {};

    // String (boleh kosong)
    const fromStr =
      s.from ??
      p[`murFrom${i}`] ??
      (i === 1 ? p.murFrom : "") ??
      "";
    const toStr =
      s.to ??
      p[`murTo${i}`] ??
      (i === 1 ? p.murTo : "") ??
      "";
    const pagesStr =
      s.pages ??
      p[`murPages${i}`] ??
      (i === 1 ? p.murPages : "") ??
      "";

    p[`murFrom${i}`] = String(fromStr || "");
    p[`murTo${i}`] = String(toStr || "");
    p[`murPages${i}`] = String(pagesStr || "");

    // Angka (boleh nol)
    const jFrom = s.jFrom ?? p[`jFrom${i}`];
    const jTo = s.jTo ?? p[`jTo${i}`];
    const juzVal = s.juz ?? p[`juzmur${i}`] ?? p[`juzSesi${i}`];

    p[`jFrom${i}`] =
      jFrom === "" || jFrom === null || jFrom === undefined
        ? ""
        : Number(jFrom);
    p[`jTo${i}`] =
      jTo === "" || jTo === null || jTo === undefined ? "" : Number(jTo);
    p[`juzmur${i}`] = Number.isFinite(Number(juzVal))
      ? Number(Number(juzVal).toFixed(2))
      : 0;

    // Nilai / Predikat (opsional)
    const score = s.score ?? p[`murScore${i}`];
    p[`murScore${i}`] =
      score === "" || score === null || score === undefined
        ? ""
        : Number(score);
    p[`murPredText${i}`] = String(
      s.predikatText ?? p[`murPredText${i}`] ?? ""
    );
    p[`murPredHuruf${i}`] = String(
      s.predikatHuruf ?? p[`murPredHuruf${i}`] ?? ""
    );
  }

  // Total mur: pakai yang ada, jika kosong → jumlahkan 1..3
  const j1 = Number(p.juzmur1 || 0);
  const j2 = Number(p.juzmur2 || 0);
  const j3 = Number(p.juzmur3 || 0);
  if (p.juzmurajaah == null || p.juzmurajaah === "") {
    p.juzmurajaah = Number((j1 + j2 + j3).toFixed(2));
  } else {
    p.juzmurajaah = Number(Number(p.juzmurajaah).toFixed(2));
  }

  return p;
}

export async function onRequestPost(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const body = await ctx.request.json();
    const kelas = str(body?.kelas).trim();
    const tanggal = str(body?.tanggal).trim();
    const list = Array.isArray(body?.data) ? body.data : [];

    if (!kelas || !tanggal) return bad("kelas & tanggal wajib.");

    const now = new Date().toISOString();

    // Upsert D1
    const sql = `
      INSERT INTO attendance_snapshots
      (class_name, tanggal, student_key, nama, jenjang, semester, payload_json, total_juz_num, total_mur_num, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
      ON CONFLICT(class_name, tanggal, student_key)
      DO UPDATE SET
        nama = excluded.nama,
        jenjang = excluded.jenjang,
        semester = excluded.semester,
        payload_json = excluded.payload_json,
        total_juz_num = excluded.total_juz_num,
        total_mur_num = excluded.total_mur_num,
        updated_at = excluded.updated_at
    `;

    const stmt = db.prepare(sql);

    for (const pRaw of list) {
      // --- Normalisasi payload agar Sesi 1–3 tidak hilang ---
      const p = normalizeMurPayload(pRaw);

      const sKey = studentKeyOf(p);
      if (!sKey) continue; // lewati jika tidak punya kunci

      const nama = str(p?.nama).trim();
      const jenjang = str(p?.jenjang).trim();
      const semester = str(p?.semester).trim();

      const totalJuzNum = parseNum(p?.totalJuz, 0);
      const totalMurNum = totalMurFromPayload(p); // gunakan util—setelah normalisasi

      const payload_json = JSON.stringify(p);

      await stmt
        .bind(
          kelas, // 1
          tanggal, // 2
          sKey, // 3
          nama, // 4
          jenjang, // 5
          semester, // 6
          payload_json, // 7
          totalJuzNum, // 8
          totalMurNum, // 9
          now // 10
        )
        .run();
    }

    return ok({ success: true, saved: list.length });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
