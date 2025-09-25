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

  const r = await getJsonSmart("user.json", TO
