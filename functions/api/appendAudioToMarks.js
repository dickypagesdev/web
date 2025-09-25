// /functions/api/appendAudioToMarks.js
// Endpoint: POST /api/appendAudioToMarks
// Body JSON: { id|nis, kelas, tanggal(YYYY-MM-DD), filename }
// ENV: GITHUB_TOKEN (contents:read/write)
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Body bukan JSON valid" });
  }

  let { id, nis, kelas, tanggal, filename } = body || {};
  if (!kelas || !tanggal || !filename || (!id && !nis)) {
    return json(400, { error: "Wajib: kelas, tanggal, filename dan salah satu dari id/nis" });
  }
  kelas = normKelas(kelas);

  try {
    const path = `absensi/${kelas}.json`;
    const got = await ghGetJsonAgg(token, path);

    const obj =
      got.exists && got.data && typeof got.data === "object"
        ? got.data
        : { meta: { kelas, versi: 1 }, records: [] };

    const records = Array.isArray(obj.records) ? obj.records : [];
    let rec = records.find((r) => String(r?.tanggal) === String(tanggal));
    if (!rec) {
      rec = { tanggal, items: [] };
      records.push(rec);
    }
    const items = Array.isArray(rec.items) ? rec.items : (rec.items = []);

    // cari santri by id -> fallback nis
    const findIdx = () =>
      items.findIndex((s) => {
        const sid = String(s?.id ?? "");
        const sNis = String(s?.nis ?? "");
        return (id && sid === String(id)) || (nis && sNis === String(nis));
      });

    let idx = findIdx();
    if (idx === -1) {
      // kalau belum ada → buat entry minimal
      const newRow = { id: id ? String(id) : undefined, nis: nis ? String(nis) : undefined, marks: { audio: [] } };
      items.push(newRow);
      idx = items.length - 1;
    }

    // pastikan marks.audio array
    const row = items[idx];
    if (typeof row.marks !== "object" || row.marks === null) row.marks = {};
    if (!Array.isArray(row.marks.audio)) row.marks.audio = [];

    // append + dedup
    const set = new Set(row.marks.audio.map(String));
    set.add(String(filename));
    row.marks.audio = Array.from(set);

    // sort items by id numerik (jaga konsistensi)
    items.sort(
      (a, b) => (parseInt(a?.id || 0, 10) || 0) - (parseInt(b?.id || 0, 10) || 0)
    );
    // sort records by tanggal
    records.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));

    await ghPutJsonAgg(token, path, obj, null, `appendAudio: ${kelas} ${tanggal}`);

    return json(200, {
      success: true,
      kelas,
      tanggal,
      id: id ?? null,
      nis: nis ?? null,
      audioCount: row.marks.audio.length,
    });
  } catch (err) {
    return json(500, { success: false, error: String(err?.message || err) });
  }
}
