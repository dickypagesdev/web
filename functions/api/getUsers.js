// /functions/api/getUsers.js
// GET /api/getUsers
import { getJsonSmart } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), { status: 500, headers: { "Content-Type":"application/json", ...CORS } });

  const r = await getJsonSmart("user.json", token);
  if (!r.ok) return new Response(JSON.stringify({ error: "GitHub API error", status: r.status, detail: r.error }), { status: 500, headers: { "Content-Type":"application/json", ...CORS } });

  return new Response(JSON.stringify(r.data || []), { status: 200, headers: { "Content-Type":"application/json", ...CORS } });
}
