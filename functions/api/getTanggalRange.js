import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getTanggalRange.js
// GET /api/getTanggalRange?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// Return: ["2025-09-01","2025-09-02",...]
// ENV: GITHUB_TOKEN — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ABS_DIR = "absensi";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

const normKelas = (raw = "") => {
  let v = String(raw || "").trim();
  if (!v) return "";
  v = v.replace(/\.json$/i, "").replace(/-/g, "_");
  if (!/^kelas_/i.test(v)) {
    const m = v.match(/^(\d{1,2})$/);
    v = m ? `kelas_${m[1].padStart(2, "0")}` : `kelas_${v}`;
  }
  return v.toLowerCase();
};

export async function onRequest({ request, env }) {
  // CORS preflight
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
  if (!kelas) return json({ error: "Parameter 'kelas' tidak valid." }, 400);

  try {
    const { exists, data } = await ghGetJsonAgg(token, `${ABS_DIR}/${kelas}.json`);
    if (!exists) return json([]); // belum ada file → tak ada tanggal

    const records = Array.isArray(data?.records) ? data.records : [];
    // ambil tanggal → unik → sort
    let dates = Array.from(
      new Set(
        records
          .map((r) => r?.tanggal)
          .filter(Boolean)
          .map(String)
      )
    ).sort((a, b) => a.localeCompare(b));

    // filter optional start/end
    if (isDate(start)) dates = dates.filter((d) => d >= start);
    if (isDate(end))   dates = dates.filter((d) => d <= end);

    return json(dates);
  } catch (e) {
    return json({ error: "Gagal mengambil data", detail: String(e?.message || e) }, 502);
  }
}
