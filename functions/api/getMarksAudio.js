// /functions/api/getMarksAudio.js
// GET /api/getMarksAudio?kelas=kelas_01&tanggal=YYYY-MM-DD&id=123
// Return: { nama, marks } ; jika tanggal atau santri tak ada → 404 (kompat perilaku lama)
// ENV: GITHUB_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const ABS_DIR = "absensi";

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
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")     return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (!env.GITHUB_TOKEN)            return json({ error: "GITHUB_TOKEN belum diset di environment." }, 500);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const tanggalParam = url.searchParams.get("tanggal");
  const kelasParam   = url.searchParams.get("kelas");
  if (!id || !kelasParam || !isDate(tanggalParam))
    return json({ error: "Query ?id, ?kelas, ?tanggal(YYYY-MM-DD) wajib." }, 400);

  const kelas   = normKelas(kelasParam);
  const tanggal = tanggalParam;

  // Ambil agregat: absensi/<kelas>.json
  const contentsUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(ABS_DIR)}/${encodeURIComponent(kelas)}.json?ref=${encodeURIComponent(BRANCH)}`;

  const r = await fetch(contentsUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (r.status === 404)
    return json({ error: "File absensi tidak ditemukan." }, 404); // kompat lama (404 bila tak ada) :contentReference[oaicite:10]{index=10}
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json({ error: `Gagal ambil file absensi (${r.status}).`, detail: t.slice(0, 300) }, r.status);
  }

  let obj = {};
  try {
    const meta = await r.json();
    obj = JSON.parse(b64decode(meta.content || "")) || {};
  } catch { obj = {}; }

  const records = Array.isArray(obj?.records) ? obj.records : [];
  const rec = records.find((x) => x?.tanggal === tanggal);
  if (!rec) return json({ error: "File absensi tidak ditemukan." }, 404); // selaras perilaku lama :contentReference[oaicite:11]{index=11}

  const items = Array.isArray(rec?.items) ? rec.items : [];
  const santri = items.find((s) => s && s.id == id); // longgar == seperti versi lama :contentReference[oaicite:12]{index=12}
  if (!santri) return json({ error: "Santri tidak ditemukan." }, 404);

  const marks = santri.marks || {};
  return json({ nama: santri.nama, marks }, 200);
}
