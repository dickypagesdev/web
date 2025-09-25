// /functions/api/ambil-kelas-nis.js
// GET /api/ambil-kelas-nis?kelas=01|kelas_01|kelas-01|kelas_01.json

import { readRoster } from "../_lib/ghjson.js";

const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

const normalizeKelasToFile = (raw) => {
  const base = String(raw||"").trim().replace(/\.json$/i, "").replace(/-/g, "_");
  if (/^kelas_/.test(base)) return `${base}.json`;
  const m = base.match(/^(\d{1,2})$/);
  if (m) return `kelas_${m[1].padStart(2,"0")}.json`;
  return `kelas_${base}.json`;
};

export const onRequestOptions = () => json({}, 204);

export async function onRequestGet({ request, env }) {
  const token  = env.GITHUB_TOKEN;
  if (!token) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("kelas") || "").trim();
  if (!raw) return json({ message: "Parameter kelas wajib diisi." }, 400);

  const file = normalizeKelasToFile(raw);              // e.g. "kelas_01.json"
  const kelas = file.replace(/\.json$/i, "");          // e.g. "kelas_01"

  const r = await readRoster(kelas, token);
  if (!r.ok) return json({ source:"github", step:"get-kelas", message: r.error }, r.status || 500);
  if (!r.exists) {
    return json({
      source:"github", step:"get-kelas",
      message:"File kelas tidak ditemukan di repo.",
      tried:[file],
      hint:"Pastikan nama file sesuai, mis. kelas_01.json dan parameter 'kelas=kelas_01' atau 'kelas=01'."
    }, 404);
  }

  const result = (Array.isArray(r.data) ? r.data : []).map(s => ({ id:s?.id, nis:s?.nis, nama:s?.nama }));
  return json(result, 200);
}

export async function onRequest(ctx) {
  if (!["GET", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ message: "Method Not Allowed" }, 405);
  }
}
