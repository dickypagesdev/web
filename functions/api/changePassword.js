import { ghGetJsonAgg, ghPutJsonAgg } from "../_ghAgg.js";

// /functions/api/changePassword.js
// Cloudflare Pages Functions (ESM). Endpoint: /api/changePassword
//
// Body (POST):
// { "username": "user", "oldPassword": "xxx", "newPassword": "yyy" }
//
// ENV: GITHUB_TOKEN (read/write) — fallback ke MTQ_TOKEN
// Optional ENV override:
// - GITHUB_REPO  : "owner/repo"       (default: dickypagesdev/server)
// - GITHUB_PATH  : "user.json"        (path file user)

const DEFAULT_REPO = "dickypagesdev/server";
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
  // Env & lokasi file
  const TOKEN = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  const REPO  = env.GITHUB_REPO || DEFAULT_REPO;
  const PATH  = env.GITHUB_PATH || DEFAULT_PATH;

  if (!TOKEN) {
    return json({ source: "cf", message: "GITHUB_TOKEN belum diset di Environment Variables." }, 500);
  }

  // Validasi body
  let body;
  try { body = await request.json(); }
  catch { return json({ source: "cf", message: "Body harus JSON." }, 400); }

  const username    = String(body?.username ?? "").trim();
  const oldPassword = String(body?.oldPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");

  if (!username || !oldPassword || !newPassword) {
    return json({ source: "cf", message: "Username, password lama, dan password baru wajib diisi." }, 400);
  }

  try {
    // 1) GET user.json (auto RAW fallback jika besar)
    const { exists, sha, data } = await ghGetJsonAgg(TOKEN, PATH);
    if (!exists) {
      return json({
        source: "github",
        step: "get",
        message: `File ${PATH} tidak ditemukan di repo ${REPO}.`,
        hint: "Buat file user.json (array) terlebih dahulu."
      }, 404);
    }

    let users = Array.isArray(data) ? data.slice() : null;
    if (!Array.isArray(users)) {
      return json({ source: "cf", message: `Format ${PATH} tidak valid (harus array user).` }, 500);
    }

    // 2) Verifikasi user & update password (pencocokan exact)
    const idx = users.findIndex(u => u?.username === username && u?.password === oldPassword);
    if (idx === -1) {
      return json({ source: "cf", message: "Username atau password lama salah." }, 401);
    }

    users[idx] = { ...users[idx], password: newPassword };

    // 3) PUT ke GitHub (minify + auto-retry konflik via helper)
    const message = `changePassword: ${username}`;
    await ghPutJsonAgg(TOKEN, PATH, users, sha || null, message);

    return json({ message: "Password berhasil diubah." }, 200);
  } catch (e) {
    return json({
      source: "cf",
      step: "update",
      message: "Terjadi kesalahan saat memproses perubahan password.",
      error: String(e?.message || e)
    }, 500);
  }
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "OPTIONS") return onRequestOptions();
  if (m === "POST")    return onRequestPost(ctx);
  return json({ message: "Method Not Allowed" }, 405);
}
