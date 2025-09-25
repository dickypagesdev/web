// /functions/api/cek-admin.js
// POST /api/cek-admin  body: { password }
import { ghGetJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: "Body bukan JSON valid" }); }

  const { password } = body || {};
  if (!password) return json(400, { error: "Wajib: password" });

  try {
    const sec = await ghGetJsonAgg(token, "secure.json");
    const pwd = String(sec?.data?.adminPassword || "");
    const ok  = pwd && String(password) === pwd;
    return json(200, { ok });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
