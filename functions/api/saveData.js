// functions/api/saveData.js (D1 version)
// POST /api/saveData  body: { tanggal, kelas, data: [...] }
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },
});

export const onRequestOptions = () => json({}, 204);

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Body harus JSON." }, 400); }

  let { tanggal, kelas, data } = body || {};
  if (!tanggal || !kelas || !Array.isArray(data)) return json({ error: "Data tidak lengkap" }, 400);

  const stmt = env.DB.prepare(`
    INSERT INTO harian (
      kelas, tanggal, student_key, nis, id_text, nama,
      jenjang, semester, keterangan,
      absensi, absensiItems_json, absensiTarget, absensiChecked, absensiPercent,
      absensi6_json, absensiExpanded_json, absensiExpandedStr,
      dari, sampai, halaman, totalHalaman, juzTerbaca, totalJuz,
      buttonCell_json,
      murFrom, murTo, murPages,
      murFrom1, murTo1, murPages1, jFrom1, jTo1, juzmur1, murScore1, murPredText1, murPredHuruf1,
      murFrom2, murTo2, murPages2, jFrom2, jTo2, juzmur2, murScore2, murPredText2, murPredHuruf2,
      murFrom3, murTo3, murPages3, jFrom3, jTo3, juzmur3, murScore3, murPredText3, murPredHuruf3,
      murSessions_json, juzmurajaah,
      marks_json, payload_json
    ) VALUES (
      ?,?,?,?,?,?,
      ?,?,?, 
      ?,?,?,?,?,?,
      ?,?,?,?,?,?,
      ?, 
      ?,?,?,
      ?,?,?,?,?,?,?,?,?,?,
      ?,?,?,?,?,?,?,?,?,?,
      ?,?,?,?,?,?,?,?,?,?,
      ?,?,
      ?,?
    )
    ON CONFLICT(kelas, tanggal, student_key) DO UPDATE SET
      nis=excluded.nis,
      id_text=excluded.id_text,
      nama=excluded.nama,
      jenjang=excluded.jenjang,
      semester=excluded.semester,
      keterangan=excluded.keterangan,
      absensi=excluded.absensi,
      absensiItems_json=excluded.absensiItems_json,
      absensiTarget=excluded.absensiTarget,
      absensiChecked=excluded.absensiChecked,
      absensiPercent=excluded.absensiPercent,
      absensi6_json=excluded.absensi6_json,
      absensiExpanded_json=excluded.absensiExpanded_json,
      absensiExpandedStr=excluded.absensiExpandedStr,
      dari=excluded.dari,
      sampai=excluded.sampai,
      halaman=excluded.halaman,
      totalHalaman=excluded.totalHalaman,
      juzTerbaca=excluded.juzTerbaca,
      totalJuz=excluded.totalJuz,
      buttonCell_json=excluded.buttonCell_json,
      murFrom=excluded.murFrom, murTo=excluded.murTo, murPages=excluded.murPages,
      murFrom1=excluded.murFrom1, murTo1=excluded.murTo1, murPages1=excluded.murPages1, jFrom1=excluded.jFrom1, jTo1=excluded.jTo1, juzmur1=excluded.juzmur1, murScore1=excluded.murScore1, murPredText1=excluded.murPredText1, murPredHuruf1=excluded.murPredHuruf1,
      murFrom2=excluded.murFrom2, murTo2=excluded.murTo2, murPages2=excluded.murPages2, jFrom2=excluded.jFrom2, jTo2=excluded.jTo2, juzmur2=excluded.juzmur2, murScore2=excluded.murScore2, murPredText2=excluded.murPredText2, murPredHuruf2=excluded.murPredHuruf2,
      murFrom3=excluded.murFrom3, murTo3=excluded.murTo3, murPages3=excluded.murPages3, jFrom3=excluded.jFrom3, jTo3=excluded.jTo3, juzmur3=excluded.juzmur3, murScore3=excluded.murScore3, murPredText3=excluded.murPredText3, murPredHuruf3=excluded.murPredHuruf3,
      murSessions_json=excluded.murSessions_json,
      juzmurajaah=excluded.juzmurajaah,
      marks_json=excluded.marks_json,
      payload_json=excluded.payload_json,
      updated_at=datetime('now')
  `);

  // batch bind
  const toJson = (v) => (v == null ? null : JSON.stringify(v));
  const binds = data.map(item => {
    const nis = (item.nis ?? "").toString().trim();
    const id  = (item.id  ?? "").toString().trim();
    const key = nis || id || (item.student_key ?? "");
    return [
      kelas, tanggal, key, nis || null, id || null, item.nama ?? null,
      item.jenjang ?? null, item.semester ?? null, item.keterangan ?? "",
      item.absensi ?? "", toJson(item.absensiItems), item.absensiTarget ?? null, item.absensiChecked ?? null, item.absensiPercent ?? null,
      toJson(item.absensi6), toJson(item.absensiExpanded), item.absensiExpandedStr ?? "",
      item.dari ?? "", item.sampai ?? "", item.halaman ?? "", item.totalHalaman ?? "", item.juzTerbaca ?? "", item.totalJuz ?? "",
      toJson(item.buttonCell),
      item.murFrom ?? "", item.murTo ?? "", item.murPages ?? "",
      item.murFrom1 ?? "", item.murTo1 ?? "", item.murPages1 ?? "", item.jFrom1 ?? null, item.jTo1 ?? null, Number(item.juzmur1 ?? 0), item.murScore1 ?? null, item.murPredText1 ?? null, item.murPredHuruf1 ?? null,
      item.murFrom2 ?? "", item.murTo2 ?? "", item.murPages2 ?? "", item.jFrom2 ?? null, item.jTo2 ?? null, Number(item.juzmur2 ?? 0), item.murScore2 ?? null, item.murPredText2 ?? null, item.murPredHuruf2 ?? null,
      item.murFrom3 ?? "", item.murTo3 ?? "", item.murPages3 ?? "", item.jFrom3 ?? null, item.jTo3 ?? null, Number(item.juzmur3 ?? 0), item.murScore3 ?? null, item.murPredText3 ?? null, item.murPredHuruf3 ?? null,
      toJson(item.murSessions), Number(item.juzmurajaah ?? item.juzMurAll ?? 0),
      toJson(item.marks || { audio: [] }), toJson(item) // payload_json snapshot
    ];
  });

  await env.DB.batch(binds.map(b => stmt.bind(...b)));
  return json({ success: true }, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (!["POST", "OPTIONS"].includes(m)) return json({ message: "Method Not Allowed" }, 405);
}
