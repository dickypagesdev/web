import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getAyat.js
// GET /api/getAyat
// Membaca file root: getAyat.json dari repo yang sama lewat GitHub Contents/RAW fallback
// ENV: GITHUB_TOKEN — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

export async function onRequest({ env, request }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  try {
    // Ambil getAyat.json via helper (auto-RAW fallback)
    const { exists, data } = await ghGetJsonAgg(token, "getAyat.json");

    // Jika tidak ada, kembalikan objek kosong (ubah ke [] jika file aslinya array)
    const payload = exists
      ? JSON.stringify((data && typeof data === "object") ? data : {})
      : "{}";

    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
