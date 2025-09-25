// functions/api/_ghAgg.js
const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${OWNER_REPO}/contents`;
const RAW_CUTOFF = 900_000; // ~0.9MB: di atas ini pakai RAW (lebih cepat & aman)

const dec = new TextDecoder(), enc = new TextEncoder();
const b64decode = (b64="") => { const bin=atob(b64); const by=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) by[i]=bin.charCodeAt(i); return dec.decode(by); };
const b64encode = (str="") => { const by=enc.encode(str); let bin=""; for (let i=0;i<by.length;i++) bin+=String.fromCharCode(by[i]); return btoa(bin); };

const ghHeaders = (token, extra={}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
  ...extra,
});
const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;

export async function ghGetJsonAgg(token, path) {
  const url = `${API_BASE}/${encodeURIComponent(path)}`;
  const metaRes = await fetch(withRef(url), { headers: ghHeaders(token) });
  if (metaRes.status === 404) return { exists:false, sha:null, size:0, data:null };
  if (!metaRes.ok) throw new Error(`GET meta ${path} gagal (${metaRes.status})`);

  const meta = await metaRes.json();
  const size = meta.size ?? 0;

  // Kecil → boleh pakai base64; Besar → RAW
  let text;
  if (meta.content && size <= RAW_CUTOFF) {
    text = b64decode(meta.content || "");
  } else if (meta.download_url) {
    const raw = await fetch(meta.download_url, { headers: { "User-Agent": "cf-pages-functions" } });
    if (!raw.ok) throw new Error(`RAW download_url ${path} gagal (${raw.status})`);
    text = await raw.text();
  } else {
    // RAW via API dengan Accept: raw (fallback)
    const raw = await fetch(withRef(url), { headers: ghHeaders(token, { Accept: "application/vnd.github.raw" }) });
    if (!raw.ok) throw new Error(`RAW API ${path} gagal (${raw.status})`);
    text = await raw.text();
  }

  let obj = {};
  try { obj = JSON.parse(text) || {}; } catch { obj = {}; }
  return { exists:true, sha: meta.sha, size, data: obj };
}

export async function ghPutJsonAgg(token, path, obj, sha=null, message="update") {
  // Minify (tanpa pretty-print) agar file lebih kecil
  const content = b64encode(JSON.stringify(obj));
  const url = `${API_BASE}/${encodeURIComponent(path)}`;
  const body = { message, content, branch: BRANCH, ...(sha ? { sha } : {}) };

  let res = await fetch(url, { method:"PUT", headers: ghHeaders(token, { "Content-Type":"application/json" }), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    // conflict → refresh sha lalu retry sekali
    const ref = await fetch(withRef(url), { headers: ghHeaders(token) });
    if (ref.ok) {
      const meta = await ref.json();
      res = await fetch(url, { method:"PUT", headers: ghHeaders(token, { "Content-Type":"application/json" }),
        body: JSON.stringify({ ...body, sha: meta.sha }) });
    }
  }
  if (!res.ok) throw new Error(`PUT ${path} gagal (${res.status}): ${await res.text().catch(()=> "")}`);
  return true;
}
