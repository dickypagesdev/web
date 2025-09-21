export async function onRequestPost({ request, env }) {
  const { namaFile } = await request.json();   // contoh: "kelas_012526.json"
  const nama = String(namaFile || '').replace(/\.json$/i,'').trim();
  if (!nama) return new Response(JSON.stringify({message:"nama kelas kosong"}), {status:400});
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO classes(nama) VALUES(?)").bind(nama).run();
    return new Response(JSON.stringify({ ok: true, nama }), { headers:{'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, message:e.message }), { status:500 });
  }
}
