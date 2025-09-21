// GET /api/getPagesMap
export async function onRequest({ env }) {
  const row = await env.DB.prepare("SELECT v FROM pages_map_json WHERE k='pages_map'").first();
  return new Response(row?.v || '{}', { headers:{'Content-Type':'application/json'}});
}
