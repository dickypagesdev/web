// GET /api/getAyat
export async function onRequest({ env }) {
  const row = await env.DB.prepare("SELECT v FROM ayat_json WHERE k='surah_list'").first();
  return new Response(row?.v || '[]', { headers:{'Content-Type':'application/json'}});
}
