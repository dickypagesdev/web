import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getAbsensiRange.js
// GET /api/getAbsensiRange?kelas=kelas_01&start=YYYY-MM-DD&end=YYYY-MM-DD
// Return: array item gabungan dari rentang [start..end],
// tiap item dijamin punya field 'tanggal', dan (opsional) 'nis' jika ditemukan di roster.
// ENV: GITHUB_TOKEN — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ABS_DIR = "absensi";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")     return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end")   || "";

  if (!kelasParam) return json({ error: "Query ?kelas wajib." }, 400);
  if (!isDate(start) || !isDate(end) || end < start) {
    return json({ error: "Query ?start & ?end (YYYY-MM-DD) wajib & valid (end >= start)." }, 400);
  }

  const kelas = normKelas(kelasParam);

  try {
    // 1) Ambil roster (root/<kelas>.json) → peta id -> nis (opsional)
    let idToNis = null;
    try {
      const { exists, data } = await ghGetJsonAgg(token, `${kelas}.json`);
      if (exists && Array.isArray(data)) {
        idToNis = new Map(data.map((s) => [String(s?.id), s?.nis || ""]));
      }
    } catch { /* optional */ }

    // 2) Ambil agregat absensi (absensi/<kelas>.json)
    const { exists: aggExists, data: aggData } = await ghGetJsonAgg(token, `${ABS_DIR}/${kelas}.json`);
    if (!aggExists) return json([]); // belum ada data → kosong

    const records = Array.isArray(aggData?.records) ? aggData.records : [];

    // 3) Filter rentang dan gabungkan item (sertakan tanggal, isi nis bila ada)
    const out = [];
    for (const rec of records) {
      const tgl = rec?.tanggal;
      if (!isDate(tgl)) continue;
      if (tgl < start || tgl > end) continue;

      const items = Array.isArray(rec?.items) ? rec.items : [];
      for (const it of items) {
        const row = { ...it, tanggal: tgl };
        if (idToNis && row.id != null) {
          const nis = idToNis.get(String(row.id));
          if (nis) row.nis = nis;
        }
        out.push(row);
      }
    }

    // Sort by tanggal lalu id (natural-ish)
    out.sort((a, b) => {
      const d = String(a.tanggal).localeCompare(String(b.tanggal));
      if (d !== 0) return d;
      const ai = parseInt(a?.id ?? 0, 10) || 0;
      const bi = parseInt(b?.id ?? 0, 10) || 0;
      return ai - bi;
    });

    return json(out);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}
