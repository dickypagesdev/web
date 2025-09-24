// /functions/api/updateSemesterKelas.js
// POST { kelas, key, semester }
// ENV: GITHUB_TOKEN, MAX_SEMESTER (default 6)

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const OWNER_REPO="dickypagesdev/server"; const BRANCH="main";
const UA={"User-Agent":"cf-pages-functions"};
const enc=new TextEncoder(), dec=new TextDecoder();
const b64enc=(s)=>{const by=enc.encode(s);let bin="";for(let i=0;i<by.length;i++)bin+=String.fromCharCode(by[i]);return btoa(bin);};
const b64dec=(b="")=>{const bin=atob(b);const by=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)by[i]=bin.charCodeAt(i);return dec.decode(by);};
const ghHeaders=(t)=>({Authorization:`Bearer ${t}`,Accept:"application/vnd.github.v3+json","Content-Type":"application/json",...UA});
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"Content-Type":"application/json",...CORS}});
const normKelas=k=>(String(k||"").startsWith("kelas_")?String(k):`kelas_${k}`);
const clean=(v)=>String(v??"").trim();

export async function onRequest({request,env}){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="POST")return new Response("Method Not Allowed",{status:405,headers:CORS});
  if(!env.GITHUB_TOKEN)return json({success:false,error:"GITHUB_TOKEN belum diset."},500);

  let body={}; try{ body=await request.json() }catch{ return json({success:false,error:"Body JSON tidak valid."},400); }
  let { kelas, key, semester } = body||{};
  kelas=normKelas(kelas); key=clean(key);
  if(!kelas||!key) return json({success:false,error:"kelas & key wajib."},400);

  const MAX_SEM = Math.max(1, parseInt(env.MAX_SEMESTER||"6",10)||6);
  const sem=parseInt(semester,10);
  if(!Number.isInteger(sem) || sem<1 || sem>MAX_SEM) {
    return json({success:false,error:`semester harus 1..${MAX_SEM}.`},400);
  }

  // GET roster
  const url=`https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(kelas)}.json?ref=${encodeURIComponent(BRANCH)}`;
  const r=await fetch(url,{headers:ghHeaders(env.GITHUB_TOKEN)});
  if(r.status===404) return json({success:false,error:"Roster tidak ditemukan."},404);
  if(!r.ok){const t=await r.text().catch(()=> "");return json({success:false,error:`Gagal ambil roster (${r.status})`,detail:t.slice(0,300)},r.status);}
  const meta=await r.json(); const sha=meta.sha;
  let arr=[]; try{arr=JSON.parse(b64dec(meta.content||""))||[]}catch{arr=[];}
  if(!Array.isArray(arr)) arr=[];

  const idx=arr.findIndex(s=>{
    if(!s) return false;
    const sid=String(s.id??"");
    const sn=clean(s.nama); const snis=clean(s.nis);
    return key===sid || key===snis || key===sn;
  });
  if(idx<0) return json({success:false,error:"Santri tidak ditemukan."},404);

  arr[idx].semester = String(sem);

  // PUT
  const putUrl=`https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(kelas)}.json`;
  const bodyPut={message:`updateSemester: ${kelas} key=${key} → ${sem}`,content:b64enc(JSON.stringify(arr,null,2)),branch:BRANCH,sha};
  const pr=await fetch(putUrl,{method:"PUT",headers:ghHeaders(env.GITHUB_TOKEN),body:JSON.stringify(bodyPut)});
  const txt=await pr.text(); let js={}; try{js=JSON.parse(txt)}catch{}
  if(!pr.ok) return json({success:false,error:js?.message||`Gagal simpan (${pr.status})`,detail:txt.slice(0,300)},pr.status);

  return json({success:true, kelas, key, semester:sem, commit:js?.commit?.sha||null});
}
