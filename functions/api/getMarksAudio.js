// functions/api/getMarksAudio.js — D1
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{
  "Content-Type":"application/json","Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization",
}});
export const onRequestOptions = () => json({},204);

export async function onRequestGet({ request, env }){
  if (!env.DB) return json({ error:"D1 DB missing" },500);
  const sp=new URL(request.url).searchParams;
  const id=(sp.get("id")||"").trim();
  const tanggal=(sp.get("tanggal")||"").trim();
  const kelas=(sp.get("kelas")||"").trim();
  if (!id||!tanggal||!kelas) return json({ error:"'id','tanggal','kelas' wajib" },400);

  // id/nis → student_key cocok dgn saveData (nis || id)
  const row=env.DB.prepare(`
    SELECT payload_json FROM attendance_snapshots
    WHERE class_name=? AND tanggal=? AND (json_extract(payload_json,'$.nis')=? OR json_extract(payload_json,'$.id')=?)
    LIMIT 1
  `).bind(kelas, tanggal, id, id).first();

  if (!row) return json({ error:"Santri tidak ditemukan." },404);

  let data={}; try{ data=JSON.parse(row.payload_json);}catch{}
  const marks = data.marks || {};
  return json({ nama: data.nama, marks }, 200);
}
export async function onRequest(ctx){
  const m=ctx.request.method.toUpperCase();
  if (m==="OPTIONS") return onRequestOptions();
  if (m!=="GET") return json({ message:"Method Not Allowed" },405);
  return onRequestGet(ctx);
}
