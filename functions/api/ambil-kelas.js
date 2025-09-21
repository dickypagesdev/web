export async function onRequest({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT name FROM classes ORDER BY name"
  ).all();
  return Response.json(results.map(r => r.name));
}
