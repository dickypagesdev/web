// /functions/api/getAbsensiRange.js
// GET /api/getAbsensiRange?kelas=kelas_01|01&start=YYYY-MM-DD&end=YYYY-MM-DD
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

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas");
  const start = url.searchParams.get("start");
  const end   = url.searchParams.get("end");
  if (!kelasParam || !start || !end) return json(400, { error: "Wajib: kelas, start, end" });

  const kelas = normKelas(kelasParam);
  try {
    const { exists, data } = await ghGetJsonAgg(token, `absensi/${kelas}.json`);
    if (!exists) return json(200, []);

    const records = Array.isArray(data?.records) ? data.records : [];
    const s = start, e = end;

    const flat = records
      .filter((r) => String(r?.tanggal) >= s && String(r?.tanggal) <= e)
      .sort((a, b) => String(a?.tanggal).localeCompare(String(b?.tanggal)))
      .flatMap((r) =>
        (Array.isArray(r?.items) ? r.items : [])
          .map((it) => ({ ...it, tanggal: r.tanggal }))
          .sort((a, b) => (parseInt(a?.id || 0, 10) || 0) - (parseInt(b?.id || 0, 10) || 0))
      );

    return json(200, flat);
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
