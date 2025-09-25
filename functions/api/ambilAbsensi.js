// /functions/api/ambilAbsensi.js
// Endpoint: GET /api/ambilAbsensi?kelas=01|kelas_01
import { ghGetJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const json = (s, d) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return json(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas");
  if (!kelasParam) return json(400, { error: "Parameter 'kelas' wajib diisi" });

  const kelas = normKelas(kelasParam);
  try {
    const { exists, data } = await ghGetJsonAgg(token, `absensi/${kelas}.json`);
    if (!exists) return json(200, []); // tidak ada data absensi
    const records = Array.isArray(data?.records) ? data.records : [];
    const dates = Array.from(
      new Set(records.map((r) => String(r?.tanggal || "")).filter(Boolean))
    ).sort(); // ascending
    return json(200, dates);
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
