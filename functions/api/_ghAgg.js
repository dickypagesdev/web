// functions/api/_ghAgg.js
const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${OWNER_REPO}/contents`;

const enc = new TextEncoder();
const b64encode = (str = "") => {
  const by = enc.encode(str);
  let bin = "";
  for (let i = 0; i < by.length; i++) bin += String.fromCharCode(by[i]);
  return btoa(bin);
};

const ghHeaders = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
  ...extra,
});
const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;

/** GET JSON SELALU RAW (tanpa meta.content) */
export async function ghGetJsonAgg(token, path) {
  const url = `${API_BASE}/${encodeURIComponent(path)}`;
  const r = await fetch(withRef(url), {
    headers: ghHeaders(token, { Accept: "application/vnd.github.raw" }),
  });
  if (r.status === 404) return { exists: false, data: null };
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`RAW GET ${path} gagal (${r.status}): ${t || r.statusText}`);
  }
  const txt = await r.text();
  let obj = {};
  try {
    obj = JSON.parse(txt) || {};
  } catch {
    obj = {};
  }
  return { exists: true, data: obj };
}

/** PUT JSON (minified + base64) dengan 1x auto-retry bila conflict */
export async function ghPutJsonAgg(token, path, obj, sha = null, message = "update") {
  const url = `${API_BASE}/${encodeURIComponent(path)}`;
  const content = b64encode(JSON.stringify(obj)); // MINIFY (tanpa pretty-print)
  const body = { message, content, branch: BRANCH, ...(sha ? { sha } : {}) };

  let res = await fetch(url, {
    method: "PUT",
    headers: ghHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (res.status === 409 || res.status === 422) {
    // conflict → ambil sha terbaru, lalu retry sekali
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
    const t = await res.text().catch(() => "");
    throw new Error(`PUT ${path} gagal (${res.status}): ${t || res.statusText}`);
  }
  return true;
}
