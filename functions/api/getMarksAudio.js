// functions/api/getMarksAudio.js (D1)
// GET /api/getMarksAudio?kelas=K&tanggal=YYYY-MM-DD&id=123
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  const tanggal = (url.searchParams.get("tanggal") || "").trim();
  const kelas = (url.searchParams.get("kelas") || "").trim();
  if (!id || !tanggal || !kelas) {
    return new Response(JSON.stringify({ error: "Parameter 'id', 'tanggal', dan 'kelas' wajib ada." }), { status: 400, headers: { "Content-Type":"application/json", ...CORS } });
  }

  // Cari berdasarkan id_text atau nis yang sama dengan id
  const r = await env.DB.prepare(`
    SELECT nama, marks_json AS marks
    FROM harian
    WHERE kelas=? AND tanggal=? AND (id_text=? OR nis=?)
    LIMIT 1
  `).bind(kelas, tanggal, id, id).all();

  if (!r.results || !r.results.length) {
    return new Response(JSON.stringify({ error: "Santri tidak ditemukan." }), { status: 404, headers: { "Content-Type":"application/json", ...CORS } });
  }

  const row = r.results[0];
  let marks = {};
  try { marks = row.marks ? JSON.parse(row.marks) : {}; } catch { marks = {}; }

  return new Response(JSON.stringify({ nama: row.nama, marks }), { status: 200, headers: { "Content-Type":"application/json", ...CORS } });
}
