// /functions/api/getAbsensiAll.js
// GET /api/getAbsensiAll?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// Default: kembalikan { meta, records }; jika start/end → subset records

import { readAgg } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization",
};
const json = (d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
const normKelas = k => (String(k||"").startsWith("kelas_")?String(k):`kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method !== "GET")     return new Response("Method Not Allowed",{status:405,headers:CORS});
  const token = env.GITHUB_TOKEN; if (!token) return json({error:"GITHUB_TOKEN belum diset."},500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end")   || "";
  if (!kelasParam) return json({error:"Query ?kelas wajib."},400);

  const kelas = normKelas(kelasParam);
  const r = await readAgg(kelas, token);
  if (!r.ok) return json({error:r.error}, r.status || 500);

  const agg = r.data;
  if (isDate(start) || isDate(end)) {
    const s = isDate(start) ? start : "0000-00-00";
    const e = isDate(end)   ? end   : "9999-12-31";
    agg.records = (agg.records||[]).filter(x => {
      const d = String(x?.tanggal||"");
      return d >= s && d <= e;
    });
  }
  return json(agg, 200);
}
