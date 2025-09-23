// functions/api/getAbsensi.js — D1 (fix: inject tanggal)
const json = (obj, status=200)=>new Response(JSON.stringify(obj),{
  status, headers:{
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization",
  }
});
export const onRequestOptions = () => json({},204);

export async function onRequestGet({ request, env }){
  if (!env.DB) return json({ error:"D1 DB missing" },500);
  const { searchParams } = new URL(request.url);
  const kelas   = (searchParams.get("kelas")||"").trim();
  const tanggal = (searchParams.get("tanggal")||"").trim();
  if (!kelas || !tanggal) return json({ error:"Parameter 'kelas' dan 'tanggal' wajib diisi" },400);

  const stmt = env.DB.prepare(`
    SELECT tanggal, payload_json
    FROM attendance_snapshots
    WHERE class_name=? AND tanggal=?
    ORDER BY student_key
  `).bind(kelas, tanggal);

  const rows = stmt.all().results || [];
  const out = [];
  for (const r of rows){
    try {
      const obj = JSON.parse(r.payload_json);
      // penting untuk render single/range yang seragam:
      if (!obj.tanggal) obj.tanggal = r.tanggal;
      out.push(obj);
    } catch {}
  }
  return json(out, 200);
}

export async function onRequest(ctx){
  const m=ctx.request.method.toUpperCase();
  if (m==="OPTIONS") return onRequestOptions();
  if (m!=="GET") return json({ message:"Method Not Allowed" },405);
  return onRequestGet(ctx);
}
