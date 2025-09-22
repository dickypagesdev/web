export async function onRequestGet({ request, env }){
  const u=new URL(request.url);
  const key = (u.searchParams.get("path")||"").replace(/^\/+/,""); // path di bucket
  if (!key) return new Response("Bad Request", { status:400 });
  const obj = await env.R2_BUCKET.get(key);
  if (!obj) return new Response("Not Found", { status:404 });
  return new Response(obj.body, { headers:{ "Content-Type": obj.httpMetadata?.contentType || "audio/mpeg", "Cache-Control":"public, max-age=31536000" }});
}
