// /functions/api/tambahSantri.js
// POST /api/tambahSantri
// Body: { kelas, data: { id?, nis?, nama, jenjang?, semester?, keterangan? } }
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const J = (s, d) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

function sortById(a) {
  return [...a].sort((x, y) => (parseInt(x?.id || 0, 10) || 0) - (parseInt(y?.id || 0, 10) || 0));
}
function collectUsedIds(arr) {
  const s = new Set();
  for (const r of arr) {
    const n = parseInt(String(r?.id ?? ""), 10);
    if (Number.isInteger(n) && n > 0) s.add(String(n));
  }
  return s;
}
function allocNextGap(used) {
  let i = 1;
  while (used.has(String(i))) i++;
  return String(i);
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return J(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let body = {};
  try { body = await request.json(); } catch { return J(400, { error: "Body bukan JSON valid" }); }

  let { kelas, data } = body || {};
  if (!kelas || !data || typeof data !== "object") return J(400, { error: "Wajib: kelas & data{}" });

  kelas = normKelas(kelas);
  const path = `${kelas}.json`;

  try {
    const got = await ghGetJsonAgg(token, path);
    const arr = got.exists && Array.isArray(got.data) ? got.data : [];

    // unik NIS
    const nisNew = String(data?.nis ?? "").trim();
    if (nisNew) {
      const exists = arr.some((r) => String(r?.nis ?? "").trim() === nisNew);
      if (exists) return J(409, { error: "NIS sudah ada", nis: nisNew });
    }

    // alokasi ID (gap-first) jika tidak disediakan / tidak valid
    const used = collectUsedIds(arr);
    let id = String(data?.id ?? "").trim();
    if (!/^\d+$/.test(id) || used.has(id)) id = allocNextGap(used);

    const row = {
      id,
      nis: nisNew || "",
      nama: String(data?.nama ?? "").trim(),
      jenjang: String(data?.jenjang ?? ""),
      semester: String(data?.semester ?? ""),
      keterangan: String(data?.keterangan ?? ""),
    };
    const newArr = sortById([...arr, row]);

    await ghPutJsonAgg(token, path, newArr, null, `tambahSantri: ${kelas} id=${id}`);
    return J(200, { ok: true, kelas, id, count: newArr.length });
  } catch (e) {
    return J(500, { error: String(e?.message || e) });
  }
}
