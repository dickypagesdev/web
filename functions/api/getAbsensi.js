export async function onRequest({ request, env }) {
  const u = new URL(request.url);
  const kelas = u.searchParams.get('kelas')||'';
  const tanggal = u.searchParams.get('tanggal')||'';
  const { results } = await env.DB.prepare(
    "SELECT data_json FROM mutabaah_records WHERE kelas=? AND tanggal=?"
  ).bind(kelas, tanggal).all();
  // gabung ke array of objects
  const list = results.flatMap(r => { try { return [JSON.parse(r.data_json)]; } catch { return []; } });
  return Response.json(list);
}
