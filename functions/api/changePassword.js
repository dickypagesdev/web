import { ok, bad, parseJSON } from "../_lib/db.js";
export async function onRequestPost({ request, env }){
  const b = await parseJSON(request);
  const { username, password } = b || {};
  if (!username || !password) return bad({ success:false, error:"username & password wajib" });

  await env.DB.prepare(`
    INSERT INTO users_v1 (username, password_hash, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, updated_at=datetime('now')
  `).bind(username, password).run();

  return ok({ success:true });
}
