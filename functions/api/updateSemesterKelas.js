// /functions/api/updateSemesterKelas.js
// POST /api/updateSemesterKelas
// Body: { kelas, semester, key: { id? | nis? | nama? } }
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const J = (s, d) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return J(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let body = {};
  try { body = await request.json(); } catch { return J(400, { error: "Body bukan JSON valid" }); }

  let { kelas, semester, key } = body || {};
  if (!kelas || (semester === undefined || semester === null) || !key || typeof key !== "object")
    return J(400, { error: "Wajib: kelas, semester, key{}" });

  kelas = normKelas(kelas);
  const path = `${kelas}.json`;

  try {
    const got = await ghGetJsonAgg(token, path);
    if (!got.exists) return J(404, { error: "Roster tidak ditemukan" });

    const arr = Array.isArray(got.data) ? got.data : [];
    const id  = key.id  != null ? String(key.id)  : "";
    const nis = key.nis != null ? String(key.nis) : "";
    const nmL = key.nama ? String(key.nama).toLowerCase() : "";

    const idx = arr.findIndex((r) => {
      const rid = String(r?.id ?? "");
      const rns = String(r?.nis ?? "");
      const rnm = String(r?.nama ?? "").toLowerCase();
      return (id && rid === id) || (nis && rns === nis) || (nmL && rnm === nmL);
    });
    if (idx < 0) return J(404, { error: "Santri tidak ditemukan" });

    arr[idx] = { ...arr[idx], semester: String(semester) };
    await ghPutJsonAgg(token, path, arr, null, `updateSemester: ${kelas} idx=${idx}`);

    return J(200, { ok: true, updatedIndex: idx });
  } catch (e) {
    return J(500, { error: String(e?.message || e) });
  }
}
