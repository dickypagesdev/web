// /functions/api/ambilSantri.js
// Endpoint: GET /api/ambilSantri?kelas=1|kelas_1
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

  try {
    const kelas = normKelas(kelasParam);
    const got = await ghGetJsonAgg(token, `${kelas}.json`);
    const arr = got.exists && Array.isArray(got.data) ? got.data : [];
    return json(200, arr);
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
}
