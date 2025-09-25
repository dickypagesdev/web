import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getSantriList.js
// Endpoint: GET /api/getSantriList?kelas=kelas_01 | 01 | A1
// ENV: GITHUB_TOKEN (contents:read) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Normalisasi agar selalu "kelas_<...>"
const normKelas = (k) => {
  let v = String(k || "").trim().replace(/-/g, "_");
  if (!/^kelas_/.test(v)) v = `kelas_${v}`;
  return v;
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url   = new URL(request.url);
  const qKls  = url.searchParams.get("kelas") || "";
  if (!qKls)  return json({ error: "Parameter 'kelas' wajib diisi." }, 400);

  const kelas = normKelas(qKls);               // konsistenkan nama file
  const path  = `${kelas}.json`;               // roster ada di root repo: <kelas>.json

  try {
    // Ambil roster (auto RAW fallback kalau file besar)
    const { exists, data } = await ghGetJsonAgg(token, path);

    // Jika file belum ada → kembalikan array kosong
    if (!exists) return json([], 200);

    // Pastikan bentuk array
    const santriList = Array.isArray(data) ? data : [];
    return json(santriList, 200);

  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
}
