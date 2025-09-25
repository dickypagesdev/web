// Cloudflare Pages Functions — /api/listKelasFiles
// ENV: GITHUB_TOKEN (contents:read) — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";

const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;
const ROOT_CONTENTS_URL = withRef(`https://api.github.com/repos/${OWNER_REPO}/contents`);

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// natural sort (kelas_2 < kelas_10)
const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const naturalSort = (a, b) => coll.compare(String(a), String(b));

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  try {
    const res = await fetch(ROOT_CONTENTS_URL, { headers: ghHeaders(token) });

    if (res.status === 404) {
      // Root kosong → kembalikan list kosong
      return json([]);
    }
    if (!res.ok) {
      const error = await res.text().catch(() => "");
      return json({ message: `Gagal fetch file kelas (${res.status})`, error: error.slice(0, 300) }, res.status);
    }

    const data = await res.json(); // array isi root repo
    // hanya file di ROOT yang match "kelas_*.json"
    const pattern = /^kelas_[^/\\]+\.json$/i;

    const kelasFiles = Array.isArray(data)
      ? data
          .filter((f) => f?.type === "file" && typeof f.name === "string" && pattern.test(f.name))
          .map((f) => f.name.replace(/\.json$/i, "")) // "kelas_1.json" → "kelas_1"
          .sort(naturalSort)
      : [];

    return json(kelasFiles);
  } catch (err) {
    return json({ message: "Terjadi kesalahan server", error: String(err?.message || err) }, 500);
  }
}
