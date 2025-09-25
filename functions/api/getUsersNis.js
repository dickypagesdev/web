import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getUsersNis.js
// Endpoint: GET /api/getUsersNis
// Return: { usedNis: string[], count: number }
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

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  try {
    // Ambil user.json dari root repo
    const { exists, data } = await ghGetJsonAgg(token, "user.json");

    if (!exists) {
      return json({ usedNis: [], count: 0 }, 200);
    }

    const users = Array.isArray(data) ? data : [];

    // Kumpulkan semua NIS unik (dukung bentuk string atau array di tiap user)
    const seen = new Set();
    const usedNis = [];

    for (const u of users) {
      const arr = Array.isArray(u?.nis)
        ? u.nis
        : (u?.nis != null ? [u.nis] : []);
      for (const n of arr) {
        const disp = String(n ?? "").trim();
        if (!disp) continue;
        const key = disp.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        usedNis.push(disp);
      }
    }

    return json({ usedNis, count: usedNis.length }, 200);
  } catch (err) {
    return json({ message: "Gagal mengambil data", error: String(err?.message || err) }, 502);
  }
}
