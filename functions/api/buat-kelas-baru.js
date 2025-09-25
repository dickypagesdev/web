// /functions/api/createKelasFile.js
// POST /api/createKelasFile
// Body: { namaFile }  // contoh: "kelas_1.json" | "kelas_A1.json" | "kelas_01" | "kelas-01"
// ENV: GITHUB_TOKEN (contents:write) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";

const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;
const rootFileUrl = (name) => `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(name)}`;

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
});

// base64 UTF-8 safe (tanpa Buffer)
const enc = new TextEncoder();
const b64encode = (str = "") => {
  const by = enc.encode(str);
  let bin = "";
  for (let i = 0; i < by.length; i++) bin += String.fromCharCode(by[i]);
  return btoa(bin);
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// Normalisasi nama file agar selalu "kelas_<kode>.json"
function normalizeNamaFile(input = "") {
  let v = String(input).trim();
  if (!v) return "";

  // hilangkan .json bila ada, dan ganti '-' -> '_'
  v = v.replace(/\.json$/i, "").replace(/-/g, "_");

  // pastikan prefix "kelas_"
  if (!/^kelas_/i.test(v)) v = `kelas_${v}`;

  // batasi karakter aman: huruf/angka/underscore
  // (kalau mau ketat, bisa dipersempit lagi)
  if (!/^kelas_[A-Za-z0-9_]+$/i.test(v)) return "";

  return `${v}.json`;
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  // Body
  let body = {};
  try { body = await request.json(); }
  catch { return json({ message: "Body bukan JSON valid." }, 400); }

  const rawNama = body?.namaFile ?? "";
  const namaFile = normalizeNamaFile(rawNama);

  if (!namaFile) {
    return json({
      message: "Format nama file tidak valid. Gunakan 'kelas_<kode>.json' (contoh: kelas_1.json atau kelas_A1.json).",
      hint: "Boleh juga kirim 'kelas_01' atau 'kelas-01'—akan dinormalisasi otomatis."
    }, 400);
  }

  const checkUrl = withRef(rootFileUrl(namaFile));
  const putUrl   = rootFileUrl(namaFile);

  try {
    // 1) Cek apakah file sudah ada
    const checkRes = await fetch(checkUrl, { headers: ghHeaders(token) });
    if (checkRes.ok) {
      return json({ message: "File sudah ada.", file: namaFile }, 409);
    }
    if (checkRes.status !== 404) {
      const errText = await checkRes.text().catch(() => "");
      return json({ message: `Gagal cek file (${checkRes.status}).`, error: errText.slice(0, 300) }, checkRes.status);
    }

    // 2) Buat file baru: isi awal [] (MINIFY, bukan pretty-print)
    const content = b64encode("[]");
    const createRes = await fetch(putUrl, {
      method: "PUT",
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: `Buat file ${namaFile}`,
        content,
        branch: BRANCH,
      }),
    });

    const txt = await createRes.text();
    if (!createRes.ok) {
      return json({ message: `Gagal membuat file (${createRes.status}).`, detail: txt.slice(0, 300) }, createRes.status);
    }

    // Sukses
    return json({ message: `File ${namaFile} berhasil dibuat.` }, 201);

  } catch (err) {
    return json({ message: "Terjadi kesalahan server.", error: String(err?.message || err) }, 500);
  }
}
