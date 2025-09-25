// /functions/api/gitFile.js
// GET  /api/gitFile?action=getRaw&path=foo/bar.json
// GET  /api/gitFile?action=getMeta&path=foo/bar.json
// PUT  /api/gitFile?action=put&path=foo/bar.json   body:{ contentBase64, message }
// NOTE: Tidak memaksa JSON; ini gateway generik.
const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${OWNER_REPO}/contents`;

const CORS={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"GET, POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, Authorization" };
const J=(s,d)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...CORS}});
const H=(t,extra={})=>({ Authorization:`Bearer ${t}`, Accept:"application/vnd.github.v3+json", "User-Agent":"cf-pages-gateway", ...extra });
const withRef = (url)=> `${url}?ref=${encodeURIComponent(BRANCH)}`;

export async function onRequest({ request, env }){
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  const token = env.GITHUB_TOKEN;
  if (!token) return J(500,{error:"GITHUB_TOKEN tidak tersedia"});

  const u = new URL(request.url);
  const action = u.searchParams.get("action") || (request.method==="GET" ? "getRaw" : "");
  const path   = u.searchParams.get("path");
  if (!path) return J(400,{error:"Wajib: path"});

  const url = `${API_BASE}/${encodeURIComponent(path)}`;

  try{
    if (request.method==="GET"){
      if (action==="getRaw"){
        const r = await fetch(withRef(url), { headers: H(token,{Accept:"application/vnd.github.raw"}) });
        if (r.status===404) return J(404,{error:"Not found"});
        if (!r.ok) return J(502,{error:`Upstream ${r.status}`});
        const txt = await r.text();

        // ambil sha via meta
        const m = await fetch(withRef(url), { headers: H(token) });
        const meta = m.ok ? await m.json() : {};
        return J(200,{ contentText: txt, sha: meta?.sha || null });
      }

      if (action==="getMeta"){
        const m = await fetch(withRef(url), { headers: H(token) });
        if (m.status===404) return J(404,{error:"Not found"});
        if (!m.ok) return J(502,{error:`Upstream ${m.status}`});
        const meta = await m.json();
        return J(200,{ name: meta?.name, path: meta?.path, sha: meta?.sha, size: meta?.size });
      }

      return J(400,{error:"Unknown GET action"});
    }

    if (request.method==="POST"){
      if (action!=="put") return J(400,{error:"Unknown POST action"});

      let body={};
      try{ body = await request.json(); }catch{ return J(400,{error:"Body bukan JSON valid"}); }
      const { contentBase64, message, sha } = body || {};
      if (!contentBase64) return J(400,{error:"Wajib: contentBase64"});

      const res = await fetch(url, {
        method:"PUT",
        headers: H(token,{"Content-Type":"application/json"}),
        body: JSON.stringify({ message: message||"update", content: contentBase64, branch: BRANCH, ...(sha?{sha}:{}) })
      });

      if (res.status===409 || res.status===422){
        // refresh sha and retry once
        const m = await fetch(withRef(url), { headers: H(token) });
        if (m.ok){
          const meta = await m.json();
          const res2 = await fetch(url,{
            method:"PUT",
            headers:H(token,{"Content-Type":"application/json"}),
            body: JSON.stringify({ message: message||"update", content: contentBase64, branch: BRANCH, sha: meta.sha })
          });
          if (!res2.ok) return J(502,{error:`PUT retry failed ${res2.status}`, detail: await res2.text().catch(()=> "")});
          return J(200,{ ok:true, retried:true });
        }
      }

      if (!res.ok) return J(502,{error:`PUT failed ${res.status}`, detail: await res.text().catch(()=> "")});
      return J(200,{ ok:true, retried:false });
    }

    return J(405,{error:"Method Not Allowed"});
  }catch(e){
    return J(500,{error:String(e?.message||e)});
  }
}
