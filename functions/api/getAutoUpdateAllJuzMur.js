// /functions/api/getAutoUpdateAllJuzMur.js
// GET /api/getAutoUpdateAllJuzMur

import { getJsonSmart } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method !== "GET")     return new Response("Method Not Allowed",{status:405,headers:CORS});
  const token = env.GITHUB_TOKEN; if (!token)
    return new Response(JSON.stringify({error:"GITHUB_TOKEN belum diset di environment."}),{status:500,headers:{"Content-Type":"application/json",...CORS}});

  const r = await getJsonSmart("autoUpdateAllJuzMur.json", token);
  if (!r.ok) return new Response(JSON.stringify({error:r.error}),{status:r.status||500,headers:{"Content-Type":"application/json",...CORS}});
  return new Response(JSON.stringify(r.data || []), { status:200, headers:{ "Content-Type":"application/json", ...CORS }});
}
