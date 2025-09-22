// GET /api/getMarksAudio?kelas=KLS_XXXX&tanggal=YYYY-MM-DD&id=123
// Opsional: ?nis=102016009
// Sumber data: D1 (attendance.payload_json)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  if (!env.ABSENSI_DB) {
    return new Response(JSON.stringify({ error: "Binding D1 absensi_db belum tersedia." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const url = new URL(request.url);
  const kelas   = (url.searchParams.get("kelas")   || "").trim();
  const tanggal = (url.searchParams.get("tanggal") || "").trim();
  const idParam = (url.searchParams.get("id")      || "").trim();
  const nisParam= (url.searchParams.get("nis")     || "").trim();

  if (!kelas || !tanggal || (!idParam && !nisParam)) {
    return new Response(JSON.stringify({
      error: "Parameter 'kelas', 'tanggal', dan salah satu dari 'id' atau 'nis' wajib ada."
    }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
  }

  try {
    // Ambil snapshot array absensi pada (kelas,tanggal)
    const row = await env.ABSENSI_DB
      .prepare("SELECT payload_json FROM attendance WHERE class_name = ? AND tanggal = ? LIMIT 1")
      .bind(kelas, tanggal)
      .first();

    if (!row || !row.payload_json) {
      return new Response(JSON.stringify({ error: "Data absensi tidak ditemukan untuk kelas/tanggal ini." }), {
        status: 404, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    let list = [];
    try { list = JSON.parse(row.payload_json); } catch { list = []; }

    // Cari santri berdasar id / nis (longgar)
    const target = (list || []).find(s => {
      const sid = (s?.id ?? "").toString().trim();
      const snis = (s?.nis ?? "").toString().trim();
      return (idParam && sid === idParam) || (nisParam && snis === nisParam);
    });

    if (!target) {
      return new Response(JSON.stringify({ error: "Santri tidak ditemukan pada snapshot." }), {
        status: 404, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const marks = target.marks || {};
    const audio = Array.isArray(marks.audio) ? marks.audio : [];

    // Output mirip versi lama agar frontend tidak berubah
    return new Response(JSON.stringify({
      nama: target.nama ?? "",
      marks,
      audio
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
