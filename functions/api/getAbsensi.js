// functions/api/getAbsensi.js (D1 version)
// GET /api/getAbsensi?kelas=KELAS&tanggal=YYYY-MM-DD
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },
});

export const onRequestOptions = () => json({}, 204);

export async function onRequestGet({ request, env }) {
  const { searchParams } = new URL(request.url);
  const kelas   = (searchParams.get("kelas")   || "").trim();
  const tanggal = (searchParams.get("tanggal") || "").trim();
  if (!kelas || !tanggal) return json({ error: "Parameter 'kelas' dan 'tanggal' wajib diisi" }, 400);

  const sql = `
    SELECT
      kelas, tanggal, student_key,
      nis, id_text AS id, nama,
      jenjang, semester, keterangan,
      absensi, absensiItems_json, absensiTarget, absensiChecked, absensiPercent,
      absensi6_json, absensiExpanded_json, absensiExpandedStr,
      dari, sampai, halaman, totalHalaman, juzTerbaca, totalJuz,
      buttonCell_json AS buttonCell,
      murFrom, murTo, murPages,
      murFrom1, murTo1, murPages1, jFrom1, jTo1, juzmur1, murScore1, murPredText1, murPredHuruf1,
      murFrom2, murTo2, murPages2, jFrom2, jTo2, juzmur2, murScore2, murPredText2, murPredHuruf2,
      murFrom3, murTo3, murPages3, jFrom3, jTo3, juzmur3, murScore3, murPredText3, murPredHuruf3,
      murSessions_json AS murSessions,
      juzmurajaah,
      marks_json AS marks,
      payload_json
    FROM harian
    WHERE kelas = ? AND tanggal = ?
    ORDER BY
      CASE WHEN nis IS NOT NULL AND nis!='' THEN CAST(nis AS INT) ELSE NULL END ASC,
      id_text ASC
  `;
  const r = await env.DB.prepare(sql).bind(kelas, tanggal).all();
  const rows = r.results || [];
  // Parse kolom JSON agar shape sama seperti file GitHub
  const out = rows.map(x => ({
    ...x,
    buttonCell: x.buttonCell ? JSON.parse(x.buttonCell) : undefined,
    absensiItems: x.absensiItems_json ? JSON.parse(x.absensiItems_json) : undefined,
    absensi6: x.absensi6_json ? JSON.parse(x.absensi6_json) : undefined,
    absensiExpanded: x.absensiExpanded_json ? JSON.parse(x.absensiExpanded_json) : undefined,
    murSessions: x.murSessions ? JSON.parse(x.murSessions) : undefined,
    marks: x.marks ? JSON.parse(x.marks) : {},
  }));
  return json(out, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (!["GET", "OPTIONS"].includes(m)) return json({ message: "Method Not Allowed" }, 405);
}
