// /functions/api/buat-kelas-baru.js
// POST { namaFile }  // contoh: "kelas_01.json" atau "kelas_A1.json"

import { putJson } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const pattern = /^kelas_\w+\.json$/i;

const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type":"application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  let body={}; try { body = await request.json(); } catch { return json({ message: "Body bukan JSON valid." }, 400); }
  const { namaFile } = body || {};
  if (!namaFile || !pattern.test(namaFile)) {
    return json({ message: "Format nama file tidak valid. Gunakan 'kelas_<kode>.json'." }, 400);
  }

  // cek eksistensi
  const metaUrl = `https://api.github.com/repos/dickypagesdev/server/contents/${encodeURIComponent(namaFile)}?ref=main`;
  const r = await fetch(metaUrl, { headers: { Authorization:`Bearer ${token}`, Accept:"application/vnd.github.v3+json" }});
  if (r.ok) return json({ message: "File sudah ada." }, 409);
  if (r.status !== 404) return json({ message:`Gagal cek file (${r.status})`, error: (await r.text().catch(()=> "")) }, r.status);

  // buat file isi awal []
  const put = await putJson(namaFile, [], token, null, `Buat file ${namaFile}`, { minify: false });
  if (!put.ok) return json({ message: `Gagal membuat file (${put.status})`, error: put.error }, put.status || 502);

  return json({ message: `File ${namaFile} berhasil dibuat.` }, 201);
}
