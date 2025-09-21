export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const kelas = u.searchParams.get('kelas')||'';
  const start = u.searchParams.get('start')||'';
  const end   = u.searchParams.get('end')||'';
  const { results } = await env.DB.prepare(
    "SELECT data_json FROM mutabaah_records WHERE kelas=? AND tanggal BETWEEN ? AND ? ORDER BY tanggal"
  ).bind(kelas, start, end).all();
  const list = results.flatMap(r => { try { return [JSON.parse(r.data_json)]; } catch { return []; } });
  return Response.json(list);
}
