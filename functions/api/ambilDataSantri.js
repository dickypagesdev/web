// /functions/api/ambilDataSantri.js
// GET /api/ambilDataSantri?kelas=kelas_01 | 01

import { readRoster } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type":"application/json", ...CORS } });

const normKelas = (k) => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelas = url.searchParams.get("kelas");
  if (!kelas) return json({ error: "Parameter 'kelas' wajib diisi." }, 400);

  const k = normKelas(kelas);
  const r = await readRoster(k, token);
  if (!r.ok) return json({ error: r.error }, r.status || 500);
  if (!r.exists) return json([], 200);

  const result = (Array.isArray(r.data) ? r.data : []).map(s => ({ id:s?.id, nis:s?.nis, nama:s?.nama }));
  return json(result, 200);
}
