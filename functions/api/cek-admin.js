// POST /api/cek-admin {password}
export async function onRequest({ request, env }) {
  const { password } = await request.json();
  // misal password admin “global” = baris user 'admin' (role=admin)
  const { results } = await env.DB.prepare(
    "SELECT 1 FROM app_users WHERE role='admin' AND pass_hash=? LIMIT 1"
  ).bind(await hash('admin:'+password)).all();
  return results.length ? Response.json({ ok:true }) : Response.json({ message:'Salah' }, {status:401});
}
async function hash(s){ const a=new TextEncoder().encode(s); const d=await crypto.subtle.digest('SHA-256',a); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
