// /functions/api/getAbsensi.js
// GET /api/getAbsensi?kelas=kelas_01&tanggal=YYYY-MM-DD
// Return: array items utk tanggal tsb, [] jika tidak ada

import { readAgg } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method !== "GET")     return new Response("Method Not Allowed",{status:405,headers:CORS});
  const token = env.GITHUB_TOKEN; if (!token) return json({error:"GITHUB_TOKEN belum diset."},500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const tanggal    = url.searchParams.get("tanggal") || "";
  if (!kelasParam) return json({error:"Query ?kelas wajib."},400);
  if (!isDate(tanggal)) return json({error:"Query ?tanggal (YYYY-MM-DD) wajib & valid."},400);

  const kelas = normKelas(kelasParam);
  const r = await readAgg(kelas, token);
  if (!r.ok) return json({error:r.error}, r.status || 500);

  const rec = (r.data.records||[]).find(x => x?.tanggal === tanggal);
  return json(Array.isArray(rec?.items) ? rec.items : [], 200);
}
