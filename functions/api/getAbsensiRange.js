// /functions/api/getAbsensiRange.js
// GET /api/getAbsensiRange?kelas=kelas_01&start=YYYY-MM-DD&end=YYYY-MM-DD
// Return: array item gabungan rentang; setiap item punya 'tanggal' dan jika roster ada → 'nis'

import { readAgg, readRoster } from "../_lib/ghjson.js";

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
  if (!isDate(start) || !isDate(end) || end < start)
    return json({error:"?start & ?end (YYYY-MM-DD) wajib & valid (end >= start)."},400);

  const kelas = normKelas(kelasParam);

  // roster (opsional) → peta id → nis
  let idToNis = null;
  const roster = await readRoster(kelas, token);
  if (roster.ok && Array.isArray(roster.data)) {
    idToNis = new Map(roster.data.map(s => [String(s?.id), s?.nis || ""]));
  }

  const agg = await readAgg(kelas, token);
  if (!agg.ok) return json({error:agg.error}, agg.status || 500);
  const records = Array.isArray(agg.data?.records) ? agg.data.records : [];

  const out = [];
  for (const rec of records) {
    const tgl = rec?.tanggal;
    if (!isDate(tgl) || tgl < start || tgl > end) continue;
    const items = Array.isArray(rec?.items) ? rec.items : [];
    for (const it of items) {
      const row = { ...it, tanggal: tgl };
      if (idToNis && row.id != null) {
        const nis = idToNis.get(String(row.id));
        if (nis) row.nis = nis;
      }
      out.push(row);
    }
  }

  out.sort((a,b)=>{
    const d = String(a.tanggal).localeCompare(String(b.tanggal));
    if (d) return d;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });

  return json(out, 200);
}
