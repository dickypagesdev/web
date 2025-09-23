// functions/api/appendAudioToMarks.js (D1)
// POST { id, kelas, tanggal, filename }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body={}; try{ body=await request.json(); }catch{ return new Response(JSON.stringify({ success:false, error:"Body bukan JSON valid."}),{status:400,headers:{ "Content-Type":"application/json", ...CORS }})}
  const { id, kelas, tanggal, filename } = body || {};
  if (!id || !kelas || !tanggal || !filename) {
    return new Response(JSON.stringify({ success:false, error:"Param id, kelas, tanggal, filename wajib ada" }), { status:400, headers:{ "Content-Type":"application/json", ...CORS }});
  }

  const r = await env.DB.prepare(`SELECT marks_json AS marks FROM harian WHERE kelas=? AND tanggal=? AND (id_text=? OR nis=?) LIMIT 1`)
    .bind(kelas, tanggal, id, id).all();
  if (!r.results || !r.results.length) {
    return new Response(JSON.stringify({ success:false, error:"Santri tidak ditemukan pada tanggal tsb" }), { status:404, headers:{ "Content-Type":"application/json", ...CORS }});
  }
  let marks = {}; try{ marks = r.results[0].marks ? JSON.parse(r.results[0].marks) : {}; }catch{ marks = {}; }
  if (!Array.isArray(marks.audio)) marks.audio = [];
  if (!marks.audio.includes(filename)) marks.audio.push(filename);

  await env.DB.prepare(`UPDATE harian SET marks_json=?, updated_at=datetime('now') WHERE kelas=? AND tanggal=? AND (id_text=? OR nis=?)`)
    .bind(JSON.stringify(marks), kelas, tanggal, id, id).run();

  return new Response(JSON.stringify({ success:true, id, kelas, tanggal, filename, audioCount: marks.audio.length }), { status:200, headers:{ "Content-Type":"application/json", ...CORS }});
}
