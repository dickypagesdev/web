// /functions/api/tambahSantri.js
// POST { kelas, nis, nama, semester, jenjang, keterangan? }
// - ID dialokasikan gap-first
// - Validasi: nis unik, semester 1..MAX_SEMESTER, jenjang A1..A<JENJANG_MAX>
// ENV: GITHUB_TOKEN, MAX_SEMESTER (default 6), JENJANG_MAX (default 34)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const UA = { "User-Agent": "cf-pages-functions" };
const enc = new TextEncoder(), dec = new TextDecoder();
const b64enc = (s) => { const by=enc.encode(s); let bin=""; for (let i=0;i<by.length;i++) bin+=String.fromCharCode(by[i]); return btoa(bin); };
const b64dec = (b="") => { const bin=atob(b); const by=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) by[i]=bin.charCodeAt(i); return dec.decode(by); };
const ghHeaders = (t)=>({ Authorization:`Bearer ${t}`, Accept:"application/vnd.github.v3+json", "Content-Type":"application/json", ...UA });
const json = (o,s=200)=> new Response(JSON.stringify(o),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});

const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const clean = (v)=> String(v??"").trim();
const SP_OK = new Set(["", "SP1","SP2","SP3","SP4"]);

function gapFirstId(existingIds) {
  // existingIds: array of positive integers
  const used = new Set(existingIds.filter(n=> Number.isInteger(n) && n>0));
  let i = 1;
  while (used.has(i)) i++;
  return i;
}

export async function onRequest({ request, env }) {
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="POST")   return new Response("Method Not Allowed",{status:405,headers:CORS});
  if (!env.GITHUB_TOKEN)         return json({success:false,error:"GITHUB_TOKEN belum diset."},500);

  let body={}; try{ body = await request.json() }catch{ return json({success:false,error:"Body JSON tidak valid."},400); }

  let { kelas, nis, nama, semester, jenjang, keterangan } = body||{};
  kelas = normKelas(kelas);
  nis = clean(nis); nama = clean(nama);
  keterangan = clean(keterangan||"");

  const MAX_SEM = Math.max(1, parseInt(env.MAX_SEMESTER||"6",10) || 6);
  const JMAX    = Math.max(1, parseInt(env.JENJANG_MAX||"34",10) || 34);

  // Validasi dasar
  if (!kelas || !nis || !nama) return json({success:false,error:"kelas, nis, nama wajib."},400);
  const sem = parseInt(semester,10);
  if (!Number.isInteger(sem) || sem<1 || sem>MAX_SEM) {
    return json({success:false,error:`semester harus 1..${MAX_SEM}.`},400);
  }
  // validasi jenjang: "", atau "A<number>" dengan 1..JMAX
  jenjang = clean(jenjang||"");
  if (jenjang) {
    const m = /^a(\d+)$/i.exec(jenjang);
    if (!m) return json({success:false,error:`Format jenjang harus A1..A${JMAX} atau kosong.`},400);
    const j = parseInt(m[1],10);
    if (!Number.isInteger(j) || j<1 || j>JMAX) {
      return json({success:false,error:`Jenjang di luar batas (1..${JMAX}).`},400);
    }
    jenjang = `A${j}`;
  }
  if (!SP_OK.has(keterangan)) return json({success:false,error:"keterangan hanya '', SP1..SP4."},400);

  // GET roster
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(kelas)}.json?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders(env.GITHUB_TOKEN) });
  let sha=null, arr=[];
  if (r.status===404) {
    arr = [];
  } else {
    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      return json({success:false,error:`Gagal ambil roster (${r.status})`, detail:t.slice(0,300)}, r.status);
    }
    const meta = await r.json();
    sha = meta.sha;
    try { arr = JSON.parse(b64dec(meta.content||"")) || []; } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
  }

  // NIS unik
  const exists = arr.some(s=> clean(s?.nis) === nis);
  if (exists) return json({success:false,error:`NIS '${nis}' sudah ada di kelas ini.`},400);

  // Alokasi ID gap-first
  const ids = arr.map(s=> parseInt(s?.id,10)).filter(n=> Number.isInteger(n) && n>0);
  const nextId = gapFirstId(ids);

  const row = { id: nextId, nis, nama, semester: String(sem), jenjang: jenjang || "", ...(keterangan?{keterangan}:{}) };
  arr.push(row);

  // Sort by id asc (rapi)
  arr.sort((a,b)=> (parseInt(a.id,10)||0) - (parseInt(b.id,10)||0));

  // PUT
  const putUrl = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(kelas)}.json`;
  const bodyPut = {
    message: `tambahSantri: ${kelas} add id=${nextId} nis=${nis}`,
    content: b64enc(JSON.stringify(arr, null, 2)),
    branch: BRANCH,
    ...(sha?{sha}:{}),
  };
  const pr = await fetch(putUrl, { method:"PUT", headers: ghHeaders(env.GITHUB_TOKEN), body: JSON.stringify(bodyPut) });
  const txt = await pr.text(); let js={}; try{ js=JSON.parse(txt) }catch{}
  if (!pr.ok) return json({success:false,error:js?.message||`Gagal simpan (${pr.status})`, detail: txt.slice(0,300) }, pr.status);

  return json({ success:true, kelas, id: nextId, nis, commit: js?.commit?.sha||null });
}
