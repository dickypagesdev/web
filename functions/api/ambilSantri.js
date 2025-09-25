import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/ambilSantri.js
// Endpoint: GET /api/ambilSantri?kelas=1 | 01 | kelas_1 | kelas-01 | kelas_01.json
// ENV: GITHUB_TOKEN (contents:read) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const normKelasToFile = (raw = "") => {
  // Hilangkan .json, ganti '-'→'_', pastikan prefix "kelas_"
  let base = String(raw).trim();
  base = base.replace(/\.json$/i, "").replace(/-/g, "_");
  if (!/^kelas_/i.test(base)) base = `kelas_${base}`;
  return `${base}.json`; // file roster ada di ROOT repo
};

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas");
  if (!kelasParam) return json({ error: "Parameter 'kelas' wajib diisi." }, 400);

  const filePath = normKelasToFile(kelasParam); // contoh: "kelas_01.json"

  try {
    // Ambil roster (auto RAW fallback jika file besar)
    const { exists, data } = await ghGetJsonAgg(token, filePath);

    if (!exists) return json([]); // file belum ada → array kosong

    const santriData = Array.isArray(data) ? data : [];
    return json(santriData);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
}
