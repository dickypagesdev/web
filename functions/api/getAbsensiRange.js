// functions/api/getAbsensiRange.js — D1
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{
  "Content-Type":"application/json","Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization",
}});
export const onRequestOptions = () => json({},204);

function validDate(s){
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
export async function onRequestGet({ request, env }){
  if (!env.DB) return json({ error:"D1 DB missing" },500);
  const sp=new URL(request.url).searchParams;
  const kelas=(sp.get("kelas")||"").trim();
  const start=(sp.get("start")||"").trim();
  const end=(sp.get("end")||"").trim();
  if (!kelas || !start || !end || !validDate(start) || !validDate(end))
    return json({ error:"Parameter 'kelas','start','end' wajib (YYYY-MM-DD)" },400);

  const stmt=env.DB.prepare(`
    SELECT payload_json
    FROM attendance_snapshots
    WHERE class_name=? AND tanggal BETWEEN ? AND ?
    ORDER BY tanggal, student_key
  `).bind(kelas, start, end);

  const rows=stmt.all().results||[];
  const out=[];
  for (const r of rows){
    try {
      const obj = JSON.parse(r.payload_json);
      if (!obj.tanggal) obj.tanggal = null; // front-endmu aman tanpa tanggal juga
      out.push(obj);
    }catch{}
  }
  return json(out,200);
}
export async function onRequest(ctx){
  const m=ctx.request.method.toUpperCase();
  if (m==="OPTIONS") return onRequestOptions();
  if (m!=="GET") return json({ message:"Method Not Allowed" },405);
  return onRequestGet(ctx);
}
