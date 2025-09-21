export async function onRequest({ request, env }) {
  const { namaFile } = await request.json();
  const name = String(namaFile || '').replace(/\.json$/,'').trim();
  if(!/^kelas_\d+$/i.test(name)) return Response.json({message:'Nama kelas salah'}, {status:400});
  await env.DB.prepare("INSERT OR IGNORE INTO classes(name) VALUES (?)").bind(name).run();
  return Response.json({ success:true });
}
