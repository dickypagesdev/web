// functions/api/appendAudioToMarks.js — D1
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{
  "Content-Type":"application/json","Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization",
}});
export const onRequestOptions=()=>json({},204);

export async function onRequestPost({ request, env }){
  if (!env.DB) return json({ success:false, error:"D1 DB missing" },500);
  let body; try{ body=await request.json(); }catch{ return json({ success:false, error:"Body bukan JSON"},400); }
  const { id, kelas, tanggal, filename } = body||{};
  if (!id||!kelas||!tanggal||!filename) return json({ success:false, error:"Param id, kelas, tanggal, filename wajib ada"},400);

  const row = env.DB.prepare(`
    SELECT rowid, payload_json FROM attendance_snapshots
    WHERE class_name=? AND tanggal=? AND (json_extract(payload_json,'$.nis')=? OR json_extract(payload_json,'$.id')=?)
    LIMIT 1
  `).bind(kelas, tanggal, String(id), String(id)).first();

  if (!row) return json({ success:false, error:"Santri tidak ditemukan" },404);

  let obj={}; try{ obj=JSON.parse(row.payload_json);}catch{}
  if (typeof obj.marks!=="object"||!obj.marks) obj.marks={};
  if (!Array.isArray(obj.marks.audio)) obj.marks.audio=[];
  if (!obj.marks.audio.includes(filename)) obj.marks.audio.push(filename);

  const upd = env.DB.prepare(`
    UPDATE attendance_snapshots
    SET payload_json=?, updated_at=?
    WHERE rowid=?
  `).bind(JSON.stringify(obj), new Date().toISOString(), row.rowid).run();

  return json({ success:true, id, kelas, tanggal, filename, audioCount: obj.marks.audio.length }, 200);
}
export async function onRequest(ctx){
  const m=ctx.request.method.toUpperCase();
  if (m==="OPTIONS") return onRequestOptions();
  if (m!=="POST") return json({ success:false, error:"Method Not Allowed" },405);
  return onRequestPost(ctx);
}
