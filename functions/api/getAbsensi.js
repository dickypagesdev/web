// functions/api/getAbsensi.js
import { ok, bad, serverErr, str } from "./_utils";

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const url = new URL(ctx.request.url);
    const kelas   = str(url.searchParams.get("kelas")).trim();
    const tanggal = str(url.searchParams.get("tanggal")).trim();

    if (!kelas || !tanggal) return bad("kelas & tanggal wajib.");

    const rows = await db.prepare(
      `SELECT class_name, tanggal, student_key, nama, jenjang, semester,
              payload_json, total_juz_num, total_mur_num
         FROM attendance_snapshots
        WHERE class_name=?1 AND tanggal=?2
        ORDER BY student_key`
    ).bind(kelas, tanggal).all();

    const out = [];

    for (const r of rows.results || []) {
      let p = {};
      try { p = JSON.parse(r.payload_json || "{}"); } catch {}

      // Base (tetap bawa property yang dipakai UI)
      const base = {
        id:         p.id ?? null,
        nis:        p.nis ?? null,
        nama:       r.nama ?? p.nama ?? null,
        jenjang:    r.jenjang ?? p.jenjang ?? null,
        semester:   r.semester ?? p.semester ?? null,
        tanggal:    r.tanggal,
        keterangan: p.keterangan ?? null,
        // bacaan & nilai umum
        dari:         p.dari ?? null,
        sampai:       p.sampai ?? null,
        totalJuz:     p.totalJuz ?? r.total_juz_num ?? 0,
        halaman:      p.halaman ?? null,
        totalHalaman: p.totalHalaman ?? null,
        juzTerbaca:   p.juzTerbaca ?? null,
        buttonCell:   p.buttonCell ?? null,
        marks:        p.marks ?? { audio: [] },
        // absensi flex
        absensi:            p.absensi ?? null,
        absensiItems:       p.absensiItems ?? null,
        absensiTarget:      p.absensiTarget ?? null,
        absensiChecked:     p.absensiChecked ?? null,
        absensiPercent:     p.absensiPercent ?? null,
        absensi6:           p.absensi6 ?? null,
        absensiExpanded:    p.absensiExpanded ?? null,
        absensiExpandedStr: p.absensiExpandedStr ?? null,
        // total mur kumulatif (3 sesi)
        juzmurajaah: p.juzmurajaah ?? r.total_mur_num ?? 0,
      };

      // --- Normalisasi Murajaah 3 sesi ---
      const murFlat = {};
      // 1) Ambil langsung kalau sudah flat
      for (let i = 1; i <= 3; i++) {
        murFlat[`murFrom${i}`]     = p[`murFrom${i}`] ?? null;
        murFlat[`murTo${i}`]       = p[`murTo${i}`] ?? null;
        murFlat[`murPages${i}`]    = p[`murPages${i}`] ?? null;
        murFlat[`jFrom${i}`]       = p[`jFrom${i}`] ?? null;
        murFlat[`jTo${i}`]         = p[`jTo${i}`] ?? null;
        murFlat[`juzmur${i}`]      = p[`juzmur${i}`] ?? null;
        murFlat[`murScore${i}`]    = p[`murScore${i}`] ?? null;
        murFlat[`murPredText${i}`] = p[`murPredText${i}`] ?? null;
        murFlat[`murPredHuruf${i}`]= p[`murPredHuruf${i}`] ?? null;
      }
      // 2) Fallback dari murSessions[]
      if (Array.isArray(p.murSessions)) {
        p.murSessions.slice(0, 3).forEach((s, idx) => {
          const i = idx + 1;
          murFlat[`murFrom${i}`]      ??= s?.from ?? null;
          murFlat[`murTo${i}`]        ??= s?.to ?? null;
          murFlat[`murPages${i}`]     ??= s?.pages ?? null;
          murFlat[`jFrom${i}`]        ??= s?.jFrom ?? null;
          murFlat[`jTo${i}`]          ??= s?.jTo ?? null;
          murFlat[`juzmur${i}`]       ??= s?.juz ?? null;
          murFlat[`murScore${i}`]     ??= s?.score ?? null;
          murFlat[`murPredText${i}`]  ??= s?.predikatText ?? null;
          murFlat[`murPredHuruf${i}`] ??= s?.predikatHuruf ?? null;
        });
      }
      // 3) Fallback legacy (hanya sesi-1)
      murFlat.murFrom1      ??= p.murFrom ?? null;
      murFlat.murTo1        ??= p.murTo ?? null;
      murFlat.murPages1     ??= p.murPages ?? null;
      murFlat.juzmur1       ??= p.juzmur1 ?? null;
      murFlat.murScore1     ??= p.murScore1 ?? null;
      murFlat.murPredText1  ??= p.murPredText1 ?? null;
      murFlat.murPredHuruf1 ??= p.murPredHuruf1 ?? null;

      out.push({
        ...base,
        ...murFlat,
        // legacy mirror (biar UI lama tetap jalan)
        murFrom:  murFlat.murFrom1,
        murTo:    murFlat.murTo1,
        murPages: murFlat.murPages1,
      });
    }

    return ok(out);
  } catch (e) {
    return serverErr(e.message || e);
  }
}
