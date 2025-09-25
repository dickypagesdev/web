import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getMarksAudio.js
// GET /api/getMarksAudio?kelas=kelas_01&tanggal=YYYY-MM-DD&id=123
// Return: { nama, marks } ; jika tanggal atau santri tak ada → 404 (kompat perilaku lama)
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
  if (!token) return json({ error: "GITHUB_TOKEN belum diset di environment." }, 500);

  const url = new URL(request.url);
  const idParam      = url.searchParams.get("id");
  const tanggalParam = url.searchParams.get("tanggal");
  const kelasParam   = url.searchParams.get("kelas");

  if (!idParam || !kelasParam || !isDate(tanggalParam)) {
    return json({ error: "Query ?id, ?kelas, ?tanggal (YYYY-MM-DD) wajib & valid." }, 400);
  }

  const kelas   = normKelas(kelasParam);
  const tanggal = tanggalParam;

  try {
    // Ambil agregat: absensi/<kelas>.json (RAW fallback)
    const { exists, data } = await ghGetJsonAgg(token, `${ABS_DIR}/${kelas}.json`);
    if (!exists) {
      // kompat: ketika file absensi tidak ada → 404
      return json({ error: "File absensi tidak ditemukan." }, 404);
    }

    const records = Array.isArray(data?.records) ? data.records : [];
    const rec = records.find((x) => x?.tanggal === tanggal);
    if (!rec) {
      // kompat: ketika record tanggal tidak ada → 404
      return json({ error: "File absensi tidak ditemukan." }, 404);
    }

    const items = Array.isArray(rec?.items) ? rec.items : [];
    const santri = items.find((s) => s && s.id == idParam); // longgar (==) sesuai versi lama
    if (!santri) return json({ error: "Santri tidak ditemukan." }, 404);

    const marks = santri.marks || {};
    return json({ nama: santri.nama, marks }, 200);
  } catch (e) {
    return json({ error: "Gagal mengambil data", detail: String(e?.message || e) }, 502);
  }
}
