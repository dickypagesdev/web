// /functions/api/daftar-user.js
// POST { username, password, akses_kelas?:[], role? }

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

  let body={}; try { body = await request.json(); } catch { return json({ source:"cf", message:"Body harus JSON." },400); }
  const { username, password, akses_kelas, role } = body || {};
  if (!username || !password) return json({ source:"cf", message:"Username dan password wajib." },400);

  const r = await getJsonSmart("user.json", TOKEN);
  if (!r.ok) return json({ source:"github", step:"get", error:r.error }, r.status || 502);

  let users = Array.isArray(r.data) ? r.data : [];
  if (users.some(u => u?.username === username)) return json({ source:"cf", message:"Username sudah terdaftar." },400);

  users.push({
    username,
    password, // NOTE: sebaiknya di-hash pada iterasi berikutnya
    akses_kelas: Array.isArray(akses_kelas) ? akses_kelas : [],
    role: role || "user",
  });

  const put = await putJson("user.json", users, TOKEN, r.sha || null, `Tambah user ${username}`, { minify:false });
  if (!put.ok) return json({ source:"github", step:"put", error: put.error }, put.status || 502);

  return json({ message:"Pendaftaran berhasil!" },200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m !== "POST" && m !== "OPTIONS") return json({ message:"Method Not Allowed" },405);
}
