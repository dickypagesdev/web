import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getAbsensi.js
// GET /api/getAbsensi?kelas=kelas_01&tanggal=YYYY-MM-DD
// Return: array items untuk tanggal tsb, [] jika tidak ada
// ENV: GITHUB_TOKEN (repo read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ABS_DIR = "absensi";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const tanggal    = url.searchParams.get("tanggal") || "";

  if (!kelasParam) return json({ error: "Query ?kelas wajib." }, 400);
  if (!isDate(tanggal)) return json({ error: "Query ?tanggal (YYYY-MM-DD) wajib & valid." }, 400);

  const kelas = normKelas(kelasParam);

  // Ambil file agregat (auto-switch RAW jika >~0.9MB)
  const { exists, data } = await ghGetJsonAgg(env.GITHUB_TOKEN, `${ABS_DIR}/${kelas}.json`);
  if (!exists) return json([]); // belum ada → kosong

  const records = Array.isArray(data?.records) ? data.records : [];
  const rec = records.find((it) => it?.tanggal === tanggal);
  const items = Array.isArray(rec?.items) ? rec.items : [];
  return json(items);
}