import { sha256 } from 'js-sha256'; // opsional; atau simpan hash yang sama saat daftar

export async function onRequestPost({ request, env }) {
  const { password } = await request.json();
  if (!password) return new Response(JSON.stringify({message:"password kosong"}), {status:400});
  // Contoh: admin tunggal (username 'admin'); silakan sesuaikan
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE role='admin' LIMIT 1").first();
  const ok = row && row.password_hash === sha256(password);
  return new Response(JSON.stringify({ authorized: !!ok }), { status: ok?200:401, headers:{'Content-Type':'application/json'} });
}
