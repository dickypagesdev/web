// /functions/api/saveData.js
// POST /api/saveData
// Body: { kelas, tanggal(YYYY-MM-DD), data: [...rows] }  // 'items' juga didukung sebagai alias dari 'data'
// ENV: GITHUB_TOKEN (repo write)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const ABS_DIR = "absensi";

const UA = { "User-Agent": "cf-pages-functions" };
const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  ...UA,
});
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64enc = (str) => {
  const bytes = enc.encode(str);
  let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64dec = (b64="") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};
const json = (obj, status=200)=>new Response(JSON.stringify(obj), {status, headers:{ "Content-Type":"application/json", ...CORS }});
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

function mergeRow(oldRow={}, newRow={}) {
  const res = { ...oldRow, ...newRow };
  // Merge marks.audio (unique)
  const oldAud = Array.isArray(oldRow?.marks?.audio) ? oldRow.marks.audio : [];
  const newAud = Array.isArray(newRow?.marks?.audio) ? newRow.marks.audio : [];
  const audio = Array.from(new Set([...oldAud, ...newAud]));
  if (!res.marks || typeof res.marks!=="object") res.marks = {};
  if (audio.length) res.marks.audio = audio;
  return res;
}

async function getAgg(env, kelas) {
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(kelas)}.json?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (r.status === 404) return { sha:null, obj:{ meta:{kelas,versi:1}, records:[] } };
  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`Gagal GET agregat (${r.status}): ${t.slice(0,300)}`);
  }
  const meta = await r.json();
  const obj = JSON.parse(b64dec(meta.content||"")||"{}") || {};
  if (!obj.meta) obj.meta = { kelas, versi:1 };
  if (!Array.isArray(obj.records)) obj.records = [];
  return { sha: meta.sha, obj };
}

async function putAgg(env, kelas, obj, sha) {
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(kelas)}.json`;
  const body = {
    message: `saveData: upsert ${kelas}.json`,
    content: b64enc(JSON.stringify(obj, null, 2)),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(url, { method:"PUT", headers: ghHeaders(env.GITHUB_TOKEN), body: JSON.stringify(body) });
  const txt = await r.text();
  let js={}; try{ js = JSON.parse(txt) }catch{}
  if (!r.ok) throw new Error(js?.message || `Gagal PUT agregat (${r.status}): ${txt.slice(0,300)}`);
  return js?.commit?.sha || null;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status:204, headers:CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status:405, headers:CORS });
  if (!env.GITHUB_TOKEN)           return json({ success:false, error:"GITHUB_TOKEN belum diset." }, 500);

  let body={};
  try { body = await request.json() } catch { return json({ success:false, error:"Body JSON tidak valid." }, 400); }

  const kelasParam = body?.kelas;
  const tanggal    = body?.tanggal;
  const incoming   = Array.isArray(body?.data) ? body.data : (Array.isArray(body?.items) ? body.items : null);

  if (!kelasParam || !isDate(tanggal) || !incoming) {
    return json({ success:false, error:"kelas, tanggal(YYYY-MM-DD), dan data(items) wajib." }, 400);
  }

  const kelas = normKelas(kelasParam);

  try {
    // GET agregat
    let { sha, obj } = await getAgg(env, kelas);

    // Upsert record tanggal
    let rec = obj.records.find(r => r?.tanggal === tanggal);
    if (!rec) { rec = { tanggal, items: [] }; obj.records.push(rec); }
    if (!Array.isArray(rec.items)) rec.items = [];

    // Indeks lama by id untuk merge cepat
    const idxById = new Map();
    for (let i=0;i<rec.items.length;i++) {
      const id = rec.items[i]?.id;
      if (id!=null) idxById.set(String(id), i);
    }

    // Merge tiap row
    for (const row of incoming) {
      const key = row?.id!=null ? String(row.id) : null;
      if (!key) continue;
      const pos = idxById.get(key);
      if (pos==null) {
        // entri baru
        rec.items.push( mergeRow({}, row) );
        idxById.set(key, rec.items.length-1);
      } else {
        rec.items[pos] = mergeRow(rec.items[pos], row);
      }
    }

    // Rapikan urutan: sort by id asc
    rec.items.sort((a,b)=> String(a?.id??"").localeCompare(String(b?.id??"")));

    // Sort records by tanggal
    obj.records.sort((a,b)=> String(a?.tanggal??"").localeCompare(String(b?.tanggal??"")));

    // PUT with optimistic locking; jika konflik → refresh sha & retry sekali
    try {
      const commit = await putAgg(env, kelas, obj, sha);
      return json({ success:true, kelas, tanggal, count: rec.items.length, commit });
    } catch (e1) {
      // Refresh & retry (1x)
      const again = await getAgg(env, kelas);
      let rec2 = again.obj.records.find(r=> r?.tanggal===tanggal);
      if (!rec2) { again.obj.records.push(rec); }
      else { rec2.items = rec.items; }
      again.obj.records.sort((a,b)=> String(a?.tanggal??"").localeCompare(String(b?.tanggal??"")));
      const commit = await putAgg(env, kelas, again.obj, again.sha);
      return json({ success:true, kelas, tanggal, count: (rec2?rec2.items.length:rec.items.length), commit, retried:true });
    }
  } catch(e) {
    return json({ success:false, error:String(e.message||e) }, 500);
  }
}
