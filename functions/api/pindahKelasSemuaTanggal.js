// /functions/api/pindahKelasSemuaTanggal.js
// POST /api/pindahKelasSemuaTanggal
// Body JSON:
// {
//   "kelasAsal": "kelas_01" | "01",
//   "kelasTujuan": "kelas_02" | "02",
//   "ids": ["12","34"],          // optional
//   "nises": ["A123","B456"],    // optional
//   "santriIds": ["legacy..."],  // optional (alias lama; juga boleh berisi nama)
//   "idMap": [{ oldId:"12", newId:"112" }] // optional, remap id saat dipindah
// }
// ENV: GITHUB_TOKEN (fallback: MTQ_TOKEN)

import { readAgg, writeAgg } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// --- util helpers ---
const buildPickers = (ids = [], nises = [], legacy = []) => {
  const raw = [...ids, ...nises, ...legacy].map((x) => String(x || "").trim()).filter(Boolean);
  return {
    idPick: new Set(raw),
    nisPick: new Set(raw),
    namePick: new Set(raw.map((v) => v.toLowerCase())), // bisa berisi nama
    hasAny: raw.length > 0,
  };
};
const matchRow = (row, pickers) => {
  const rid = (row.id ?? "").toString();
  const rnis = (row.nis ?? "").toString();
  const rnmL = String(row.nama ?? "").toLowerCase();
  return (rid && pickers.idPick.has(rid)) || (rnis && pickers.nisPick.has(rnis)) || (rnmL && pickers.namePick.has(rnmL));
};
const toIdMap = (arr = []) => {
  const m = new Map();
  for (const x of arr) {
    const o = (x?.oldId ?? "").toString();
    const n = (x?.newId ?? "").toString();
    if (o && n) m.set(o, n);
  }
  return m;
};
const applyIdMap = (row, idMap) => {
  const rid = (row.id ?? "").toString();
  if (rid && idMap.has(rid)) return { ...row, id: idMap.get(rid) };
  return row;
};
const mergeAudio = (a = [], b = []) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));

const dedupMergeByIdNis = (arr) => {
  // dedup by id/nis; kalau tabrakan → shallow-merge + gabung marks.audio
  const byId = new Map();
  const byNis = new Map();
  const out = [];
  const put = (r) => {
    const id = (r?.id ?? "").toString();
    const nis = (r?.nis ?? "").toString();
    let idx = -1;
    if (id && byId.has(id)) idx = byId.get(id);
    else if (nis && byNis.has(nis)) idx = byNis.get(nis);

    if (idx >= 0) {
      const old = out[idx] || {};
      const merged = { ...old, ...r };
      const aOld = old?.marks?.audio;
      const aNew = r?.marks?.audio;
      if (!merged.marks || typeof merged.marks !== "object") merged.marks = {};
      const aud = mergeAudio(aOld, aNew);
      if (aud.length) merged.marks.audio = aud;
      out[idx] = merged;
      return;
    }
    const pos = out.push(r) - 1;
    if (id) byId.set(id, pos);
    if (nis) byNis.set(nis, pos);
  };
  for (const r of arr) put(r);
  out.sort((a, b) => (parseInt(a?.id || 0, 10) || 0) - (parseInt(b?.id || 0, 10) || 0));
  return out;
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Body bukan JSON valid" });
  }

  let { kelasAsal, kelasTujuan, ids, nises, santriIds, idMap } = payload || {};
  if (!kelasAsal || !kelasTujuan) return json(400, { error: "Wajib: kelasAsal & kelasTujuan" });

  const asal = normKelas(kelasAsal);
  const tujuan = normKelas(kelasTujuan);
  const pick = buildPickers(ids, nises, santriIds);
  if (!pick.hasAny) return json(400, { error: "Wajib: minimal satu id/nis (ids/nises/santriIds)" });
  const idMapM = toIdMap(Array.isArray(idMap) ? idMap : []);

  // Baca agregat dengan helper (RAW-auto untuk file besar)
  const src = await readAgg(asal, token);
  if (!src.ok) return json(500, { error: "Gagal baca file asal", detail: src.error, status: src.status });

  const dst = await readAgg(tujuan, token);
  if (!dst.ok) return json(500, { error: "Gagal baca file tujuan", detail: dst.error, status: dst.status });

  const mapDstByDate = new Map((dst.data.records || []).map((r) => [String(r?.tanggal), r]));

  let totalMoved = 0;
  const report = [];

  for (const rec of src.data.records || []) {
    const tgl = String(rec?.tanggal || "");
    if (!isDate(tgl)) continue;

    const items = Array.isArray(rec?.items) ? rec.items : [];
    if (!items.length) continue;

    const toMoveRaw = items.filter((r) => matchRow(r, pick));
    if (!toMoveRaw.length) {
      report.push({ tanggal: tgl, moved: 0, note: "tidak ada match" });
      continue;
    }

    const toMove = toMoveRaw.map((r) => applyIdMap(r, idMapM));
    const remaining = items.filter((r) => !matchRow(r, pick));

    // record tujuan (tanggal yang sama)
    let recDst = mapDstByDate.get(tgl);
    if (!recDst) {
      recDst = { tanggal: tgl, items: [] };
      dst.data.records.push(recDst);
      mapDstByDate.set(tgl, recDst);
    }
    if (!Array.isArray(recDst.items)) recDst.items = [];
    recDst.items = dedupMergeByIdNis([...(recDst.items || []), ...toMove]);

    // kurangi di asal
    rec.items = remaining;

    totalMoved += toMove.length;
    report.push({ tanggal: tgl, moved: toMove.length });
  }

  // bersihkan record kosong di asal
  src.data.records = (src.data.records || []).filter((r) => Array.isArray(r?.items) && r.items.length > 0);

  // sort tanggal & id
  const sortDate = (a, b) => String(a?.tanggal || "").localeCompare(String(b?.tanggal || ""));
  src.data.records.sort(sortDate);
  dst.data.records.sort(sortDate);
  for (const r of dst.data.records || []) {
    if (Array.isArray(r.items)) r.items.sort((a, b) => (parseInt(a?.id || 0, 10) || 0) - (parseInt(b?.id || 0, 10) || 0));
  }

  // Tulis balik (PUT base64 via helper)
  const msg = `pindahKelasSemuaTanggal: ${asal} → ${tujuan}, moved=${totalMoved}`;
  const wDst = await writeAgg(tujuan, dst.data, token, dst.sha || null, msg);
  if (!wDst.ok) return json(500, { error: "Gagal tulis tujuan", detail: wDst.error, status: wDst.status });

  const wSrc = await writeAgg(asal, src.data, token, src.sha || null, msg);
  if (!wSrc.ok) return json(500, { error: "Gagal tulis asal", detail: wSrc.error, status: wSrc.status });

  return json(200, { success: true, totalMoved, details: report });
}
