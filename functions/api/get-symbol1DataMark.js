// /functions/api/get-symbol1DataMark.js
// GET /api/get-symbol1DataMark
// Balikkan: { symbol1: {...}, ayahPageMap: {...} }
import { ghGetJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization",
};
const J = (s,d)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...CORS}});

export async function onRequest({ request, env }){
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method !== "GET")    return J(405,{error:"Method Not Allowed"});

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500,{error:"GITHUB_TOKEN tidak tersedia"});

  try{
    const s1  = await ghGetJsonAgg(token, "symbol1.json");      // sesuaikan dgn repo-mu
    const map = await ghGetJsonAgg(token, "ayahPageMap.json");  // sesuaikan dgn repo-mu
    return J(200, { symbol1: s1.exists ? (s1.data||{}) : {}, ayahPageMap: map.exists ? (map.data||{}) : {} });
  }catch(e){
    return J(500,{error:String(e?.message||e)});
  }
}
