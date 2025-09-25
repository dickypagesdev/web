// functions/api/aksesAutoUpdateAllJuzMur.js
// Cloudflare Pages Functions (ESM)
//
// GET  /api/aksesAutoUpdateAllJuzMur  -> kembalikan isi array JSON apa adanya
// POST /api/aksesAutoUpdateAllJuzMur  -> upsert by 'kelas' (parsial; hanya field yang dikirim diubah)
// ENV: GITHUB_TOKEN (read/write) — fallback ke MTQ_TOKEN bila ada

const DEFAULT_REPO   = "dickypagesdev/server";
const DEFAULT_BRANCH = "main";
const FILE_PATH      = "autoUpdateAllJuzMur.json";
const RAW_CUTOFF     = 900_000; // >~0.9MB: baca via RAW (lebih cepat & aman)

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

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

const ghHeaders = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-aksesAutoUpdateAllJuzMur/1.2",
  ...extra,
});

const withRef = (url, branch) => `${url}?ref=${encodeURIComponent(branch)}`;
const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// ---- READ dengan RAW fallback ----
async function readJsonSmart({ repo, path, branch, token }) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const metaRes = await fetch(withRef(url, branch), { headers: ghHeaders(token) });

  if (metaRes.status === 404) {
    return { exists: false, sha: null, data: [] };
  }
  if (!metaRes.ok) {
    const t = await metaRes.text().catch(() => "");
    throw new Error(`GET meta ${path} gagal (${metaRes.status}): ${t.slice(0, 300)}`);
  }

  const meta = await metaRes.json();
  const size = meta.size ?? 0;
  let text;

  if (meta.content && size <= RAW_CUTOFF) {
    // kecil → base64
    text = b64decode(meta.content || "");
  } else if (meta.download_url) {
    // besar → RAW via download_url
    const raw = await fetch(meta.download_url, { headers: { "User-Agent": "cf-pages-aksesAutoUpdateAllJuzMur/1.2" } });
    if (!raw.ok) throw new Error(`RAW download_url ${path} gagal (${raw.status})`);
    text = await raw.text();
  } else {
    // fallback RAW via API
    const raw = await fetch(withRef(url, branch), { headers: ghHeaders(token, { Accept: "application/vnd.github.raw" }) });
    if (!raw.ok) throw new Error(`RAW API ${path} gagal (${raw.status})`);
    text = await raw.text();
  }

  let arr;
  try { arr = JSON.parse(text); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = []; // file ini didesain array

  return { exists: true, sha: meta.sha, data: arr };
}

// ---- PUT minified + retry conflict (exponential backoff + jitter) ----
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function writeJsonMinRetry({
  repo, path, branch, token, arr, sha, message,
  maxRetries = 5
}) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const baseBody = {
    message: message || "update",
    content: b64encode(JSON.stringify(arr)), // MINIFY — tanpa pretty-print
    branch,
  };

  let attempt = 0;
  let curSha = sha || null;

  while (attempt < maxRetries) {
    const body = curSha ? { ...baseBody, sha: curSha } : baseBody;

    let res = await fetch(url, {
      method: "PUT",
      headers: ghHeaders(token),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const js = await res.json().catch(() => ({}));
      return { ok: true, commit: js?.commit?.sha || null };
    }

    // SHA conflict → refresh & backoff lalu ulang
    if (res.status === 409 || res.status === 422) {
      const ref = await fetch(withRef(url, branch), { headers: ghHeaders(token) });
      if (ref.status === 200) {
        const meta = await ref.json();
        curSha = meta.sha || null;
        const delay = Math.min(80 * (2 ** attempt), 1200) + Math.floor(Math.random() * 40);
        await sleep(delay);
        attempt++;
        continue;
      }
    }

    const t = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: t || res.statusText };
  }

  // Tetap konflik setelah retry
  return { ok: false, status: 409, error: "conflict-after-retries" };
}

export const onRequestOptions = () => json({}, 204);

export async function onRequestGet({ env }) {
  const TOKEN  = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  const REPO   = env.GITHUB_REPO   || DEFAULT_REPO;
  const BRANCH = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  if (!TOKEN) return json({ error: "GITHUB_TOKEN belum diset di environment." }, 500);

  try {
    const { data } = await readJsonSmart({ repo: REPO, path: FILE_PATH, branch: BRANCH, token: TOKEN });
    // return as-is stringified array (efisien)
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const TOKEN  = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  const REPO   = env.GITHUB_REPO   || DEFAULT_REPO;
  const BRANCH = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  if (!TOKEN) return json({ error: "GITHUB_TOKEN belum diset di environment." }, 500);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: "Body bukan JSON valid." }, 400); }

  // Body: { kelas: string, fromDate?: string, toDate?: string, data?: any[] }
  const kelas    = String(payload?.kelas || "").trim();
  const fromDate = payload?.fromDate !== undefined ? String(payload.fromDate || "").trim() : undefined;
  const toDate   = payload?.toDate   !== undefined ? String(payload.toDate   || "").trim()   : undefined;
  const dataArr  = Array.isArray(payload?.data) ? payload.data : undefined;

  if (!kelas) return json({ error: "Parameter 'kelas' wajib ada." }, 400);
  if (fromDate !== undefined && fromDate !== "" && !isIsoDate(fromDate))
    return json({ error: "fromDate harus YYYY-MM-DD" }, 400);
  if (toDate !== undefined && toDate !== "" && !isIsoDate(toDate))
    return json({ error: "toDate harus YYYY-MM-DD" }, 400);

  // baca file saat ini
  const { sha, data } = await readJsonSmart({ repo: REPO, path: FILE_PATH, branch: BRANCH, token: TOKEN });
  const arr = Array.isArray(data) ? data.slice() : [];

  const nowIso = new Date().toISOString();
  const idx = arr.findIndex((x) => x && String(x.kelas || "") === kelas);
  const prev = idx >= 0 ? (arr[idx] || {}) : {};

  // Bentuk record baru (UPD hanya pada field yang dikirim; lainnya dipertahankan)
  const record = {
    kelas,
    fromDate: fromDate !== undefined ? fromDate : (prev.fromDate || ""),
    toDate:   toDate   !== undefined ? toDate   : (prev.toDate   || ""),
    updatedAt: nowIso,
    count: dataArr !== undefined
      ? dataArr.length
      : (typeof prev.count === "number" ? prev.count : 0),
  };

  // Short-circuit: jika tidak ada perubahan nilai (kecuali updatedAt), skip PUT
  const unchanged =
    idx >= 0 &&
    String(prev.fromDate || "") === String(record.fromDate) &&
    String(prev.toDate   || "") === String(record.toDate) &&
    Number(prev.count || 0) === Number(record.count || 0);

  if (unchanged) {
    // Jangan menulis, balas OK supaya tidak menimbulkan conflict di log
    return json({ ok: true, saved: { ...prev, updatedAt: prev.updatedAt || nowIso }, skipped: true }, 200);
  }

  if (idx >= 0) arr[idx] = { ...prev, ...record };
  else arr.push(record);

  // Tulis (minify + retry on conflict)
  const msg = `autoUpdateAllJuzMur: upsert kelas=${kelas} (${record.fromDate}..${record.toDate})`;
  const put = await writeJsonMinRetry({
    repo: REPO, path: FILE_PATH, branch: BRANCH, token: TOKEN,
    arr, sha, message: msg
  });

  if (!put.ok) {
    if (put.status === 409 && put.error === "conflict-after-retries") {
      // balapan; request lain kemungkinan sudah menulis — anggap sukses
      return json({ ok: true, status: "conflict_ignored" }, 200);
    }
    return json({ error: `PUT GitHub failed ${put.status}: ${put.error}` }, put.status || 502);
  }

  return json({ ok: true, saved: record, commit: put.commit || null }, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "OPTIONS") return json({}, 204);
  if (m === "GET")     return onRequestGet(ctx);
  if (m === "POST")    return onRequestPost(ctx);
  return json({ error: "Method Not Allowed" }, 405);
}
