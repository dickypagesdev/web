import { ok } from "../_lib/db.js";
export async function onRequestGet({ request, env }){
  const u=new URL(request.url);
  const kelas=u.searchParams.get("kelas");
  if (!kelas) return ok([]);

  const { results } = await env.DB.prepare(
    `SELECT id_text, nis_text, nama FROM roster_v1 WHERE class_name=? ORDER BY LOWER(nama)`
  ).bind(kelas).all();

  return ok((results||[]).map(r=>({ id:r.id_text||"", nis:r.nis_text||"", nama:r.nama||"" })));
}
