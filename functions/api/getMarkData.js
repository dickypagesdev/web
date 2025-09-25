import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getMarkData.js  (alias: /api/getData)
// GET /api/getData?kelas=kelas_01&tanggal=YYYY-MM-DD
// Return: array items untuk tanggal tsb, [] jika tidak ada
// ENV: GITHUB_TOKEN — fallback ke MTQ_TOKEN

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
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")     return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas")   || "";
  const tanggal    = url.searchParams.get("tanggal") || "";

  if (!kelasParam || !isDate(tanggal)) {
    return json({ error: "Query ?kelas & ?tanggal (YYYY-MM-DD) wajib & valid." }, 400);
  }

  const kelas = normKelas(kelasParam);
  const filePath = `${ABS_DIR}/${kelas}.json`;

  try {
    // Ambil file agregat (RAW fallback)
    const { exists, data } = await ghGetJsonAgg(token, filePath);
    if (!exists) return json([]); // belum ada → kosong

    const records = Array.isArray(data?.records) ? data.records : [];
    const rec = records.find((r) => r?.tanggal === tanggal);
    const items = Array.isArray(rec?.items) ? rec.items : [];

    return json(items);
  } catch (e) {
    return json({ error: "Gagal mengambil data", detail: String(e?.message || e) }, 502);
  }
}
