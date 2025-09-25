// /functions/api/changePassword.js
// POST { username, oldPassword, newPassword }

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
  const { username, oldPassword, newPassword } = body || {};
  if (!username || !oldPassword || !newPassword) return json({ source:"cf", message:"Data wajib: username, oldPassword, newPassword." },400);

  const r = await getJsonSmart("user.json", TOKEN);
  if (!r.ok)     return json({ source:"github", step:"get", error:r.error }, r.status || 502);
  if (!r.exists) return json({ source:"cf", message:"user.json tidak ditemukan." }, 404);

  let users = Array.isArray(r.data) ? r.data : [];
  const idx = users.findIndex(u => u?.username === username && u?.password === oldPassword);
  if (idx === -1) return json({ source:"cf", message:"Username atau password lama salah." },401);

  users[idx] = { ...users[idx], password: newPassword };

  const put = await putJson("user.json", users, TOKEN, r.sha, `Ganti password ${username}`, { minify:false });
  if (!put.ok) return json({ source:"github", step:"put", error: put.error }, put.status || 502);

  return json({ message:"Password berhasil diubah." },200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m !== "POST" && m !== "OPTIONS") return json({ message:"Method Not Allowed" },405);
}
