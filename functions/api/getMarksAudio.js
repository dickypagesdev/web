// /functions/api/getMarksAudio.js
// GET /api/getMarksAudio?kelas=kelas_01&tanggal=YYYY-MM-DD&id=123
// Return: { nama, marks } ; jika tanggal / santri tak ada → 404

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
  const token = env.GITHUB_TOKEN;   if (!token) return json({error:"GITHUB_TOKEN belum diset di environment."},500);

  const url = new URL(request.url);
  const id        = url.searchParams.get("id");
  const tanggal   = url.searchParams.get("tanggal");
  const kelasParam= url.searchParams.get("kelas");
  if (!id || !kelasParam || !isDate(tanggal)) return json({error:"?id, ?kelas, ?tanggal(YYYY-MM-DD) wajib."},400);

  const kelas = normKelas(kelasParam);
  const r = await readAgg(kelas, token);
  if (!r.ok) return json({error:r.error}, r.status || 500);

  const rec = (r.data.records||[]).find(x => x?.tanggal === tanggal);
  if (!rec) return json({error:"File absensi tidak ditemukan."},404);

  const items = Array.isArray(rec.items)?rec.items:[];
  const santri = items.find(s => s && s.id == id); // == sengaja longgar
  if (!santri) return json({error:"Santri tidak ditemukan."},404);

  const marks = santri.marks || {};
  return json({ nama: santri.nama, marks }, 200);
}
