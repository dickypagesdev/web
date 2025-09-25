// /functions/api/getSantri.js
// GET /api/getSantri?kelas=01|kelas_01
import { readRoster } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const normKelas = (k) => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), { status: 500, headers: { "Content-Type":"application/json", ...CORS } });

  const url = new URL(request.url);
  const raw = url.searchParams.get("kelas");
  if (!raw) return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib diisi" }), { status: 400, headers: { "Content-Type":"application/json", ...CORS } });

  const kelas = normKelas(raw);
  const r = await readRoster(kelas, token);
  if (!r.ok) return new Response(JSON.stringify({ error: r.error }), { status: r.status || 500, headers: { "Content-Type":"application/json", ...CORS } });

  return new Response(JSON.stringify(Array.isArray(r.data) ? r.data : []), { status: 200, headers: { "Content-Type":"application/json", ...CORS } });
}
