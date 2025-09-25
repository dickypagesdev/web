// functions/api/ambil-kelas-nis.js
// Endpoint: GET /api/ambil-kelas-nis?kelas=01|kelas_01|kelas-01
import { ghGetJsonAgg } from "./_ghAgg.js";

const DEFAULT_REPO = "dickypagesdev/server"; // tetap dipakai kalau kamu ada logic fallback lain
const DEFAULT_BRANCH = "main";

const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

const normKelas = (k) => {
  let v = String(k || "").trim().replace(/-/g, "_");
  if (!/^kelas_/.test(v)) v = `kelas_${v}`;
  return v;
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas");
  if (!kelasParam) return json({ error: "Parameter 'kelas' wajib diisi" }, 400);

  const kelas = normKelas(kelasParam);

  try {
    const got = await ghGetJsonAgg(env.GITHUB_TOKEN, `${kelas}.json`);
    if (!got.exists) return json([], 200);
    const santri = Array.isArray(got.data) ? got.data : [];
    const result = santri.map((s) => ({ id: s?.id, nis: s?.nis, nama: s?.nama }));
    return json(result, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export async function onRequest(ctx) {
  if (!["GET", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ message: "Method Not Allowed" }, 405);
  }
}
