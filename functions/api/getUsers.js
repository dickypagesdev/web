// /functions/api/getUsers.js
// GET /api/getUsers
import { ghGetJsonAgg } from "./_ghAgg.js";
const CORS={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"GET, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, Authorization" };
const J=(s,d)=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...CORS}});

export async function onRequest({ request, env }){
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method!=="GET")     return J(405,{error:"Method Not Allowed"});

  const token = env.GITHUB_TOKEN;
  if(!token) return J(500,{error:"GITHUB_TOKEN tidak tersedia"});

  try{
    const got = await ghGetJsonAgg(token, "user.json");
    return J(200, got.exists && Array.isArray(got.data) ? got.data : []);
  }catch(e){
    return J(500,{error:String(e?.message||e)});
  }
}
