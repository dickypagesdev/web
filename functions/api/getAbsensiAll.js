import { ok } from "../_lib/db.js";
export async function onRequestGet({ request, env }){
  const u=new URL(request.url);
  const kelas=u.searchParams.get("kelas");
  if (!kelas) return ok([]);

  const { results } = await env.DB.prepare(
    `SELECT tanggal, payload_json FROM attendance_v2 WHERE class_name=? ORDER BY tanggal ASC`
  ).bind(kelas).all();

  const out=[];
  for (const r of results||[]) { try{ const o=JSON.parse(r.payload_json); o.tanggal=r.tanggal; out.push(o); }catch{} }
  return ok(out);
}
