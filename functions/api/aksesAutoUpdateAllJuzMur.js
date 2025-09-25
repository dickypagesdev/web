// /functions/api/aksesAutoUpdateAllJuzMur.js
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const FILE_PATH = "autoUpdateAllJuzMur.json";
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"GET, POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, Authorization" } });

export const onRequestOptions = () => json({}, 204);

export async function onRequestGet({ env }) {
  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset" }, 500);
  try {
    const got = await ghGetJsonAgg(token, FILE_PATH);
    const data = got.exists ? got.data : {};
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin":"*" } });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset" }, 500);

  let body = {};
  try { body = await request.json(); }
  catch { return json({ error: "Body bukan JSON valid" }, 400); }

  const { kelas } = body || {};
  if (!kelas) return json({ error: "Wajib: kelas" }, 400);

  try {
    const got = await ghGetJsonAgg(token, FILE_PATH);
    const obj = got.exists && typeof got.data === "object" ? got.data : {};
    obj[kelas] = body; // upsert by kelas
    await ghPutJsonAgg(token, FILE_PATH, obj, null, `aksesAutoUpdateAllJuzMur: ${kelas}`);
    return json({ ok: true, saved: obj[kelas] }, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (!["GET", "POST", "OPTIONS"].includes(m)) return json({ error: "Method Not Allowed" }, 405);
}
