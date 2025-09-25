import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getKelas.js
// GET /api/getKelas?kelas=kelas_01 | 01 | kelas-01 | kelas_01.json
// Return: array roster kelas; jika file tidak ada → []
// ENV: GITHUB_TOKEN (contents:read) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

function normKelas(raw = "") {
  let v = String(raw || "").trim();
  if (!v) return "";
  v = v.replace(/\.json$/i, ""); // buang .json jika ada
  v = v.replace(/-/g, "_");      // kelas-01 → kelas_01
  if (!/^kelas_/i.test(v)) {
    // Jika hanya angka 1–2 digit → nol-pad ke 2 digit
    const m = v.match(/^(\d{1,2})$/);
    v = m ? `kelas_${m[1].padStart(2, "0")}` : `kelas_${v}`;
  }
  return v.toLowerCase();
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) {
    return json({ error: "GITHUB_TOKEN belum diset di environment." }, 500);
  }

  const url = new URL(request.url);
  const rawKelas = url.searchParams.get("kelas") || "";
  if (!rawKelas) return json({ error: "Parameter 'kelas' wajib diisi." }, 400);

  const kelas = normKelas(rawKelas);
  if (!kelas) return json({ error: "Parameter 'kelas' tidak valid." }, 400);

  const filePath = `${kelas}.json`; // root repo

  try {
    const { exists, data } = await ghGetJsonAgg(token, filePath);

    if (!exists) return json([]); // file tidak ada → array kosong

    // Pastikan hasil berupa array
    const arr = Array.isArray(data) ? data : [];
    return json(arr, 200);
  } catch (err) {
    return json({ error: "Gagal fetch data", detail: String(err?.message || err) }, 502);
  }
}
