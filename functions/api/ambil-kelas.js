// /functions/api/ambil-kelas.js
// GET /api/ambil-kelas → ["kelas_01", "kelas_A1", ...] (tanpa .json)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const LIST_URL = `https://api.github.com/repos/${OWNER_REPO}/contents?ref=${encodeURIComponent(BRANCH)}`;

const ghHeaders = (t) => ({
  Authorization: `Bearer ${t}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

const json = (o,s=200)=> new Response(JSON.stringify(o),{status:s,headers:{ "Content-Type":"application/json", ...CORS }});

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (!env.GITHUB_TOKEN)           return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  const res = await fetch(LIST_URL, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (res.status === 404) return json([], 200);
  if (!res.ok) {
    const error = await res.text().catch(()=> "");
    return json({ message: `Gagal fetch file kelas (${res.status})`, error }, res.status);
  }

  const data = await res.json();
  const kelasFiles = (Array.isArray(data)?data:[])
    .filter(f => f?.name && /^kelas_\w+\.json$/i.test(f.name))
    .map(f => f.name.replace(/\.json$/i, ""))
    .sort();

  return json(kelasFiles, 200);
}
