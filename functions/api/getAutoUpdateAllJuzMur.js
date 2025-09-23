// functions/api/getAutoUpdateAllJuzMur.js (D1)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const r = await env.DB.prepare(`SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt FROM auto_ranges WHERE kind='mur'`).all();
  return new Response(JSON.stringify(r.results || []), { status: 200, headers: { "Content-Type":"application/json", ...CORS } });
}
