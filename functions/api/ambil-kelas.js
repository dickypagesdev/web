export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare("SELECT nama FROM classes ORDER BY nama").all();
  return new Response(JSON.stringify(rows.results?.map(r=>r.nama)||[]), {
    headers: { "Content-Type": "application/json" }
  });
}
