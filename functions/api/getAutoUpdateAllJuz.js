// /functions/api/getAutoUpdateAllJuz.js
// GET /api/getAutoUpdateAllJuz
import { ghGetJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return json(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  try {
    const got = await ghGetJsonAgg(token, "autoUpdateAllJuz.json");
    return json(200, got.exists ? (got.data ?? {}) : {});
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
