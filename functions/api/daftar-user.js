import { ghGetJsonAgg, ghPutJsonAgg } from "../_ghAgg.js";

// /functions/api/daftar-user.js
// Endpoint: POST /api/daftar-user
//
// Body:
// {
//   "username": "nama",
//   "password": "rahasia",
//   "akses_kelas": ["kelas_01","kelas_02"],  // optional (array)
//   "role": "admin"                           // optional, default "user"
// }
//
// ENV: GITHUB_TOKEN (read/write) — fallback ke MTQ_TOKEN
// Optional ENV override:
// - GITHUB_REPO (owner/repo)  [tidak dipakai di helper versi sederhana]
// - GITHUB_PATH (default: "user.json")

const DEFAULT_PATH = "user.json";

const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

export const onRequestOptions = () => json({}, 204);

export async function onRequestPost({ request, env }) {
  const TOKEN = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  const PATH  = env.GITHUB_PATH || DEFAULT_PATH;
  if (!TOKEN) return json({ source: "cf", message: "GITHUB_TOKEN belum diset." }, 500);

  // Ambil body
  let body;
  try { body = await request.json(); }
  catch { return json({ source: "cf", message: "Body harus JSON." }, 400); }

  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const role     = String(body?.role ?? "user").trim() || "user";

  // akses_kelas opsional → normalisasi jadi array of strings
  let akses = [];
  if (Array.isArray(body?.akses_kelas)) {
    akses = body.akses_kelas.map((v) => String(v ?? "")).filter(Boolean);
  }

  if (!username || !password) {
    return json({ source: "cf", message: "Username dan password wajib diisi." }, 400);
  }

  try {
    // 1) GET user.json (auto RAW fallback); jika belum ada → []
    const { exists, sha, data } = await ghGetJsonAgg(TOKEN, PATH);
    let users = exists ? (Array.isArray(data) ? data.slice() : null) : [];
    if (users === null) {
      return json({ source: "cf", message: `Format ${PATH} tidak valid (harus array).` }, 500);
    }

    // 2) Cek duplikasi username
    if (users.some((u) => u?.username === username)) {
      return json({ source: "cf", message: "Username sudah terdaftar." }, 409);
    }

    // 3) Tambah user baru (CATATAN: password masih plain text mengikuti skema lama)
    const userBaru = {
      username,
      password,
      akses_kelas: akses,
      role,
    };
    users.push(userBaru);

    // 4) Simpan kembali (minified + retry on conflict via helper)
    const msg = `daftar-user: tambah user ${username}`;
    await ghPutJsonAgg(TOKEN, PATH, users, exists ? (sha || null) : null, msg);

    return json({ message: "Pendaftaran berhasil!" }, 200);
  } catch (e) {
    return json({
      source: "github",
      step: "update",
      message: "Gagal memproses pendaftaran user.",
      error: String(e?.message || e),
    }, 502);
  }
}

// Guard method lain
export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "OPTIONS") return onRequestOptions();
  if (m === "POST")    return onRequestPost(ctx);
  return json({ message: "Method Not Allowed" }, 405);
}
