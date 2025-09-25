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
  const { kelas, identifier } = body || {};
  if (!kelas || identifier == null) return json(400, { error: "Parameter 'kelas' & 'identifier' wajib." });

  const k = normKelas(kelas);
  const r = await readRoster(k, token);
  if (!r.ok)     return json(r.status || 500, { error: r.error });
  if (!r.exists) return json(404, { error: `File ${k}.json tidak ditemukan.` });

  const arr = Array.isArray(r.data) ? r.data : [];
  const filtered = arr.filter(s => s?.id != identifier && s?.nis != identifier);

  if (filtered.length === arr.length) return json(200, { success: true, deleted: 0, note: "Tidak ada entry yang cocok." });

  const w = await writeRoster(k, filtered, token, r.sha, `Hapus santri ${identifier} dari ${k}.json`);
  if (!w.ok) return json(w.status || 502, { error: w.error });

  return json(200, { success: true, deleted: String(identifier), file: `${k}.json` });
}
