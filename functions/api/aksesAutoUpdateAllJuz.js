// functions/api/aksesAutoUpdateAllJuz.js — D1
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{
  "Content-Type":"application/json","Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization",
}});
export const onRequestOptions=()=>json({},204);

export async function onRequestGet({ env }){
  if (!env.DB) return json([],200);
  const rows=env.DB.prepare(`
    SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt, COALESCE(count,0) AS count
    FROM auto_ranges WHERE kind='juz' ORDER BY updated_at DESC
  `).all().results || [];
  return json(rows,200);
}

export async function onRequestPost({ request, env }){
  if (!env.DB) return json({ error:"D1 DB missing" },500);
  let p; try{ p=await request.json(); }catch{ return json({ error:"Body bukan JSON valid"},400); }
  const kelas=(p?.kelas||"").trim();
  const fromDate=(p?.fromDate||"").trim();
  const toDate=(p?.toDate||"").trim();
  const count= Number(p?.data?.length || p?.count || 0);

  if (!kelas) return json({ error:"'kelas' wajib ada" },400);
  const now = new Date().toISOString();

  env.DB.prepare(`
    INSERT INTO auto_ranges (kelas, kind, from_date, to_date, updated_at, count)
    VALUES (?, 'juz', ?, ?, ?, ?)
    ON CONFLICT(kelas,kind) DO UPDATE SET
      from_date=excluded.from_date, to_date=excluded.to_date,
      updated_at=excluded.updated_at, count=excluded.count
  `).bind(kelas, fromDate, toDate, now, count).run();

  return json({ ok:true, saved:{ kelas, fromDate, toDate, updatedAt: now, count } },200);
}

export async function onRequest(ctx){
  const m=ctx.request.method.toUpperCase();
  if (m==="OPTIONS") return onRequestOptions();
  if (m==="GET") return onRequestGet(ctx);
  if (m==="POST") return onRequestPost(ctx);
  return json({ error:"Method Not Allowed" },405);
}
