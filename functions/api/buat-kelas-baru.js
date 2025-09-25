// /functions/api/buat-kelas-baru.js  (opsional revisi)
import { ghPutJsonAgg } from "./_ghAgg.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const token = env.GITHUB_TOKEN;
  if (!token) return new Response(JSON.stringify({ error: "GITHUB_TOKEN tidak tersedia" }), { status: 500 });

  let body = {};
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Body bukan JSON valid" }), { status: 400 }); }

  let { kelas } = body || {};
  if (!kelas) return new Response(JSON.stringify({ error: "Wajib: kelas" }), { status: 400 });
  if (!String(kelas).startsWith("kelas_")) kelas = `kelas_${kelas}`;

  // roster baru = array kosong
  await ghPutJsonAgg(token, `${kelas}.json`, [], null, `buat-kelas-baru: ${kelas}`);
  return new Response(JSON.stringify({ ok: true, kelas }), { status: 200 });
}
