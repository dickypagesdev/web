// /functions/api/pindahKelasSemuaTanggal.js
// Body:
// {
//   "kelasAsal": "kelas_01" | "01",
//   "kelasTujuan": "kelas_02" | "02",
//   "ids": ["12","34"],          // optional
//   "nises": ["A123","B456"],    // optional
//   "santriIds": ["legacy..."],  // optional (alias lama; juga boleh berisi nama)
//   "idMap": [{ oldId:"12", newId:"112" }] // optional
// }
// ENV: GITHUB_TOKEN (fallback: MTQ_TOKEN)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH     = "main";
const API_BASE   = `https://api.github.com/repos/${OWNER_REPO}/contents`;
const ABS_DIR    = "absensi";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
});

const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));

// === base64 helpers ===
const dec = new TextDecoder();
const enc = new TextEncoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};
const b64encode = (str = "") => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

// --- GitHub helpers (agregat) ---
async function readAggFile(kelas, token) {
  const path = `${ABS_DIR}/${kelas}.json`;
  const res = await fetch(withRef(`${API_BASE}/${path}`), { headers: ghHeaders(token) });
  if (res.status === 404) {
    return { ok: true, exists: false, sha: null, data: { meta:{kelas,versi:1}, records:[] } };
  }
  if (!res.ok) {
    const err = await res.text().catch(()=>"");
    return { ok:false, status:res.status, error:err };
  }
  const js = await res.json();
  let obj = {};
  try { obj = JSON.parse(b64decode(js.content || "")) || {}; } catch { obj = {}; }
  if (!obj.meta) obj.meta = { kelas, versi: 1 };
  if (!Array.isArray(obj.records)) obj.records = [];
  return { ok:true, exists:true, sha:js.sha, data: obj };
}
async function writeAggFile(kelas, obj, token, sha=null, message="update") {
  const path = `${ABS_DIR}/${kelas}.json`;
  const body = {
    message,
    content: b64encode(JSON.stringify(obj, null, 2)),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  const url = `${API_BASE}/${path}`;
  let res = await fetch(url, { method:"PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    const ref = await fetch(withRef(url), { headers: ghHeaders(token) });
    if (ref.status === 200) {
      const meta = await ref.json();
      res = await fetch(url, { method:"PUT", headers: ghHeaders(token),
        body: JSON.stringify({ ...body, sha: meta.sha }) });
    }
  }
  if (!res.ok) {
    const err = await res.text().catch(()=>"");
    return { ok:false, status:res.status, error:err };
  }
  return { ok:true };
}

// --- util helpers ---
const buildPickers = (ids=[], nises=[], legacy=[]) => {
  const raw = [...ids, ...nises, ...legacy].map(x => String(x||"").trim()).filter(Boolean);
  return {
    idPick:   new Set(raw),
    nisPick:  new Set(raw),
    namePick: new Set(raw.map(v => v.toLowerCase())),
    hasAny:   raw.length > 0
  };
};
const matchRow = (row, pickers) => {
  const rid  = (row.id   ?? "").toString();
  const rnis = (row.nis  ?? "").toString();
  const rnmL = String(row.nama ?? "").toLowerCase();
  return (rid && pickers.idPick.has(rid)) || (rnis && pickers.nisPick.has(rnis)) || (rnmL && pickers.namePick.has(rnmL));
};
const toIdMap = (arr=[]) => {
  const m = new Map();
  for (const x of arr) {
    const o = (x?.oldId??"").toString();
    const n = (x?.newId??"").toString();
    if (o && n) m.set(o, n);
  }
  return m;
};
const applyIdMap = (row, idMap) => {
  const rid = (row.id ?? "").toString();
  if (rid && idMap.has(rid)) return { ...row, id: idMap.get(rid) };
  return row;
};
const mergeAudio = (a=[], b=[]) => Array.from(new Set([...(Array.isArray(a)?a:[]), ...(Array.isArray(b)?b:[])]));

const dedupMergeByIdNis = (arr) => {
  const byId = new Map(), byNis = new Map(), out = [];
  const put = (r) => {
    const id  = (r?.id  ?? "").toString();
    const nis = (r?.nis ?? "").toString();
    let idx = -1;
    if (id && byId.has(id)) idx = byId.get(id);
    else if (nis && byNis.has(nis)) idx = byNis.get(nis);
    if (idx >= 0) {
      const old = out[idx] || {};
      const merged = { ...old, ...r };
      if (!merged.marks || typeof merged.marks!=="object") merged.marks = {};
      const aud = mergeAudio(old?.marks?.audio, r?.marks?.audio);
      if (aud.length) merged.marks.audio = aud;
      out[idx] = merged; return;
    }
    const pos = out.push(r) - 1;
    if (id)  byId.set(id, pos);
    if (nis) byNis.set(nis, pos);
  };
  for (const r of arr) put(r);
  out.sort((a,b)=> (parseInt(a?.id||0,10)||0) - (parseInt(b?.id||0,10)||0));
  return out;
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let payload = {};
  try { payload = await request.json(); }
  catch { return json(400, { error: "Body bukan JSON valid" }); }

  let { kelasAsal, kelasTujuan, ids, nises, santriIds, idMap } = payload || {};
  if (!kelasAsal || !kelasTujuan) return json(400, { error: "Wajib: kelasAsal & kelasTujuan" });

  const asal   = normKelas(kelasAsal);
  const tujuan = normKelas(kelasTujuan);
  const pick   = buildPickers(ids, nises, santriIds);
  if (!pick.hasAny) return json(400, { error: "Wajib: minimal satu id/nis (ids/nises/santriIds)" });
  const idMapM = toIdMap(Array.isArray(idMap) ? idMap : []);

  // Baca agregat asal & tujuan
  const src = await readAggFile(asal, token);
  if (!src.ok) return json(500, { error: "Gagal baca file asal", detail: src.error, status: src.status });
  const dst = await readAggFile(tujuan, token);
  if (!dst.ok) return json(500, { error: "Gagal baca file tujuan", detail: dst.error, status: dst.status });

  const mapDstByDate = new Map(dst.data.records.map(r => [String(r?.tanggal), r]));

  let totalMoved = 0;
  const report = [];

  for (const rec of src.data.records) {
    const tgl = String(rec?.tanggal || "");
    if (!isDate(tgl)) continue;

    const items = Array.isArray(rec?.items) ? rec.items : [];
    if (!items.length) continue;

    const toMoveRaw = items.filter(r => matchRow(r, pick));
    if (!toMoveRaw.length) {
      report.push({ tanggal: tgl, moved: 0, note: "tidak ada match" });
      continue;
    }

    const toMove = toMoveRaw.map(r => applyIdMap(r, idMapM));
    const remaining = items.filter(r => !matchRow(r, pick));

    // record tujuan
    let recDst = mapDstByDate.get(tgl);
    if (!recDst) { recDst = { tanggal: tgl, items: [] }; dst.data.records.push(recDst); mapDstByDate.set(tgl, recDst); }
    if (!Array.isArray(recDst.items)) recDst.items = [];
    recDst.items = dedupMergeByIdNis([...(recDst.items||[]), ...toMove]);

    // kurangi di asal
    rec.items = remaining;

    totalMoved += toMove.length;
    report.push({ tanggal: tgl, moved: toMove.length });
  }

  // bersihkan record kosong di asal
  src.data.records = src.data.records.filter(r => Array.isArray(r?.items) && r.items.length > 0);

  // sort
  const sortDate = (a,b)=> String(a?.tanggal||"").localeCompare(String(b?.tanggal||""));
  src.data.records.sort(sortDate);
  dst.data.records.sort(sortDate);
  for (const r of dst.data.records) r.items?.sort?.((a,b)=> (parseInt(a?.id||0,10)||0) - (parseInt(b?.id||0,10)||0));

  const msg = `pindahKelasSemuaTanggal: ${asal} → ${tujuan}, moved=${totalMoved}`;
  const wDst = await writeAggFile(tujuan, dst.data, token, dst.sha || null, msg);
  if (!wDst.ok) return json(500, { error:"Gagal tulis tujuan", detail:wDst.error, status:wDst.status });
  const wSrc = await writeAggFile(asal,   src.data, token, src.sha || null, msg);
  if (!wSrc.ok) return json(500, { error:"Gagal tulis asal", detail:wSrc.error, status:wSrc.status });

  return json(200, { success:true, totalMoved, details: report });
}
