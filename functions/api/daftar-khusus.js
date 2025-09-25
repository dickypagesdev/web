// /functions/api/daftar-khusus.js
// POST { username, password, kelas:[...], adminPassword }

import { getJsonSmart, putJson } from "../_lib/ghjson.js";

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
  const TOKEN = env.GITHUB_TOKEN;
  if (!TOKEN) return json({ source:"cf", message:"GITHUB_TOKEN belum diset." },500);

  let payload={}; try { payload = await request.json(); } catch { return json({ source:"cf", message:"Body harus JSON." },400); }
  const { username, password, kelas, adminPassword } = payload || {};
  if (!username || !password || !adminPassword || !Array.isArray(kelas) || !kelas.length) {
    return json({ source:"cf", message:"Data tidak lengkap. (username, password, adminPassword, kelas[])" },400);
  }

  // validasi admin
  const sec = await getJsonSmart("secure.json", TOKEN);
  if (!sec.ok) return json({ source:"github", step:"get-secure", error:sec.error }, sec.status || 502);
  const realAdmin = sec.data?.adminPassword || "";
  if (!realAdmin || adminPassword !== realAdmin) return json({ source:"cf", message:"Password admin salah." },401);

  // ambil user.json
  const r = await getJsonSmart("user.json", TOKEN);
  if (!r.ok) return json({ source:"github", step:"get-users", error:r.error }, r.status || 502);

  let users = Array.isArray(r.data) ? r.data : [];
  if (users.some(u => u?.username === username)) return json({ source:"cf", message:"Username sudah terdaftar." },409);

  users.push({ username, password, kelas });

  const put = await putJson("user.json", users, TOKEN, r.sha || null, `Tambah user ${username}`, { minify:false });
  if (!put.ok) return json({ source:"github", step:"put-users", error: put.error }, put.status || 502);

  return json({ message:"User berhasil ditambahkan." },200);
}

export async function onRequest(ctx) {
  if (!["POST","OPTIONS"].includes(ctx.request.method.toUpperCase())) return json({ message:"Method Not Allowed" },405);
}
