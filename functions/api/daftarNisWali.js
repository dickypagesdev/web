import { ghGetJsonAgg, ghPutJsonAgg } from "../_ghAgg.js";

// functions/api/daftarNisWali.js
// Endpoint: POST /api/daftarNisWali
// Validasi admin via secureWali.json, lalu tambah user {username,password,kelas,nis} ke user.json
//
// Body:
// {
//   "username": "wali01",
//   "password": "secret",
//   "kelas": "kelas_01",      // boleh string (satu kelas) atau array; di-normalisasi ke array
//   "nis": "A12345",
//   "adminPassword": "xxxx"
// }
//
// ENV: GITHUB_TOKEN (read/write) — fallback ke MTQ_TOKEN

const SECURE_PATH = "secureWali.json";
const USERS_PATH  = "user.json";

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
  if (!TOKEN) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  // Ambil body
  let body;
  try { body = await request.json(); }
  catch { return json({ message: "Body harus JSON." }, 400); }

  let { username, password, kelas, nis, adminPassword } = body || {};
  username = String(username ?? "").trim();
  password = String(password ?? "");
  adminPassword = String(adminPassword ?? "");
  nis = String(nis ?? "").trim();

  // kelas boleh string atau array → normalisasi ke array non-kosong
  let kelasArr = [];
  if (Array.isArray(kelas)) kelasArr = kelas.map(String).filter(Boolean);
  else if (kelas) kelasArr = [String(kelas)];
  if (!username || !password || !nis || !adminPassword || kelasArr.length === 0) {
    return json({ message: "Data tidak lengkap. (username, password, kelas, nis, adminPassword)" }, 400);
  }

  // 1) Validasi admin via secureWali.json
  try {
    const { exists, data } = await ghGetJsonAgg(TOKEN, SECURE_PATH);
    if (!exists) {
      return json({
        source: "github",
        step: "get-secureWali",
        message: `File ${SECURE_PATH} tidak ditemukan.`,
        hint: "Buat secureWali.json dengan field { \"adminPassword\": \"...\" }"
      }, 404);
    }
    const adminReal = String((data && data.adminPassword) ?? "");
    if (!adminReal || adminPassword !== adminReal) {
      return json({ message: "Password admin salah." }, 401);
    }
  } catch (e) {
    return json({ source: "github", step: "get-secureWali", message: "Gagal membaca secureWali.json", error: String(e?.message || e) }, 502);
  }

  // 2) Ambil user.json (boleh belum ada → mulai array kosong)
  let users = [];
  let shaUsers = null;
  try {
    const { exists, sha, data } = await ghGetJsonAgg(TOKEN, USERS_PATH);
    shaUsers = exists ? (sha || null) : null;
    users = exists ? (Array.isArray(data) ? data.slice() : []) : [];
    if (!Array.isArray(users)) {
      return json({ message: `${USERS_PATH} tidak valid (harus array).` }, 500);
    }
  } catch (e) {
    return json({ source: "github", step: "get-users", message: "Gagal membaca user.json", error: String(e?.message || e) }, 502);
  }

  // 3) Cek duplikasi username
  if (users.some(u => u?.username === username)) {
    return json({ message: "Username sudah ada." }, 409);
  }

  // 4) Tambahkan user baru
  users.push({
    username,
    password,     // CATATAN: saat ini plain text mengikuti skema lama; bisa diupgrade ke hash nanti
    kelas: kelasArr,
    nis,
  });

  // 5) Simpan kembali (minified + auto-retry via helper)
  try {
    const msg = `daftarNisWali: tambah user ${username}`;
    await ghPutJsonAgg(TOKEN, USERS_PATH, users, shaUsers, msg);
  } catch (e) {
    return json({ source: "github", step: "put-users", message: `Gagal menyimpan ${USERS_PATH}`, error: String(e?.message || e) }, 502);
  }

  return json({ message: "User NIS berhasil ditambahkan." }, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "OPTIONS") return onRequestOptions();
  if (m === "POST")    return onRequestPost(ctx);
  return json({ message: "Method Not Allowed" }, 405);
}
