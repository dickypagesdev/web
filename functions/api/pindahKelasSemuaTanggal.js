// /functions/api/pindahKelasSemuaTanggal.js
// POST body: { asal, tujuan, ids?: number[], idMap?: { [oldId]: newId } }
// Memindahkan items untuk SEMUA tanggal dari absensi/<asal>.json ke absensi/<tujuan>.json
// ENV: GITHUB_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const ABS_DIR = "absensi";

const UA = { "User-Agent": "cf-pages-functions" };
const ghHeaders = (t)=>({ Authorization:`Bearer ${t}`, Accept:"application/vnd.github.v3+json", "Content-Type":"application/json", ...UA });
const enc = new TextEncoder(); const dec = new TextDecoder();
const b64enc = (s)=>{ const by=enc.encode(s); let bin=""; for (let i=0;i<by.length;i++) bin+=String.fromCharCode(by[i]); return btoa(bin); };
const b64dec = (b="")=>{ const bin=atob(b); const by=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) by[i]=bin.charCodeAt(i); return dec.decode(by); };
const json = (o,s=200)=> new Response(JSON.stringify(o),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});
const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);

async function getAgg(env, kelas) {
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(kelas)}.json?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (r.status === 404) return { sha:null, obj:{ meta:{kelas,versi:1}, records:[] } };
  if (!r.ok) { const t = await r.text().catch(()=> ""); throw new Error(`GET ${kelas}.json gagal (${r.status}): ${t.slice(0,300)}`); }
  const meta = await r.json();
  let obj={}; try{ obj = JSON.parse(b64dec(meta.content||"")||"{}") }catch{ obj={}; }
  if (!obj.meta) obj.meta = { kelas, versi:1 };
  if (!Array.isArray(obj.records)) obj.records = [];
  return { sha:meta.sha, obj };
}
async function putAgg(env, kelas, obj, sha, msg) {
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(kelas)}.json`;
  const body = { message: msg, content: b64enc(JSON.stringify(obj,null,2)), branch: BRANCH, ...(sha?{sha}:{}) };
  const r = await fetch(url, { method:"PUT", headers: ghHeaders(env.GITHUB_TOKEN), body: JSON.stringify(body) });
  const txt = await r.text(); let js={}; try{js=JSON.parse(txt)}catch{}
  if (!r.ok) throw new Error(js?.message || `PUT ${kelas}.json gagal (${r.status}): ${txt.slice(0,300)}`);
  return js?.commit?.sha || null;
}

export async function onRequest({ request, env }) {
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="POST")   return new Response("Method Not Allowed",{status:405,headers:CORS});
  if (!env.GITHUB_TOKEN)         return json({success:false,error:"GITHUB_TOKEN belum diset."},500);

  let body={}; try{ body = await request.json() }catch{ return json({success:false,error:"Body JSON tidak valid."},400); }
  let { asal, tujuan, ids, idMap } = body||{};
  if (!asal || !tujuan) return json({success:false,error:"asal & tujuan wajib."},400);
  asal = normKelas(asal); tujuan = normKelas(tujuan);
  const idsSet = Array.isArray(ids) && ids.length ? new Set(ids.map(x=> String(x))) : null;
  idMap = (idMap && typeof idMap==="object") ? idMap : {};

  try {
    // GET kedua file agregat
    let { sha:shaA, obj:aggA } = await getAgg(env, asal);
    let { sha:shaB, obj:aggB } = await getAgg(env, tujuan);

    // Index target records by tanggal
    const mapB = new Map( aggB.records.map((r)=> [String(r?.tanggal), r]) );

    // Proses setiap record tanggal di asal
    let movedCount = 0;
    for (const recA of aggA.records) {
      if (!recA || !Array.isArray(recA.items)) continue;
      const tgl = recA.tanggal;
      // siapkan record B
      let recB = mapB.get(String(tgl));
      if (!recB) { recB = { tanggal: tgl, items: [] }; aggB.records.push(recB); mapB.set(String(tgl), recB); }
      if (!Array.isArray(recB.items)) recB.items = [];

      // index dest by id
      const idxB = new Map(recB.items.map((x,i)=> [String(x?.id), i]));

      // filter & pindahkan
      const remainA = [];
      for (const row of recA.items) {
        const rid  = row?.id!=null ? String(row.id) : null;
        if (!rid) { remainA.push(row); continue; }

        // pilih berdasarkan ids jika disediakan
        if (idsSet && !idsSet.has(rid)) { remainA.push(row); continue; }

        // remap id jika ada
        const newId = idMap[rid] ? String(idMap[rid]) : rid;
        const newRow = { ...row, id: newId };

        // merge ke B (dedup id)
        const posB = idxB.get(newId);
        if (posB==null) {
          recB.items.push(newRow);
          idxB.set(newId, recB.items.length-1);
        } else {
          // merge sederhana: data tujuan ditimpa field baru, plus gabung marks.audio
          const old = recB.items[posB] || {};
          const merged = { ...old, ...newRow };
          const aOld = Array.isArray(old?.marks?.audio)?old.marks.audio:[];
          const aNew = Array.isArray(newRow?.marks?.audio)?newRow.marks.audio:[];
          const au = Array.from(new Set([...aOld, ...aNew]));
          if (!merged.marks || typeof merged.marks!=="object") merged.marks = {};
          if (au.length) merged.marks.audio = au;
          recB.items[posB] = merged;
        }
        movedCount++;
      }

      // sisakan di asal
      recA.items = remainA;
    }

    // rapikan: bersihkan record kosong di asal (opsional)
    aggA.records = aggA.records.filter(r => Array.isArray(r?.items) && r.items.length>0);
    // sort by tanggal
    aggA.records.sort((a,b)=> String(a?.tanggal??"").localeCompare(String(b?.tanggal??"")));
    aggB.records.sort((a,b)=> String(a?.tanggal??"").localeCompare(String(b?.tanggal??"")));
    for (const r of aggB.records) r.items?.sort?.((a,b)=> String(a?.id??"").localeCompare(String(b?.id??"")));

    // PUT keduanya (optimistic)
    const msg = `pindahKelasSemuaTanggal: ${asal} → ${tujuan}, moved=${movedCount}`;
    try {
      const cB = await putAgg(env, tujuan, aggB, shaB, msg);
      const cA = await putAgg(env, asal,   aggA, shaA, msg);
      return json({ success:true, moved:movedCount, commit:{ tujuan:cB, asal:cA } });
    } catch(e1) {
      // refresh & retry single shot
      const againA = await getAgg(env, asal);
      const againB = await getAgg(env, tujuan);
      const cB = await putAgg(env, tujuan, aggB, againB.sha, msg+" (retry)");
      const cA = await putAgg(env, asal,   aggA, againA.sha, msg+" (retry)");
      return json({ success:true, moved:movedCount, commit:{ tujuan:cB, asal:cA }, retried:true });
    }
  } catch(e) {
    return json({ success:false, error:String(e.message||e) }, 500);
  }
}
