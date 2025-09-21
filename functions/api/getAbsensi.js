// GET /api/getAbsensi?kelas=...&tanggal=...
export const onRequestGet = async ({ request, env }) => {
  try {
    const u = new URL(request.url);
    const kelas = u.searchParams.get("kelas");
    const tanggal = u.searchParams.get("tanggal");
    if (!kelas || !tanggal) return new Response("[]", { headers: { "Content-Type": "application/json" } });

    const { results } = await env.DB.prepare(
      "SELECT data_json FROM mutabaah_records WHERE kelas=? AND tanggal=?"
    ).bind(kelas, tanggal).all();

    const out = results.map(r => JSON.parse(r.data_json || "{}"));
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response("[]", { headers: { "Content-Type": "application/json" } });
  }
};
