// /functions/api/selectedayah.js
// GET  → baca selected ayah (opsional filter kelas, nis, from-to)
// POST → upsert/hapus by {kelas, nis, tanggal, ranges|remove}
// Storage: server/selectedayah.json
//
// Skema JSON:
// {
//   "<kelas>": {
//     "<nis>": {
//       "YYYY-MM-DD": [ { "surah": <num>, "from": <num>, "to": <num> }, ... ]
//     }
//   }
// }

import { getJsonSmart, putJson } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FILE_PATH = "server/selectedayah.json";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// ---------- Utils ----------
function inRangeISO(dateISO, fromISO, toISO) {
  if (!fromISO && !toISO) return true;
  if (fromISO && dateISO < fromISO) return false;
  if (toISO && dateISO > toISO) return false;
  return true;
}

function normRange(r) {
  const surah = Number(r?.surah);
  let a = Number(r?.from);
  let b = Number(r?.to);
  if (!Number.isFinite(surah) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a > b) [a, b] = [b, a];
  return { surah, from: a, to: b };
}

function mergeRanges(ranges) {
  // Gabung overlap per surah + sort
  const bySurah = new Map();
  for (const r of ranges || []) {
    const nr = normRange(r);
    if (!nr) continue;
    if (!bySurah.has(nr.surah)) bySurah.set(nr.surah, []);
    bySurah.get(nr.surah).push({ from: nr.from, to: nr.to });
  }
  const out = [];
  for (const [surah, arr] of bySurah.entries()) {
    arr.sort((x, y) => x.from - y.from || x.to - y.to);
    let cur = null;
    for (const seg of arr) {
      if (!cur) { cur = { ...seg }; continue; }
      if (seg.from <= cur.to + 1) {
        cur.to = Math.max(cur.to, seg.to);
      } else {
        out.push({ surah, from: cur.from, to: cur.to });
        cur = { ...seg };
      }
    }
    if (cur) out.push({ surah, from: cur.from, to: cur.to });
  }
  out.sort((a, b) => a.surah - b.surah || a.from - b.from);
  return out;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset di environment." }, 500);

  // ===== GET =====
  if (request.method === "GET") {
    const url   = new URL(request.url);
    const kelas = (url.searchParams.get("kelas") || "").trim();
    const nis   = (url.searchParams.get("nis")   || "").trim();
    const from  = (url.searchParams.get("from")  || "").trim();
    const to    = (url.searchParams.get("to")    || "").trim();

    const r = await getJsonSmart(FILE_PATH, token);
    if (!r.ok) return json({ error: r.error }, r.status || 500);

    const raw = r.data && typeof r.data === "object" ? r.data : {};

    // Tanpa filter kelas → return apa adanya (hati-hati bisa besar)
    if (!kelas) return json(raw, 200);

    const kelasMap = raw[kelas] || {};
    // Filter by kelas + nis + (optional date range)
    if (nis) {
      const perNis = kelasMap[nis] || {};
      const filtered = {};
      for (const tgl of Object.keys(perNis)) {
        if (inRangeISO(tgl, from, to)) filtered[tgl] = perNis[tgl];
      }
      return json({ [nis]: filtered }, 200);
    }

    // Seluruh NIS di kelas tsb
    const result = {};
    for (const oneNis of Object.keys(kelasMap)) {
      const perNis = kelasMap[oneNis] || {};
      const filtered = {};
      for (const tgl of Object.keys(perNis)) {
        if (inRangeISO(tgl, from, to)) filtered[tgl] = perNis[tgl];
      }
      result[oneNis] = filtered;
    }
    return json(result, 200);
  }

  // ===== POST =====
  if (request.method === "POST") {
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Body bukan JSON valid." }, 400);
    }

    const kelas   = String(payload?.kelas || "").trim();
    const nis     = String(payload?.nis   || "").trim();
    const tanggal = String(payload?.tanggal || "").trim();
    const remove  = !!payload?.remove;
    const ranges  = Array.isArray(payload?.ranges) ? payload.ranges : [];

    if (!kelas || !nis || !tanggal) {
      return json({ error: "Parameter 'kelas', 'nis', dan 'tanggal' wajib." }, 400);
    }

    const cur = await getJsonSmart(FILE_PATH, token);
    if (!cur.ok) return json({ error: cur.error }, cur.status || 500);

    const data = (cur.data && typeof cur.data === "object") ? cur.data : {};

    data[kelas] ||= {};
    data[kelas][nis] ||= {};

    if (remove || ranges.length === 0) {
      // Hapus tanggal untuk nis tsb
      delete data[kelas][nis][tanggal];
      if (!Object.keys(data[kelas][nis]).length) delete data[kelas][nis];
      if (!Object.keys(data[kelas]).length) delete data[kelas];
    } else {
      // Upsert + merge rentang untuk tanggal tsb
      data[kelas][nis][tanggal] = mergeRanges(ranges);
    }

    const commitMsg = `selectedayah: upsert kelas=${kelas} nis=${nis} tanggal=${tanggal}`;
    const put = await putJson(FILE_PATH, data, token, cur.sha || null, commitMsg, { minify: false });
    if (!put.ok) return json({ ok: false, error: put.error }, put.status || 502);

    return json({
      ok: true,
      saved: !remove,
      removed: remove,
      kelas, nis, tanggal,
      ranges: data?.[kelas]?.[nis]?.[tanggal] || [],
    }, 200);
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
