// /functions/api/getTanggalRange.js
// GET /api/getTanggalRange?kelas=kelas_01|01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
import { ghGetJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization",
};
const normKelas = k => (String(k||"").startsWith("kelas_")?String(k):`kelas_${k}`);
const J = (s,d)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...CORS}});

export async function onRequest({ request, env }){
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method !== "GET")    return J(405,{error:"Method Not Allowed"});

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500,{error:"GITHUB_TOKEN tidak tersedia"});

  const u = new URL(request.url);
  const kelasParam = u.searchParams.get("kelas");
  if (!kelasParam) return J(400,{error:"Wajib: kelas"});
  const start = u.searchParams.get("start") || "0000-00-00";
  const end   = u.searchParams.get("end")   || "9999-12-31";

  const kelas = normKelas(kelasParam);
  try{
    const {exists, data} = await ghGetJsonAgg(token, `absensi/${kelas}.json`);
    if (!exists) return J(200, []);
    const records = Array.isArray(data?.records) ? data.records : [];
    const dates = Array.from(new Set(
      records
        .map(r=>String(r?.tanggal||""))
        .filter(Boolean)
        .filter(d => d>=start && d<=end)
    )).sort();
    return J(200, dates);
  }catch(e){
    return J(500,{error:String(e?.message||e)});
  }
}
