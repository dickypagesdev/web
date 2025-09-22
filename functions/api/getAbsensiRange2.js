import { ok } from "../_lib/db.js";

export async function onRequestGet({ request, env }){
  const u=new URL(request.url);
  const kelas=u.searchParams.get("kelas");
  const start=u.searchParams.get("start");
  const end=u.searchParams.get("end");
  if (!kelas || !start || !end) return ok([]);

  const { results } = await env.DB.prepare(
    `SELECT tanggal, payload_json FROM attendance_v2
      WHERE class_name=? AND tanggal BETWEEN ? AND ?
      ORDER BY tanggal ASC`
  ).bind(kelas, start, end).all();

  const out=[];
  for (const r of results||[]) {
    try { const obj = JSON.parse(r.payload_json); obj.tanggal = r.tanggal; out.push(obj); } catch {}
  }
  return ok(out);
}
