export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const kelas = u.searchParams.get('kelas');
  const start = u.searchParams.get('start');
  const end   = u.searchParams.get('end');
  if (!kelas || !start || !end) {
    return new Response(JSON.stringify([]), { headers:{ 'Content-Type':'application/json' }});
  }
  const { results } = await env.DB.prepare(
    `SELECT tanggal, payload_json
       FROM attendance_v2
      WHERE class_name=? AND tanggal BETWEEN ? AND ?
      ORDER BY tanggal`
  ).bind(kelas, start, end).all();

  const list = [];
  for (const r of results || []) {
    const obj = JSON.parse(r.payload_json);
    if (obj && !obj.tanggal) obj.tanggal = r.tanggal; // bantu jika ingin tahu hari
    list.push(obj);
  }
  return new Response(JSON.stringify(list), { headers:{ 'Content-Type':'application/json' }});
}
