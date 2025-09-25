// /functions/api/cekAdminWali.js
// POST { password } → 200 valid / 401 salah

import { getJsonSmart } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (o,s=200)=> new Response(JSON.stringify(o),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status:405, headers:CORS });
  if (!env.GITHUB_TOKEN)           return json({ message:"GITHUB_TOKEN belum diset." },500);

  let body={}; try { body = await request.json(); } catch { return json({ message:"Body bukan JSON valid." },400); }
  const { password } = body || {};
  if (!password) return json({ message:"Password wajib diisi." },400);

  const r = await getJsonSmart("secureWali.json", env.GITHUB_TOKEN);
  if (!r.ok)  return json({ message:`Gagal ambil secureWali.json`, error:r.error }, r.status || 500);
  if (!r.exists) return json({ message:"secureWali.json tidak ditemukan." },404);

  const ok = (r.data?.adminPassword || "") === password; // sesuaikan jika key berbeda
  return json({ message: ok ? "Password wali valid." : "Password wali salah." }, ok ? 200 : 401);
}
