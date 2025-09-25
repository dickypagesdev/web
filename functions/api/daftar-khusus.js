import { ghGetJsonAgg, ghPutJsonAgg } from "../_ghAgg.js";

// /functions/api/daftar-khusus.js
// Endpoint: POST /api/daftar-khusus
// Body:
// {
//   "username": "admin2",
//   "password": "secret",
//   "adminPassword": "xxx",   // harus cocok dengan secure.json.adminPassword
//   "kelas": ["kelas_01","kelas_A1"] // minimal 1
// }
//
// ENV: GITHUB_TOKEN (read/write) — fallback ke MTQ_TOKEN
// Optional ENV override (nama file di repo):
//   SECURE_PATH = "secure.json"  (default)
//   USER_PATH   = "user.json"    (default)

const DEFAULT_SECURE = "secure.json";
const DEFAULT_USERS  = "user.json";

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
  const TOKEN  = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  const SECURE = env.SECURE_PATH  || DEFAULT_SECURE;
  const USERS  = env.USER_PATH    || DEFAULT_USERS;

  if (!TOKEN) return json({ source: "cf", message: "GITHUB_TOKEN belum diset." }, 500);

  // Ambil body
  let payload;
  try { payload = await request.json(); }
  catch { return json({ source: "cf", message: "Body harus JSON." }, 400); }

  const username      = String(payload?.username ?? "").trim();
  const password      = String(payload?.password ?? "");
  const adminPassword = String(payload?.adminPassword ?? "");
  const kelas         = Array.isArray(payload?.kelas) ? payload.kelas : [];

  if (!username || !password || !adminPassword || !kelas.length) {
    return json({ source: "cf", message: "Data tidak lengkap. (username, password, adminPassword, kelas[] minimal 1)" }, 400);
  }

  // 1) GET secure.json → validasi admin
  let secSha = null, secObj = {};
  try {
    const { exists, sha, data } = await ghGetJsonAgg(TOKEN, SECURE);
    if (!exists) {
      return json({
        source: "github",
        step: "get-secure",
        message: `File ${SECURE} tidak ditemukan di repo.`,
        hint: "Buat secure.json dengan field { adminPassword: \"...\" }"
      }, 404);
    }
    secSha = sha;
    secObj = (data && typeof data === "object") ? data : {};
  } catch (e) {
    return json({ source: "github", step: "get-secure", message: "Gagal membaca secure.json", error: String(e?.message || e) }, 502);
  }

  const realAdminPassword = String(secObj?.adminPassword ?? "");
  if (!realAdminPassword || adminPassword !== realAdminPassword) {
    return json({ source: "cf", message: "Password admin salah." }, 401);
  }

  // 2) GET user.json → ambil daftar users
  let usrSha = null, users = [];
  try {
    const { exists, sha, data } = await ghGetJsonAgg(TOKEN, USERS);
    if (!exists) {
      // Jika belum ada user.json, mulai dari array kosong
      usrSha = null;
      users = [];
    } else {
      usrSha = sha;
      users = Array.isArray(data) ? data.slice() : null;
      if (!Array.isArray(users)) {
        return json({ source: "cf", message: `${USERS} tidak valid (harus array).` }, 500);
      }
    }
  } catch (e) {
    return json({ source: "github", step: "get-users", message: "Gagal membaca user.json", error: String(e?.message || e) }, 502);
  }

  // 3) Cek duplikasi username
  if (users.some((u) => u?.username === username)) {
    return json({ source: "cf", message: "Username sudah terdaftar." }, 409);
  }

  // 4) Tambahkan user baru (CATATAN: password masih plain text mengikuti skema lama)
  const newUser = { username, password, kelas };
  users.push(newUser);

  // 5) PUT update user.json (minify + retry on conflict via helper)
  try {
    const msg = `daftar-khusus: tambah user ${username}`;
    await ghPutJsonAgg(TOKEN, USERS, users, usrSha || null, msg);
  } catch (e) {
    return json({
      source: "github",
      step: "put-users",
      message: `Gagal menyimpan ${USERS} ke GitHub.`,
      error: String(e?.message || e)
    }, 502);
  }

  return json({ message: "User berhasil ditambahkan." }, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "OPTIONS") return onRequestOptions();
  if (m === "POST")    return onRequestPost(ctx);
  return json({ message: "Method Not Allowed" }, 405);
}
