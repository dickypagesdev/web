import { ghGetJsonAgg, ghPutJsonAgg } from "../_ghAgg.js";

// /functions/api/appendAudioToMarks.js
// Endpoint: POST /api/appendAudioToMarks
// Body JSON: { id, kelas, tanggal(YYYY-MM-DD), filename }
// ENV: GITHUB_TOKEN (contents:read/write) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DIR = "absensi";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const normKelas = (k = "") => {
  let v = String(k).trim().replace(/-/g, "_");
  if (!/^kelas_/.test(v)) v = `kelas_${v}`;
  return v;
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const sortByTanggal = (a, b) => String(a?.tanggal || "").localeCompare(String(b?.tanggal || ""));
const sortByIdNumeric = (arr) =>
  arr.sort((a, b) => (parseInt(a?.id || 0, 10) || 0) - (parseInt(b?.id || 0, 10) || 0));

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ success: false, error: "GITHUB_TOKEN belum diset." }, 500);

  // Parse body
  let body = {};
  try { body = await request.json(); }
  catch { return json({ success: false, error: "Body bukan JSON valid." }, 400); }

  let { id, kelas, tanggal, filename } = body || {};
  if (!id || !kelas || !tanggal || !filename) {
    return json({ success: false, error: "Param id, kelas, tanggal, filename wajib ada." }, 400);
  }
  if (!isDate(tanggal)) return json({ success: false, error: "Format tanggal harus YYYY-MM-DD." }, 400);

  const idStr = String(id);
  const kelasNorm = normKelas(kelas);
  const filePath = `${DIR}/${kelasNorm}.json`;

  try {
    // 1) Baca file agregat (auto RAW fallback)
    const { exists, sha, data } = await ghGetJsonAgg(token, filePath);

    // 2) Siapkan struktur agregat
    const agg = (exists && data && typeof data === "object") ? data : { meta: { kelas: kelasNorm, versi: 1 }, records: [] };
    if (!agg.meta) agg.meta = { kelas: kelasNorm, versi: 1 };
    if (!Array.isArray(agg.records)) agg.records = [];

    // 3) Cari/siapkan record untuk tanggal tsb
    let rec = agg.records.find((r) => r && r.tanggal === tanggal);
    if (!rec) {
      rec = { tanggal, items: [] };
      agg.records.push(rec);
      agg.records.sort(sortByTanggal);
    }
    if (!Array.isArray(rec.items)) rec.items = [];

    // 4) Cari/siapkan santri by id
    let sidx = rec.items.findIndex((s) => s && String(s.id) === idStr);
    if (sidx === -1) {
      rec.items.push({ id: idStr, marks: { audio: [] } });
      sidx = rec.items.length - 1;
    }
    const santri = rec.items[sidx];
    if (!santri.marks || typeof santri.marks !== "object") santri.marks = {};
    if (!Array.isArray(santri.marks.audio)) santri.marks.audio = [];

    // 5) Tambahkan filename unik
    const fn = String(filename).trim();
    if (fn && !santri.marks.audio.includes(fn)) {
      santri.marks.audio.push(fn);
    }

    // (opsional) rapikan urutan items by id
    sortByIdNumeric(rec.items);

    // 6) Tulis kembali (minify + retry via helper)
    const message = `appendAudioToMarks: id=${idStr}, file=${fn} (kelas=${kelasNorm}, tgl=${tanggal})`;
    await ghPutJsonAgg(token, filePath, agg, sha || null, message);

    return json({
      success: true,
      file: `${kelasNorm}.json`,
      id: idStr,
      kelas: kelasNorm,
      tanggal,
      filename: fn,
      audioCount: santri.marks.audio.length,
    });

  } catch (err) {
    return json({ success: false, error: String(err?.message || err) }, 500);
  }
}
