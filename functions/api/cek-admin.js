import { ok } from "../_lib/db.js";
export async function onRequestGet({ request, env }){
  const u=new URL(request.url);
  const username=(u.searchParams.get("username")||"").trim();
  if (!username) return ok({ admin:false, wali:false });

  const row = await env.DB.prepare(`SELECT role FROM users_v1 WHERE username=?`).bind(username).first();
  const role=row?.role||"";
  return ok({ admin: role==="admin", wali: role==="wali" });
}
