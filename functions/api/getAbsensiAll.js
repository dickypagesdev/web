import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getAbsensiAll.js
// GET /api/getAbsensiAll?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// Default: return seluruh objek agregat {meta, records}
// Jika start/end diset: hanya kembalikan subset records dalam rentang
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
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")     return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end")   || "";

  if (!kelasParam) return json({ error: "Query ?kelas wajib." }, 400);

  const kelas = normKelas(kelasParam);
  const filePath = `${ABS_DIR}/${kelas}.json`;

  // Ambil file agregat (auto RAW fallback)
  let exists = false, data = null;
  try {
    ({ exists, data } = await ghGetJsonAgg(token, filePath));
  } catch (e) {
    return json({ error: "Gagal mengambil file agregat", detail: String(e?.message || e) }, 502);
  }

  // Bentuk objek agregat default bila belum ada
  let agg = (exists && data && typeof data === "object") ? data : { meta: { kelas, versi: 1 }, records: [] };
  if (!agg.meta) agg.meta = { kelas, versi: 1 };
  if (!Array.isArray(agg.records)) agg.records = [];

  // Filter rentang tanggal bila diminta
  if (isDate(start) || isDate(end)) {
    const s = isDate(start) ? start : "0000-00-00";
    const e = isDate(end)   ? end   : "9999-12-31";
    agg = {
      ...agg,
      records: agg.records.filter((r) => {
        const d = String(r?.tanggal || "");
        return d >= s && d <= e;
      }),
    };
  }

  // Kembalikan objek agregat (kompatibel)
  return json(agg);
}
