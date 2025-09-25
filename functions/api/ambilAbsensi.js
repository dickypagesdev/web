import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/listTanggalKelas.js
// GET /api/listTanggal?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// ENV: GITHUB_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DIR = "absensi";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (!env.GITHUB_TOKEN)           return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start      = url.searchParams.get("start") || "";
  const end        = url.searchParams.get("end")   || "";

  if (!kelasParam) return json({ error: "Query ?kelas wajib." }, 400);

  const kelas = normKelas(kelasParam);

  // Ambil file agregat (auto RAW fallback >~0.9MB)
  const { exists, data } = await ghGetJsonAgg(env.GITHUB_TOKEN, `${DIR}/${kelas}.json`);
  if (!exists) return json([]); // belum ada → tidak ada tanggal

  const records = Array.isArray(data?.records) ? data.records : [];

  // Kumpulkan tanggal unik
  let dates = records
    .map((r) => r?.tanggal)
    .filter((d) => typeof d === "string" && d.length > 0);

  dates = Array.from(new Set(dates)).sort((a, b) => a.localeCompare(b));

  // Filter opsional by start/end
  if (isDate(start)) dates = dates.filter((d) => d >= start);
  if (isDate(end))   dates = dates.filter((d) => d <= end);

  return json(dates);
}
