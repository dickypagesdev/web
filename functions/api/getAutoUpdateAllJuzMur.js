import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getAutoUpdateAllJuzMur.js
// GET /api/getAutoUpdateAllJuzMur
// ENV: GITHUB_TOKEN (contents:read) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FILE_PATH = "autoUpdateAllJuzMur.json"; // khusus Murajaah

export async function onRequest({ request, env }) {
  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset di environment." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  try {
    // Ambil file (auto RAW fallback). Jika belum ada → exists=false
    const { exists, data } = await ghGetJsonAgg(token, FILE_PATH);

    // Kembalikan string JSON apa adanya (minified)
    const payload = exists ? JSON.stringify(Array.isArray(data) ? data : []) : "[]";

    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
