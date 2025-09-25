// /functions/api/daftar-khusus.js
// POST /api/daftar-khusus body: { username, password, kodeKhusus, ... }
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

  const { username, kodeKhusus } = body || {};
  if (!username || !kodeKhusus) return json(400, { error: "Wajib: username & kodeKhusus" });

  try {
    // validasi kodeKhusus dari secure.json
    const sec = await ghGetJsonAgg(token, "secure.json");
    const kode = String(sec?.data?.kodeKhusus || "");
    if (!kode || String(kodeKhusus) !== kode) return json(403, { error: "Kode khusus tidak valid" });

    // upsert user
    const u = await ghGetJsonAgg(token, "user.json");
    const users = u.exists && Array.isArray(u.data) ? u.data : [];
    const idx = users.findIndex((x) => String(x?.username || "") === String(username));
    if (idx >= 0) users[idx] = { ...users[idx], ...body };
    else users.push(body);

    await ghPutJsonAgg(token, "user.json", users, null, `daftar-khusus: ${username}`);
    return json(200, { ok: true, username });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
