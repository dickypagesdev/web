// /functions/api/getMarkData.js   (alias: /api/getData)
// GET /api/getMarkData?kelas=kelas_01|01&tanggal=YYYY-MM-DD
import { ghGetJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return json(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  const u = new URL(request.url);
  const kelasParam = u.searchParams.get("kelas");
  const tanggal    = u.searchParams.get("tanggal");
  if (!kelasParam || !tanggal) return json(400, { error: "Wajib: kelas & tanggal" });

  const kelas = normKelas(kelasParam);

  try {
    const { exists, data } = await ghGetJsonAgg(token, `absensi/${kelas}.json`);
    if (!exists) return json(200, []);
    const rec = (Array.isArray(data?.records) ? data.records : []).find(
      (r) => String(r?.tanggal) === String(tanggal)
    );
    return json(200, Array.isArray(rec?.items) ? rec.items : []);
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
