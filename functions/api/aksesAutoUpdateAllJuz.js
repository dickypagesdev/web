// Cloudflare Pages Functions — /api/aksesAutoUpdateAllJuz
// GET  -> kembalikan isi file JSON (array) apa adanya
// POST -> upsert by 'kelas' (hanya field yang dikirim yang diubah)
// ENV needed: GITHUB_TOKEN (read/write), fallback ke MTQ_TOKEN jika ada

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const GITHUB_REPO = "dickypagesdev/server";
const FILE_PATH   = "autoUpdateAllJuz.json"; // ubah bila perlu
const BRANCH      = "main";
const API_BASE    = `https://api.github.com/repos/${GITHUB_REPO}/contents`;
const RAW_CUTOFF  = 900_000; // >~0.9MB pakai RAW download (lebih aman & cepat)

// ---- base64 UTF-8 safe helpers ----
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64encode = (str = "") => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64decode = (b64 = "") => {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const ghHeaders = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
  ...extra,
});
const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;
const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// ---- GitHub read (auto RAW fallback) ----
async function ghReadJsonSmart(token, path) {
  const url = `${API_BASE}/${encodeURIComponent(path)}`;
  const metaRes = await fetch(withRef(url), {
    headers: ghHeaders(token),
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  if (metaRes.status === 404) return { exists: false, sha: null, data: [] };
  if (!metaRes.ok) {
    const tt = await metaRes.text().catch(() => "");
    throw new Error(`GET meta ${path} gagal (${metaRes.status}): ${tt.slice(0, 300)}`);
  }

  const meta = await metaRes.json();
  const size = meta.size ?? 0;
  let text;

  if (meta.content && size <= RAW_CUTOFF) {
    // kecil -> pakai base64
    text = b64decode(meta.content || "");
  } else if (meta.download_url) {
    // besar -> pakai download_url RAW
    const raw = await fetch(meta.download_url, { headers: { "User-Agent": "cf-pages-functions" } });
    if (!raw.ok) throw new Error(`RAW (download_url) ${path} gagal (${raw.status})`);
    text = await raw.text();
  } else {
    // fallback RAW via API
    const raw = await fetch(withRef(url), { headers: ghHeaders(token, { Accept: "application/vnd.github.raw" }) });
    if (!raw.ok) throw new Error(`RAW API ${path} gagal (${raw.status})`);
    text = await raw.text();
  }

  let obj;
  try { obj = JSON.parse(text); } catch { obj = []; }
  if (!Array.isArray(obj)) obj = []; // file ini didesain array

  return { exists: true, sha: meta.sha, data: obj };
}

// ---- GitHub write (minify + 1x retry on conflict) ----
async function ghWriteJsonMin(token, path, arr, sha = null, message = "update") {
  const url = `${API_BASE}/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: b64encode(JSON.stringify(arr)), // MINIFY (tanpa pretty-print)
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };

  let res = await fetch(url, {
    method: "PUT",
    headers: ghHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  // 1x retry bila conflict
  if (res.status === 409 || res.status === 422) {
    const ref = await fetch(withRef(url), { headers: ghHeaders(token) });
    if (ref.ok) {
      const meta = await ref.json();
      res = await fetch(url, {
        method: "PUT",
        headers: ghHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ ...body, sha: meta.sha }),
      });
    }
  }

  if (!res.ok) {
    const tt = await res.text().catch(() => "");
    throw new Error(`PUT ${path} gagal (${res.status}): ${tt.slice(0, 300)}`);
  }
  const js = await res.json().catch(() => ({}));
  return { ok: true, commit: js?.commit?.sha || null };
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) {
    return json({ error: "GITHUB_TOKEN belum diset di Pages → Settings → Environment variables (Production & Preview)." }, 500);
  }

  const url = new URL(request.url);
  // Jaga-jaga kalau dipasang dengan nama file berbeda; path ini sesuai deskripsi user
  if (url.pathname !== "/api/aksesAutoUpdateAllJuz") {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  // GET → kembalikan isi array apa adanya
  if (request.method === "GET") {
    try {
      const { data } = await ghReadJsonSmart(token, FILE_PATH);
      return json(data, 200);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  // POST → upsert by 'kelas'
  if (request.method === "POST") {
    let payload = {};
    try { payload = await request.json(); }
    catch { return json({ error: "Body bukan JSON valid." }, 400); }

    // Body: { kelas: string, fromDate?: string, toDate?: string, data?: any[] }
    const kelas    = String(payload?.kelas || "").trim();
    const fromDate = payload?.fromDate ? String(payload.fromDate).trim() : undefined;
    const toDate   = payload?.toDate   ? String(payload.toDate).trim()   : undefined;
    const dataArr  = Array.isArray(payload?.data) ? payload.data : undefined;

    if (!kelas) return json({ error: "Parameter 'kelas' wajib ada." }, 400);
    if (fromDate !== undefined && fromDate !== "" && !isIsoDate(fromDate)) {
      return json({ error: "fromDate harus YYYY-MM-DD" }, 400);
    }
    if (toDate !== undefined && toDate !== "" && !isIsoDate(toDate)) {
      return json({ error: "toDate harus YYYY-MM-DD" }, 400);
    }

    try {
      // 1) load current array
      const { sha, data } = await ghReadJsonSmart(token, FILE_PATH);
      const arr = Array.isArray(data) ? data.slice() : [];

      // 2) cari index by kelas
      const nowIso = new Date().toISOString();
      const idx = arr.findIndex((x) => x && String(x.kelas || "") === kelas);

      // 3) bentuk record baru (hanya override field yang disuplai)
      const prev = idx >= 0 ? (arr[idx] || {}) : {};
      const record = {
        kelas,
        fromDate: fromDate !== undefined ? (fromDate || "") : (prev.fromDate || ""),
        toDate:   toDate   !== undefined ? (toDate   || "") : (prev.toDate   || ""),
        updatedAt: nowIso,
        // 'count' hanya dihitung ulang jika 'data' dikirim; kalau tidak, dipertahankan
        count: dataArr !== undefined ? dataArr.length : (typeof prev.count === "number" ? prev.count : 0),
      };

      if (idx >= 0) arr[idx] = { ...prev, ...record };
      else arr.push(record);

      // 4) simpan (minify + retry on conflict)
      const msg = `autoUpdateAllJuz: upsert kelas=${kelas} (${record.fromDate}..${record.toDate})`;
      const { commit } = await ghWriteJsonMin(token, FILE_PATH, arr, sha, msg);

      return json({ ok: true, saved: record, commit }, 200);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
