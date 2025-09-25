// /functions/api/aksesAutoUpdateAllJuz.js
// GET  → kembalikan isi JSON apa adanya
// POST → upsert by 'kelas' (metadata ringan)

import { getJsonSmart, putJson } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FILE_PATH = "autoUpdateAllJuz.json";

const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type":"application/json", ...CORS } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  if (request.method === "GET") {
    const r = await getJsonSmart(FILE_PATH, token);
    if (!r.ok) return json({ error: r.error }, r.status || 500);
    return new Response(r.data ? JSON.stringify(r.data) : "[]", { status: 200, headers: { "Content-Type":"application/json", ...CORS } });
  }

  if (request.method === "POST") {
    let payload={}; try { payload = await request.json(); } catch { return json({ error: "Body bukan JSON valid." }, 400); }
    const { fromDate, toDate, kelas, data } = payload || {};
    if (!kelas) return json({ error: "Parameter 'kelas' wajib ada." }, 400);

    // ambil versi terbaru
    const cur = await getJsonSmart(FILE_PATH, token);
    if (!cur.ok) return json({ error: cur.error }, cur.status || 500);

    let arr = Array.isArray(cur.data) ? cur.data : [];
    const nowIso = new Date().toISOString();
    const rec = { kelas, fromDate: fromDate || "", toDate: toDate || "", updatedAt: nowIso, count: Array.isArray(data) ? data.length : 0 };
    const idx = arr.findIndex(x => x && x.kelas === kelas);

    if (idx >= 0) {
      const prev = arr[idx];
      const unchanged =
        String(prev.fromDate || "") === rec.fromDate &&
        String(prev.toDate || "")   === rec.toDate &&
        Number(prev.count || 0)     === rec.count;
      if (unchanged) return json({ ok: true, saved: { ...prev } }, 200);
      arr[idx] = { ...prev, ...rec };
    } else {
      arr.push(rec);
    }

    const put = await putJson(FILE_PATH, arr, token, cur.sha || null, `autoUpdateAllJuz: upsert kelas=${kelas}`, { minify: false });
    if (!put.ok) return json({ ok:false, error: put.error }, put.status || 502);
    return json({ ok:true, saved: rec }, 200);
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
