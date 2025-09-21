import { sha256 } from 'js-sha256';

export async function onRequestPost({ request, env }) {
  const { username, password, role } = await request.json();
  if (!username || !password) return new Response(JSON.stringify({message:"invalid"}), {status:400});
  try {
    await env.DB.prepare(
      "INSERT INTO users(username,password_hash,role) VALUES(?,?,?)"
    ).bind(username, sha256(password), role || 'admin').run();
    return new Response(JSON.stringify({ ok:true }), { headers:{'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, message:e.message }), { status:400 });
  }
}
