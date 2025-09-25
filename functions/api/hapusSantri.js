// /functions/api/hapusSantri.js
// POST { kelas: "kelas_01" | "01", identifier: "<id-atau-nis>" }
import { readRoster, writeRoster } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (s,d)=> new Response(JSON.stringify(d), { status:s, headers:{ "Content-Type":"application/json", ...CORS } });
const normKelas = (k) => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN belum diset di environment." });

  let body; try { body = await request.json(); } catch { return json(400, { error: "Body bukan JSON valid." }); }
  const { kelas, id
