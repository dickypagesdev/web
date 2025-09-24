// /functions/api/getMarkData.js (alias /api/getData)
// GET /api/getData?kelas=kelas_01&tanggal=YYYY-MM-DD
// Return: array items untuk tanggal tsb, [] jika tidak ada
// ENV: GITHUB_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const ABS_DIR = "absensi";

const UA = { "User-Agent": "cf-pages-functions" };
const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  ...UA,
});
const dec = new TextDecoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")     return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (!env.GITHUB_TOKEN)            return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const tanggal    = url.searchParams.get("tanggal") || "";
  if (!kelasParam || !isDate(tanggal)) return json({ error: "Query ?kelas & ?tanggal(YYYY-MM-DD) wajib." }, 400);

  const kelas = normKelas(kelasParam);
  const file  = `${kelas}.json`;
  const contentsUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(file)}?ref=${encodeURIComponent(BRANCH)}`;

  const r = await fetch(contentsUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (r.status === 404) return json([]); // belum ada → kosong
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json({ error: `Gagal fetch file agregat (${r.status})`, detail: t.slice(0, 300) }, r.status);
  }

  let obj = {};
  try {
    const meta = await r.json();
    obj = JSON.parse(b64decode(meta.content || "")) || {};
  } catch { obj = {}; }

  const recs  = Array.isArray(obj?.records) ? obj.records : [];
  const rec   = recs.find((x) => x?.tanggal === tanggal);
  const items = Array.isArray(rec?.items) ? rec.items : [];

  return json(items);
}
