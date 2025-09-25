// /functions/api/appendAudioToMarks.js
// POST { id, kelas, tanggal(YYYY-MM-DD), filename }
// Tambah filename unik ke marks.audio untuk (kelas, tanggal, id)

import { readAgg, writeAgg } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (o,s=200)=> new Response(JSON.stringify(o),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});
const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status:405, headers:CORS });
  const token = env.GITHUB_TOKEN; if (!token) return json({ success:false, error:"GITHUB_TOKEN belum diset." },500);

  let body={}; try { body = await request.json(); } catch { return json({ success:false, error:"Body bukan JSON valid." },400); }
  let { id, kelas, tanggal, filename } = body || {};
  if (!id || !kelas || !tanggal || !filename) return json({ success:false, error:"id, kelas, tanggal, filename wajib." },400);
  if (!isDate(tanggal)) return json({ success:false, error:"Format tanggal harus YYYY-MM-DD." },400);

  id = String(id); kelas = normKelas(kelas);

  const r = await readAgg(kelas, token);
  if (!r.ok) return json({ success:false, error:r.error }, r.status || 500);

  // siapkan record tanggal
  let rec = (r.data.records || []).find(x => x?.tanggal === tanggal);
  if (!rec) {
    rec = { tanggal, items: [] };
    r.data.records.push(rec);
    r.data.records.sort((a,b)=> String(a.tanggal).localeCompare(String(b.tanggal)));
  }
  if (!Array.isArray(rec.items)) rec.items = [];

  // siapkan santri by id
  let sidx = rec.items.findIndex(s => String(s?.id||"") === id);
  if (sidx === -1) { rec.items.push({ id, marks:{ audio:[] } }); sidx = rec.items.length - 1; }
  const row = rec.items[sidx];
  if (!row.marks || typeof row.marks !== "object") row.marks = {};
  if (!Array.isArray(row.marks.audio)) row.marks.audio = [];
  if (!row.marks.audio.includes(filename)) row.marks.audio.push(filename);

  const put = await writeAgg(kelas, r.data, token, r.sha || null,
    `appendAudioToMarks: ${kelas}/${tanggal} id=${id} add=${filename}`);
  if (!put.ok) return json({ success:false, error: put.error }, put.status || 502);

  return json({ success:true, kelas, tanggal, id, audioCount: row.marks.audio.length }, 200);
}
