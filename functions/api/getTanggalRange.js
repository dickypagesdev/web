// /functions/api/getTanggalRange.js
// GET /api/getTanggalRange?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// Return: ["YYYY-MM-DD", ...]
import { readAgg } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (o,s=200)=> new Response(JSON.stringify(o), { status:s, headers:{ "Content-Type":"application/json", ...CORS }});
const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));

export async function onRequest({ request, env }) {
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="GET")    return new Response("Method Not Allowed",{status:405,headers:CORS});
  if (!env.GITHUB_TOKEN)         return json({error:"GITHUB_TOKEN belum diset."},500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end")   || "";
  if (!kelasParam) return json({error:"Query ?kelas wajib."},400);

  const kelas = normKelas(kelasParam);
  const r = await readAgg(kelas, env.GITHUB_TOKEN);
  if (!r.ok) return json({ error: r.error }, r.status || 500);

  let dates = (r.data.records || []).map(x => x?.tanggal).filter(Boolean).map(String);
  dates = Array.from(new Set(dates)).sort((a,b)=> a.localeCompare(b));
  if (isDate(start)) dates = dates.filter(d => d >= start);
  if (isDate(end))   dates = dates.filter(d => d <= end);

  return json(dates, 200);
}
