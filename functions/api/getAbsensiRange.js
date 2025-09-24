// /functions/api/getAbsensiRange.js
// GET /api/getAbsensiRange?kelas=kelas_01&start=YYYY-MM-DD&end=YYYY-MM-DD
// Return: array item gabungan dari rentang [start..end],
// tiap item dijamin punya field 'tanggal', dan (opsional) 'nis' jika ditemukan di roster.
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

async function getJsonFile(env, path) {
  const r = await fetch(
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`,
    { headers: ghHeaders(env.GITHUB_TOKEN) }
  );
  if (r.status === 404) return { notFound: true };
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Fetch ${path} gagal (${r.status}): ${t.slice(0, 300)}`);
  }
  const meta = await r.json();
  let obj = {};
  try { obj = JSON.parse(b64decode(meta.content || "")); } catch {}
  return { obj };
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });
  if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas") || "";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end") || "";

  if (!kelasParam) return json({ error: "Query ?kelas wajib." }, 400);
  if (!isDate(start) || !isDate(end) || end < start)
    return json({ error: "Query ?start & ?end (YYYY-MM-DD) wajib & valid (end >= start)." }, 400);

  const kelas = normKelas(kelasParam);

  try {
    // 1) Ambil roster (root/<kelas>.json) untuk peta id->nis (opsional)
    let idToNis = null;
    try {
      const roster = await getJsonFile(env, `${kelas}.json`); // root
      if (!roster.notFound && Array.isArray(roster.obj)) {
        idToNis = new Map(roster.obj.map((s) => [String(s?.id), s?.nis || ""]));
      }
    } catch { /* optional */ }

    // 2) Ambil agregat absensi (absensi/<kelas>.json)
    const agg = await getJsonFile(env, `${ABS_DIR}/${kelas}.json`);
    if (agg.notFound) return json([]); // belum ada data → kosong

    const records = Array.isArray(agg.obj?.records) ? agg.obj.records : [];

    // 3) Filter rentang dan gabungkan item (sertakan tanggal)
    const out = [];
    for (const rec of records) {
      const tgl = rec?.tanggal;
      if (!isDate(tgl)) continue;
      if (tgl < start || tgl > end) continue;
      const items = Array.isArray(rec?.items) ? rec.items : [];
      for (const it of items) {
        const row = { ...it };
        row.tanggal = tgl; // pastikan tersedia
        if (idToNis && row.id != null) {
          const nis = idToNis.get(String(row.id));
          if (nis) row.nis = nis;
        }
        out.push(row);
      }
    }

    // (Opsional) sort by tanggal lalu id
    out.sort((a, b) => {
      const d = String(a.tanggal).localeCompare(String(b.tanggal));
      if (d !== 0) return d;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });

    return json(out);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
