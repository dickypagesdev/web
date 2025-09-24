// /functions/api/getAbsensiAll.js
// GET /api/getAbsensiAll?kelas=kelas_01[&start=YYYY-MM-DD&end=YYYY-MM-DD]
// Default: return seluruh objek agregat {meta, records}
// Jika start/end diset: hanya kembalikan subset records dalam rentang
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
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
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
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(file)}?ref=${encodeURIComponent(BRANCH)}`;

  const r = await fetch(contentsUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (r.status === 404) return json({ meta: { kelas, versi: 1 }, records: [] });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json({ error: `Gagal fetch file agregat (${r.status})`, detail: t.slice(0, 300) }, r.status);
  }

  let agg = {};
  try {
    const meta = await r.json();
    agg = JSON.parse(b64decode(meta.content || "")) || {};
  } catch { agg = {}; }

  if (!agg || typeof agg !== "object") agg = {};
  if (!agg.meta) agg.meta = { kelas, versi: 1 };
  if (!Array.isArray(agg.records)) agg.records = [];

  if (isDate(start) || isDate(end)) {
    const s = isDate(start) ? start : "0000-00-00";
    const e = isDate(end) ? end : "9999-12-31";
    agg.records = agg.records.filter((r) => {
      const d = String(r?.tanggal || "");
      return d >= s && d <= e;
    });
  }

  // Tetap kembalikan objek agregat (kompatibel)
  return json(agg);
}
