export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const kelas   = u.searchParams.get('kelas');
  const tanggal = u.searchParams.get('tanggal');
  if (!kelas || !tanggal) {
    return new Response(JSON.stringify([]), { headers:{ 'Content-Type':'application/json' }});
  }
  const { results } = await env.DB.prepare(
    `SELECT payload_json FROM attendance_v2
     WHERE class_name=? AND tanggal=?`
  ).bind(kelas, tanggal).all();

  const list = (results||[]).map(r => {
    try { return JSON.parse(r.payload_json); } catch { return null; }
  }).filter(Boolean);

  return new Response(JSON.stringify(list), { headers:{ 'Content-Type':'application/json' }});
}
