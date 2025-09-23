// functions/api/getAbsensiRange.js (D1 version)
// GET /api/getAbsensiRange?kelas=K&start=YYYY-MM-DD&end=YYYY-MM-DD
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
  const kelas = (searchParams.get("kelas") || "").trim();
  const start = (searchParams.get("start") || "").trim();
  const end   = (searchParams.get("end")   || "").trim();
  if (!kelas || !start || !end) return json({ error: "Parameter 'kelas', 'start', dan 'end' wajib diisi" }, 400);

  const sql = `
    SELECT
      tanggal,
      kelas,
      COALESCE(nis, id_text) AS key,
      nis, id_text AS id, nama, semester,
      -- total per-sesi bila diperlukan klien
      juzmur1, juzmur2, juzmur3,
      juzmurajaah AS totalJuz
    FROM harian
    WHERE kelas = ? AND tanggal >= ? AND tanggal <= ?
    ORDER BY tanggal ASC
  `;
  const r = await env.DB.prepare(sql).bind(kelas, start, end).all();
  const rows = r.results || [];
  // Bentuk agar kompatibel dengan pemrosesan klienmu (extract3, dsb.)
  const out = rows.map(it => ({
    tanggal: it.tanggal,
    kelas: it.kelas,
    id: it.id,
    nis: it.nis,
    nama: it.nama,
    semester: it.semester,
    // alias yang biasa dipakai klien
    juzmur1: Number(it.juzmur1 || 0),
    juzmur2: Number(it.juzmur2 || 0),
    juzmur3: Number(it.juzmur3 || 0),
    juzmurajaah: Number(it.totalJuz || 0),
  }));
  return json(out, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (!["GET", "OPTIONS"].includes(m)) return json({ message: "Method Not Allowed" }, 405);
}
