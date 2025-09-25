// /functions/api/aksesAutoUpdateAllJuz.js
// ENV: GITHUB_TOKEN
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FILE_PATH = "autoUpdateAllJuz.json";
const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN belum diset" });

  if (request.method === "GET") {
    try {
      const got = await ghGetJsonAgg(token, FILE_PATH);
      const data = got.exists ? got.data : {};
      // kembalikan string JSON apa adanya
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
    } catch (e) {
      return json(500, { error: String(e?.message || e) });
    }
  }

  if (request.method === "POST") {
    // body → { kelas: string, fromDate?: string, toDate?: string, data?: any[] }
    let payload = {};
    try { payload = await request.json(); }
    catch { return json(400, { error: "Body bukan JSON valid." }); }

    const { kelas } = payload || {};
    if (!kelas) return json(400, { error: "Wajib: kelas" });

    try {
      const got = await ghGetJsonAgg(token, FILE_PATH);
      const obj = got.exists && typeof got.data === "object" ? got.data : {};
      obj[kelas] = payload; // upsert by kelas (tetap sesuai pola kamu)
      await ghPutJsonAgg(token, FILE_PATH, obj, null, `aksesAutoUpdateAllJuz: ${kelas}`);
      return json(200, { ok: true, saved: obj[kelas] });
    } catch (e) {
      return json(500, { error: String(e?.message || e) });
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
