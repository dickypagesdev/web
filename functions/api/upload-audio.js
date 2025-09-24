// /functions/api/upload-audio.js
// POST { fileName, base64, folder?="audio" }
// - sanitize fileName
// - whitelist ext: mp3|m4a|wav
// - optional size limit via AUDIO_MAX_BYTES
// ENV: GITHUB_TOKEN, AUDIO_MAX_BYTES (default 15728640 = 15MB)

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const OWNER_REPO="dickypagesdev/server"; const BRANCH="main";
const UA={"User-Agent":"cf-pages-functions"};
const ghHeaders=(t)=>({Authorization:`Bearer ${t}`,Accept:"application/vnd.github.v3+json","Content-Type":"application/json",...UA});
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"Content-Type":"application/json",...CORS}});

function sanitizeFileName(s) {
  // keep a-z A-Z 0-9 _ - . ; replace others with _
  return String(s||"")
    .trim()
    .replace(/\s+/g,"_")
    .replace(/[^a-zA-Z0-9_.-]/g,"_")
    .replace(/_+/g,"_")
    .slice(0,200);
}
function getExt(s){ const m=/\.([a-z0-9]+)$/i.exec(String(s||"")); return m? m[1].toLowerCase() : ""; }

export async function onRequest({ request, env }) {
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="POST")   return new Response("Method Not Allowed",{status:405,headers:CORS});
  if (!env.GITHUB_TOKEN)         return json({success:false,error:"GITHUB_TOKEN belum diset."},500);

  let body={}; try{ body = await request.json() }catch{ return json({success:false,error:"Body JSON tidak valid."},400); }
  let { fileName, base64, folder } = body||{};
  folder = String(folder||"audio").replace(/[^a-zA-Z0-9_.\-\/]/g,"").replace(/\/+/g,"/").replace(/^\/|\/$/g,"");
  if (!fileName || !base64) return json({success:false,error:"fileName & base64 wajib."},400);

  fileName = sanitizeFileName(fileName);
  const ext = getExt(fileName);
  const ALLOWED = new Set(["mp3","m4a","wav"]);
  if (!ALLOWED.has(ext)) return json({success:false,error:`Ekstensi tidak diizinkan: .${ext}`},400);

  // optional size limit
  const maxBytes = parseInt(env.AUDIO_MAX_BYTES||"15728640",10) || 15728640; // 15MB
  try {
    const raw = atob(String(base64).split(",").pop()||"");
    if (raw.length > maxBytes) {
      return json({success:false,error:`Ukuran audio melebihi batas ${maxBytes} bytes.`},400);
    }
  } catch { /* tidak fatal */ }

  const path = `${folder}/${fileName}`.replace(/^\/+/,"");

  // Cek adanya file (ambil sha)
  const headUrl=`https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;
  let sha=null;
  const head = await fetch(headUrl,{headers:ghHeaders(env.GITHUB_TOKEN)});
  if (head.ok) {
    const meta = await head.json();
    sha = meta.sha || null;
  } else if (head.status!==404) {
    const t=await head.text().catch(()=> ""); return json({success:false,error:`Gagal cek file (${head.status})`,detail:t.slice(0,300)},head.status);
  }

  // PUT
  const putUrl=`https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(path)}`;
  const bodyPut={ message:`upload-audio: ${path}`, content: base64, branch: BRANCH, ...(sha?{sha}:{}) };
  const pr=await fetch(putUrl,{method:"PUT",headers:ghHeaders(env.GITHUB_TOKEN),body:JSON.stringify(bodyPut)});
  const txt=await pr.text(); let js={}; try{js=JSON.parse(txt)}catch{}
  if (!pr.ok) return json({success:false,error:js?.message||`Gagal upload (${pr.status})`,detail:txt.slice(0,300)},pr.status);

  return json({
    success:true,
    path,
    commit: js?.commit?.sha || null,
    contentUrl: js?.content?.download_url || null
  });
}
