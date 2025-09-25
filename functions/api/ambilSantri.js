// /functions/api/ambilSantri.js
// GET /api/ambilSantri?kelas=1 | kelas_1

import { readRoster } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (o,s=200)=> new Response(JSON.stringify(o),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});
const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status:405, headers:CORS });
  const token = env.GITHUB_TOKEN; if (!token) return json({ error:"GITHUB_TOKEN belum diset." },500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas");
  if (!kelasParam) return json({ error:"Parameter 'kelas' wajib." },400);

  const kelas = normKelas(kelasParam);
  const r = await readRoster(kelas, token);
  if (!r.ok) return json({ error:r.error }, r.status || 500);

  return json(Array.isArray(r.data)?r.data:[], 200);
}
