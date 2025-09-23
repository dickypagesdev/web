// functions/api/getAutoUpdateAllJuz.js — D1
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{
  "Content-Type":"application/json","Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization",
}});
export const onRequestOptions=()=>json({},204);

export async function onRequestGet({ env }){
  if (!env.DB) return json([],200); // fallback kosong
  const rows = env.DB.prepare(`
    SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt, COALESCE(count,0) AS count
    FROM auto_ranges
    WHERE kind='juz'
    ORDER BY updated_at DESC
  `).all().results || [];
  return json(rows,200);
}
export async function onRequest(ctx){
  const m=ctx.request.method.toUpperCase();
  if (m==="OPTIONS") return onRequestOptions();
  if (m!=="GET") return json({ message:"Method Not Allowed" },405);
  return onRequestGet(ctx);
}
