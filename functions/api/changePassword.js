// /functions/api/changePassword.js
// POST /api/changePassword  body: { username, passwordBaru }
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: "Body bukan JSON valid" }); }

  const { username, passwordBaru } = body || {};
  if (!username || !passwordBaru) return json(400, { error: "Wajib: username & passwordBaru" });

  try {
    const path = "user.json";
    const got = await ghGetJsonAgg(token, path);
    const users = got.exists && Array.isArray(got.data) ? got.data : [];

    const idx = users.findIndex((u) => String(u?.username || "") === String(username));
    if (idx < 0) return json(404, { error: "User tidak ditemukan" });

    users[idx] = { ...users[idx], password: passwordBaru };
    await ghPutJsonAgg(token, path, users, null, `changePassword: ${username}`);

    return json(200, { ok: true, username });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
