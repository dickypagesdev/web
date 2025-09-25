// /functions/api/getAyat.js
// GET /api/getAyat  → kembalikan isi getAyat.json (RAW-auto)

import { getJsonSmart } from "../_lib/ghjson.js";

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET,OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type,Authorization",
};

export async function onRequest({ env, request }) {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method !== "GET")     return new Response("Method Not Allowed",{status:405,headers:CORS});
  if (!env.GITHUB_TOKEN) return new Response(JSON.stringify({error:"GITHUB_TOKEN belum diset"}),{status:500,headers:{"Content-Type":"application/json",...CORS}});

  const r = await getJsonSmart("getAyat.json", env.GITHUB_TOKEN);
  if (!r.ok) return new Response(JSON.stringify({error:r.error}),{status:r.status||500,headers:{"Content-Type":"application/json",...CORS}});
  return new Response(JSON.stringify(r.data || []), { status:200, headers:{ "Content-Type":"application/json", ...CORS }});
}
