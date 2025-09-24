// /functions/api/getTanggalRange.js
// GET /api/getTanggalRange?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// Return: ["2025-09-01","2025-09-02",...]
// ENV: GITHUB_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const ABS_DIR = "absensi";
const UA = { "User-Agent": "cf-pages-functions" };
const ghHeaders = (t)=>({ Authorization:`Bearer ${t}`, Accept:"application/vnd.github.v3+json", ...UA });
const dec = new TextDecoder();
const b64dec = (b="")=>{ const bin=atob(b); const by=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) by[i]=bin.charCodeAt(i); return dec.decode(by); };
const json = (o,s=200)=> new Response(JSON.stringify(o),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});
const normKelas = k => (String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));

export async function onRequest({ request, env }) {
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="GET")    return new Response("Method Not Allowed",{status:405,headers:CORS});
  if (!env.GITHUB_TOKEN)         return json({error:"GITHUB_TOKEN belum diset."},500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end") || "";
  if (!kelasParam) return json({error:"Query ?kelas wajib."},400);

  const kelas = normKelas(kelasParam);
  const contentsUrl = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(kelas)}.json?ref=${encodeURIComponent(BRANCH)}`;

  const r = await fetch(contentsUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (r.status === 404) return json([]);
  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    return json({error:`Gagal fetch agregat (${r.status})`, detail:t.slice(0,300)}, r.status);
  }

  const meta = await r.json();
  let obj={}; try{ obj = JSON.parse(b64dec(meta.content||"")) || {} }catch{ obj={}; }
  const recs = Array.isArray(obj?.records) ? obj.records : [];

  let dates = recs.map(x=> x?.tanggal).filter(Boolean).map(String);
  dates = Array.from(new Set(dates)).sort((a,b)=> a.localeCompare(b));
  if (isDate(start)) dates = dates.filter(d => d>=start);
  if (isDate(end))   dates = dates.filter(d => d<=end);

  return json(dates);
}
