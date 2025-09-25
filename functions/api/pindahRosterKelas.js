// /functions/api/pindahRosterKelas.js
// POST /api/pindahRosterKelas
// Body: { kelasAsal:"01|kelas_01", kelasTujuan:"02|kelas_02", identifiers:["id or nis or nama", ...] }
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, Authorization" };
const norm = k => (String(k||"").startsWith("kelas_")?String(k):`kelas_${k}`);
const J=(s,d)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...CORS}});
const sortById = a => [...a].sort((x,y)=>(parseInt(x?.id||0,10)||0)-(parseInt(y?.id||0,10)||0));

function collectUsedIds(arr){ const s=new Set(); for(const r of arr){ const n=parseInt(String(r?.id??""),10); if(Number.isInteger(n)&&n>0) s.add(String(n)); } return s; }
function allocNext(used){ let i=1; while(used.has(String(i))) i++; return String(i); }

export async function onRequest({ request, env }){
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="POST")     return J(405,{error:"Method Not Allowed"});

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500,{error:"GITHUB_TOKEN tidak tersedia"});

  let body={};
  try{ body = await request.json(); }catch{ return J(400,{error:"Body bukan JSON valid"}); }

  let { kelasAsal, kelasTujuan, identifiers } = body || {};
  if (!kelasAsal || !kelasTujuan || !Array.isArray(identifiers) || !identifiers.length)
    return J(400,{error:"Wajib: kelasAsal, kelasTujuan, identifiers[]"});

  const asal=norm(kelasAsal), tujuan=norm(kelasTujuan);
  const keys = identifiers.map(v=>String(v??"").trim()).filter(Boolean);
  const pickId   = new Set(keys);
  const pickNis  = new Set(keys);
  const pickName = new Set(keys.map(v=>v.toLowerCase()));
  const match = (r) => {
    const id  = String(r?.id ?? "");
    const nis = String(r?.nis ?? "");
    const nmL = String(r?.nama ?? "").toLowerCase();
    return pickId.has(id) || (nis && pickNis.has(nis)) || (nmL && pickName.has(nmL));
  };

  try{
    const s = await ghGetJsonAgg(token, `${asal}.json`);
    if (!s.exists) return J(404,{error:"Roster asal tidak ditemukan"});
    const d = await ghGetJsonAgg(token, `${tujuan}.json`);

    const srcArr = Array.isArray(s.data) ? s.data : [];
    const dstArr = Array.isArray(d.data) ? d.data : [];

    const toMove = srcArr.filter(match);
    if (!toMove.length) return J(404,{error:"Santri tidak ditemukan di kelas asal"});

    const used = collectUsedIds(dstArr);
    const byNis = new Map(); const byNm = new Map();
    dstArr.forEach((r,i)=>{ const nis=String(r?.nis??"").trim(); const nm=String(r?.nama??"").trim().toLowerCase(); if(nis)byNis.set(nis,i); if(nm)byNm.set(nm,i); });

    const mergedOrAdded=[];
    for (const orig of toMove){
      const nis = String(orig?.nis??"").trim();
      const nmL = String(orig?.nama??"").trim().toLowerCase();
      let idx = -1;
      if (nis && byNis.has(nis)) idx = byNis.get(nis);
      else if (nmL && byNm.has(nmL)) idx = byNm.get(nmL);

      if (idx >= 0){
        const keep = dstArr[idx];
        dstArr[idx] = { ...keep, ...orig, id: keep.id }; // jaga id tujuan
        mergedOrAdded.push({ type:"merged", id: keep.id, nis: dstArr[idx].nis });
      } else {
        const newId = allocNext(used); used.add(newId);
        const row = { id:newId, nis:orig?.nis||"", nama:orig?.nama||"", jenjang:orig?.jenjang||"", semester:orig?.semester||"", keterangan:orig?.keterangan||"" };
        dstArr.push(row);
        mergedOrAdded.push({ type:"added", id:newId, nis: row.nis });
      }
    }

    const remained = srcArr.filter(r=>!match(r));
    await ghPutJsonAgg(token, `${tujuan}.json`, sortById(dstArr), null, `pindahRoster: ${asal} → ${tujuan} (${toMove.length})`);
    await ghPutJsonAgg(token, `${asal}.json`,   sortById(remained), null, `pindahRoster remove: ${asal} (${toMove.length})`);

    return J(200,{ ok:true, moved: toMove.length, detail: mergedOrAdded });
  }catch(e){
    return J(500,{error:String(e?.message||e)});
  }
}
