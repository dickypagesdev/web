// /functions/api/listTanggalKelas.js
// GET /api/listTanggal?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// ENV: GITHUB_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const DIR = "absensi";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});
const dec = new TextDecoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end") || "";
  if (!kelasParam) return json({ error: "Query ?kelas wajib." }, 400);

  const kelas = normKelas(kelasParam);
  const file  = `${kelas}.json`;
  const contentsUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(DIR)}/${encodeURIComponent(file)}?ref=${encodeURIComponent(BRANCH)}`;

  // GET file agregat
  const r = await fetch(contentsUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (r.status === 404) return json([]); // belum ada → kosong
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json({ error: `Gagal fetch file agregat (${r.status})`, detail: t.slice(0, 300) }, r.status);
  }
  const meta = await r.json();
  let obj = {};
  try { obj = JSON.parse(b64decode(meta.content || "")) } catch { obj = {}; }
  const records = Array.isArray(obj?.records) ? obj.records : [];

  // Kumpulkan tanggal
  let dates = records
    .map(r => r?.tanggal)
    .filter(Boolean)
    .map(String);

  // Unik + sort
  dates = Array.from(new Set(dates)).sort((a, b) => a.localeCompare(b));

  // Filter start/end (opsional)
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
  if (validDate(start)) dates = dates.filter(d => d >= start);
  if (validDate(end))   dates = dates.filter(d => d <= end);

  return json(dates);
}