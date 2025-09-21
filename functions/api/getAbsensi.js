// GET /api/getAbsensi?kelas=KELAS&tanggal=YYYY-MM-DD
export const onRequestGet = async ({ request, env }) => {
  try {
    const u = new URL(request.url);
    const kelas = u.searchParams.get("kelas") || "";
    const tanggal = u.searchParams.get("tanggal") || "";
    if (!kelas || !tanggal) {
      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
    }

    const { results } = await env.DB
      .prepare("SELECT data_json FROM mutabaah_records WHERE kelas=? AND tanggal=?")
      .bind(kelas, tanggal)
      .all();

    const out = [];
    for (const r of results) {
      try { const obj = JSON.parse(r.data_json); if (obj) out.push(obj); } catch {}
    }

    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  } catch {
    // Kalau error pun, frontend kamu menganggap [] sebagai "tidak ada data lama"
    return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
  }
};
