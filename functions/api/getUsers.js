import { ghGetJsonAgg } from "../_ghAgg.js";

// Cloudflare Pages Functions (bukan Node). Endpoint: /api/getUsers
// GET /api/getUsers
// ENV: GITHUB_TOKEN (contents:read) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Jalur & metode
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  if (url.pathname !== "/api/getUsers") {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  try {
    // Ambil root file: user.json
    const { exists, data } = await ghGetJsonAgg(token, "user.json");

    if (!exists) {
      // belum ada file → balikan array kosong
      return json([]);
    }

    // Pastikan array
    const users = Array.isArray(data) ? data : [];
    return json(users, 200);
  } catch (err) {
    return json({ error: "Gagal mengambil data", detail: String(err?.message || err) }, 502);
  }
}
