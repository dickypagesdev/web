// functions/api/aksesAutoUpdateAllJuzMur.js (D1)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export const onRequestOptions = () => new Response(null, { status:204, headers: CORS });

export async function onRequestGet({ env }) {
  const r = await env.DB.prepare(`SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt FROM auto_ranges WHERE kind='mur'`).all();
  return new Response(JSON.stringify(r.results || []), { status: 200, headers: { "Content-Type":"application/json", ...CORS } });
}

export async function onRequestPost({ request, env }) {
  let payload={}; try{ payload=await request.json(); }catch{ return new Response(JSON.stringify({ error:"Body bukan JSON valid."}),{status:400,headers:{ "Content-Type":"application/json", ...CORS }})}
  const { kelas, fromDate="", toDate="" } = payload || {};
  if (!kelas) return new Response(JSON.stringify({ error:"Parameter 'kelas' wajib ada."}),{status:400,headers:{ "Content-Type":"application/json", ...CORS }});
  await env.DB.prepare(`
    INSERT INTO auto_ranges (kelas, kind, from_date, to_date, updated_at)
    VALUES (?, 'mur', ?, ?, datetime('now'))
    ON CONFLICT(kelas, kind) DO UPDATE SET
      from_date=excluded.from_date, to_date=excluded.to_date, updated_at=datetime('now')
  `).bind(kelas, fromDate, toDate).run();
  return new Response(JSON.stringify({ ok:true, saved:{ kelas, fromDate, toDate }}), { status:200, headers:{ "Content-Type":"application/json", ...CORS }});
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (!["GET","POST","OPTIONS"].includes(m)) return new Response(JSON.stringify({ error:"Method Not Allowed"}),{status:405,headers:CORS});
}
