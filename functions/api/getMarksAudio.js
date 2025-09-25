// /functions/api/getMarksAudio.js
// GET /api/getMarksAudio?kelas=kelas_01|01&tanggal=YYYY-MM-DD&(id=12|nis=A123)
import { ghGetJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return json(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  const u = new URL(request.url);
  const kelasParam = u.searchParams.get("kelas");
  const tanggal    = u.searchParams.get("tanggal");
  const id         = u.searchParams.get("id");
  const nis        = u.searchParams.get("nis");
  if (!kelasParam || !tanggal || (!id && !nis))
    return json(400, { error: "Wajib: kelas, tanggal, dan salah satu dari id/nis" });

  const kelas = normKelas(kelasParam);

  try {
    const { exists, data } = await ghGetJsonAgg(token, `absensi/${kelas}.json`);
    if (!exists) return json(404, { error: "File absensi tidak ditemukan." });

    const rec = (Array.isArray(data?.records) ? data.records : []).find(
      (r) => String(r?.tanggal) === String(tanggal)
    );
    if (!rec) return json(404, { error: "Tanggal tidak ditemukan." });

    const items = Array.isArray(rec?.items) ? rec.items : [];
    const row = items.find((s) => {
      const sid  = String(s?.id ?? "");
      const sNis = String(s?.nis ?? "");
      return (id && sid === String(id)) || (nis && sNis === String(nis));
    });

    const audio = Array.isArray(row?.marks?.audio) ? row.marks.audio : [];
    return json(200, { audio });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
