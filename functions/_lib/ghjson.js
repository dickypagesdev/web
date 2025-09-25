// /functions/_lib/ghjson.js
// Helper GitHub JSON: tulis via base64 (PUT), baca via RAW jika file besar.
// Cloudflare Pages Functions (ESM)

export const GH_OWNER_REPO = "dickypagesdev/server";
export const GH_BRANCH = "main";
export const RAW_THRESHOLD = 900_000; // ~0.9MB → pakai RAW di atas ini

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64encode = (str = "") => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

const ghHeaders = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
  ...extra,
});
const withRef = (url) => `${url}?ref=${encodeURIComponent(GH_BRANCH)}`;
const API_BASE = `https://api.github.com/repos/${GH_OWNER_REPO}/contents`;

// --- GET JSON (smart): meta dulu → pilih base64 vs RAW ---
export async function getJsonSmart(path, token) {
  const metaURL = withRef(`${API_BASE}/${encodeURIComponent(path)}`);
  const metaRes = await fetch(metaURL, { headers: ghHeaders(token) });

  if (metaRes.status === 404) {
    return { ok: true, exists: false, sha: null, size: 0, data: null, download_url: null };
  }
  if (!metaRes.ok) {
    return { ok: false, status: metaRes.status, error: await metaRes.text().catch(()=>"") };
  }

  const meta = await metaRes.json();
  const size = Number(meta.size || 0);
  const download_url = meta.download_url || null;

  // Jika kecil → ambil dari content (base64)
  if (size > 0 && size <= RAW_THRESHOLD && meta.content) {
    let obj = null;
    try { obj = JSON.parse(b64decode(meta.content)); } catch { obj = null; }
    return { ok: true, exists: true, sha: meta.sha, size, data: obj, download_url };
  }

  // Jika besar → RAW (lebih cepat, tanpa bloat base64)
  // Prefer 'Accept: application/vnd.github.raw'
  const rawHeaders = ghHeaders(token, { Accept: "application/vnd.github.raw" });
  // Bisa pakai download_url (tanpa auth), tapi header auth+raw juga aman:
  const rawURL = download_url || withRef(`${API_BASE}/${encodeURIComponent(path)}`);
  const rawRes = await fetch(rawURL, { headers: rawHeaders });

  if (!rawRes.ok) {
    return { ok: false, status: rawRes.status, error: await rawRes.text().catch(()=>"") };
  }
  let obj = null;
  try { obj = await rawRes.json(); } catch { obj = null; }

  return { ok: true, exists: true, sha: meta.sha, size, data: obj, download_url };
}

// --- PUT JSON (selalu base64, minify opsional) ---
export async function putJson(path, obj, token, sha = null, message = "update", { minify = true } = {}) {
  const contentStr = minify ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
  const body = {
    message,
    content: b64encode(contentStr),
    branch: GH_BRANCH,
    ...(sha ? { sha } : {}),
  };

  const url = `${API_BASE}/${encodeURIComponent(path)}`;
  let res = await fetch(url, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });

  // 1x retry jika konflik SHA
  if (res.status === 409 || res.status === 422) {
    const ref = await fetch(withRef(url), { headers: ghHeaders(token) });
    if (ref.status === 200) {
      const meta = await ref.json();
      res = await fetch(url, { method: "PUT", headers: ghHeaders(token),
        body: JSON.stringify({ ...body, sha: meta.sha }) });
    }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: await res.text().catch(()=>"") };
  }
  return { ok: true };
}

// --- Helper khusus absensi agregat & roster ---
export async function readAgg(kelas, token) {
  const path = `absensi/${kelas}.json`;
  const r = await getJsonSmart(path, token);
  if (!r.ok) return r;
  const obj = r.data || {};
  if (!obj.meta) obj.meta = { kelas, versi: 1 };
  if (!Array.isArray(obj.records)) obj.records = [];
  return { ok: true, exists: r.exists, sha: r.sha, size: r.size, data: obj };
}
export async function writeAgg(kelas, obj, token, sha = null, message = "update absensi") {
  return putJson(`absensi/${kelas}.json`, obj, token, sha, message, { minify: true });
}

export async function readRoster(kelas, token) {
  const path = `${kelas}.json`;
  const r = await getJsonSmart(path, token);
  if (!r.ok) return r;
  const arr = Array.isArray(r.data) ? r.data : [];
  return { ok: true, exists: r.exists, sha: r.sha, size: r.size, data: arr };
}
export async function writeRoster(kelas, arr, token, sha = null, message = "update roster") {
  return putJson(`${kelas}.json`, Array.isArray(arr) ? arr : [], token, sha, message, { minify: false });
}
