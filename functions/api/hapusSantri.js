// /functions/api/hapusSantri.js
// POST /api/hapusSantri  body:{ kelas, ids?:[], nises?:[], names?:[] }
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, Authorization" };
const normKelas = k => (String(k||"").startsWith("kelas_")?String(k):`kelas_${k}`);
const J=(s,d)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...CORS}});
const sortById = a => [...a].sort((x,y)=>(parseInt(x?.id||0,10)||0)-(parseInt(y?.id||0,10)||0));

export async function onRequest({ request, env }){
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="POST")     return J(405,{error:"Method Not Allowed"});

  const token = env.GITHUB_TOKEN;
  if(!token) return J(500,{error:"GITHUB_TOKEN tidak tersedia"});

  let body={};
  try{ body=await request.json(); }catch{ return J(400,{error:"Body bukan JSON valid"}); }

  let { kelas, ids=[], nises=[], names=[] } = body || {};
  if (!kelas) return J(400,{error:"Wajib: kelas"});
  if (!Array.isArray(ids)) ids=[]; if (!Array.isArray(nises)) nises=[]; if (!Array.isArray(names)) names=[];
  if (ids.length+nises.length+names.length===0) return J(400,{error:"Wajib: minimal satu identifiers (ids/nises/names)"});

  kelas = normKelas(kelas);

  try{
    const got = await ghGetJsonAgg(token, `${kelas}.json`);
    if (!got.exists) return J(404,{error:"Roster tidak ditemukan"});

    const arr = Array.isArray(got.data) ? got.data : [];
    const idSet  = new Set(ids.map(v=>String(v)));
    const nisSet = new Set(nises.map(v=>String(v)));
    const nmSet  = new Set(names.map(v=>String(v).toLowerCase()));

    const remain = arr.filter(r=>{
      const id  = String(r?.id ?? "");
      const nis = String(r?.nis ?? "");
      const nmL = String(r?.nama ?? "").toLowerCase();
      return !( (id && idSet.has(id)) || (nis && nisSet.has(nis)) || (nmL && nmSet.has(nmL)) );
    });

    await ghPutJsonAgg(token, `${kelas}.json`, sortById(remain), null, `hapusSantri: ${kelas}`);
    return J(200,{ ok:true, removed: arr.length-remain.length, remain: remain.length });
  }catch(e){
    return J(500,{error:String(e?.message||e)});
  }
}
