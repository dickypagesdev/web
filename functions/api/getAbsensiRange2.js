import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getAbsensiRange2.js
// GET /api/getAbsensiRange2?kelas=kelas_01&start=YYYY-MM-DD&end=YYYY-MM-DD
// Return: array item gabungan rentang; tiap item dijamin punya 'tanggal'; jika roster ada → tambahkan 'nis'.
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

  if (!kelasParam || !isDate(start) || !isDate(end) || end < start) {
    return json({ error: "Query ?kelas & ?start..end (YYYY-MM-DD) wajib & valid (end ≥ start)." }, 400);
  }

  const kelas = normKelas(kelasParam);

  try {
    // 1) Roster id → nis (opsional; root/<kelas>.json)
    let idToNis = null;
    try {
      const { exists, data } = await ghGetJsonAgg(token, `${kelas}.json`);
      if (exists && Array.isArray(data)) {
        idToNis = new Map(data.map((s) => [String(s?.id), s?.nis || ""]));
      }
    } catch { /* optional */ }

    // 2) File agregat absensi (absensi/<kelas>.json)
    const { exists: aggExists, data: aggData } = await ghGetJsonAgg(token, `${ABS_DIR}/${kelas}.json`);
    if (!aggExists) return json([]); // belum ada data

    const records = Array.isArray(aggData?.records) ? aggData.records : [];

    // 3) Filter rentang → flatten + pastikan 'tanggal' + isi 'nis' bila ada
    const out = [];
    for (const rec of records) {
      const tgl = rec?.tanggal;
      if (!isDate(tgl) || tgl < start || tgl > end) continue;

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

    // 4) Sort: tanggal ASC, lalu id numerik ASC
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
