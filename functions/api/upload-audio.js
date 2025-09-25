// /functions/api/upload-audio.js
// POST /api/upload-audio
// Body: { filename: "kelas_01-2025-09-25-12.mp3", contentBase64: "data:audio/...;base64,AAAA..." }
const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${OWNER_REPO}/contents`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const H = (t, extra = {}) => ({
  Authorization: `Bearer ${t}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-upload-audio",
  ...extra,
});
const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;
const J = (s, d) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

function sanitizeName(s) {
  let v = String(s || "").replace(/^\/*/, "").replace(/\.\./g, "");
  v = v.replace(/[^A-Za-z0-9._\-]/g, "_"); // harden
  return v;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return J(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let body = {};
  try { body = await request.json(); } catch { return J(400, { error: "Body bukan JSON valid" }); }

  let { filename, contentBase64 } = body || {};
  if (!filename || !contentBase64) return J(400, { error: "Wajib: filename & contentBase64" });

  const clean = contentBase64.replace(/^data:[^;]+;base64,/, "").trim();
  if (!clean) return J(400, { error: "contentBase64 tidak valid" });

  // (opsional) batasi ukuran ~25MB base64 (≈ 18.75MB binary)
  if (clean.length > 35_000_000) return J(413, { error: "File terlalu besar" });

  const name = sanitizeName(filename);
  const path = `audio/${name}`;
  const url = `${API_BASE}/${encodeURIComponent(path)}`;

  try {
    // coba PUT langsung (create or update)
    let res = await fetch(url, {
      method: "PUT",
      headers: H(token),
      body: JSON.stringify({ message: `upload audio ${name}`, content: clean, branch: BRANCH }),
    });

    // konflik → ambil sha terbaru lalu retry 1x
    if (res.status === 409 || res.status === 422) {
      const m = await fetch(withRef(url), { headers: H(token) });
      if (m.ok) {
        const meta = await m.json();
        res = await fetch(url, {
          method: "PUT",
          headers: H(token),
          body: JSON.stringify({ message: `upload audio ${name}`, content: clean, branch: BRANCH, sha: meta.sha }),
        });
      }
    }

    if (!res.ok) return J(502, { error: `PUT failed ${res.status}`, detail: await res.text().catch(() => "") });
    return J(200, { ok: true, filename: name });
  } catch (e) {
    return J(500, { error: String(e?.message || e) });
  }
}
