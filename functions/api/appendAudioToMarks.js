// /functions/api/appendAudioToMarks.js
// Endpoint: POST /api/appendAudioToMarks
// Body JSON: { id, kelas, tanggal(YYYY-MM-DD), filename }
// ENV: GITHUB_TOKEN (contents:read/write)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
const DIR = "absensi";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
});

// Base64 safe (UTF-8)
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64encode = (str) => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

function normKelas(k) {
  if (!k) return "";
  const s = String(k).trim();
  return s.startsWith("kelas_") ? s : `kelas_${s}`;
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ success: false, error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Body bukan JSON valid." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  let { id, kelas, tanggal, filename } = body || {};
  if (!id || !kelas || !tanggal || !filename) {
    return new Response(JSON.stringify({
      success: false,
      error: "Param id, kelas, tanggal, filename wajib ada",
    }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
  }

  id = String(id);
  kelas = normKelas(kelas);

  const aggFile = `${kelas}.json`; // target agregat per-kelas
  const contentsUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(DIR)}/${encodeURIComponent(aggFile)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    // 1) GET file agregat absensi/<kelas>.json
    const getRes = await fetch(contentsUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });

    let sha = null;
    let contentStr = "";

    if (getRes.status === 404) {
      // File belum ada → siapkan struktur awal
      contentStr = JSON.stringify({ meta: { kelas, versi: 1 }, records: [] }, null, 2);
    } else {
      if (!getRes.ok) {
        const text = await getRes.text().catch(() => "");
        return new Response(JSON.stringify({
          success: false,
          error: `Gagal ambil file agregat (${getRes.status})`,
          detail: text.slice(0, 300),
        }), { status: getRes.status, headers: { "Content-Type": "application/json", ...CORS } });
      }
      const getJson = await getRes.json();
      sha = getJson.sha;
      try { contentStr = b64decode(getJson.content || ""); }
      catch (e) {
        return new Response(JSON.stringify({ success: false, error: "Gagal decode base64." }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
      }
    }

    // 2) Parse JSON agregat
    let agg;
    try {
      agg = JSON.parse(contentStr || "{}");
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: `JSON agregat invalid: ${e.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
    }
    if (!agg || typeof agg !== "object") agg = {};
    if (!agg.meta)    agg.meta = { kelas, versi: 1 };
    if (!Array.isArray(agg.records)) agg.records = [];

    // 3) Cari/siapkan record tanggal
    let rec = agg.records.find(r => r && r.tanggal === tanggal);
    if (!rec) {
      rec = { tanggal, items: [] };
      agg.records.push(rec);
      // Sort by tanggal ascending biar rapi
      agg.records.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    }
    if (!Array.isArray(rec.items)) rec.items = [];

    // 4) Cari/siapkan santri by id
    let sidx = rec.items.findIndex(s => s && String(s.id) === id);
    if (sidx === -1) {
      // Jika belum ada, buat entri minimal
      rec.items.push({ id, marks: { audio: [] } });
      sidx = rec.items.length - 1;
    }
    const santri = rec.items[sidx];
    if (typeof santri.marks !== "object" || santri.marks === null) santri.marks = {};
    if (!Array.isArray(santri.marks.audio)) santri.marks.audio = [];

    // 5) Tambah filename unik
    if (!santri.marks.audio.includes(filename)) {
      santri.marks.audio.push(filename);
    }

    // 6) Commit update (PUT)
    const newContent = b64encode(JSON.stringify(agg, null, 2));
    const putUrl =
      `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(DIR)}/${encodeURIComponent(aggFile)}`;
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: ghHeaders(env.GITHUB_TOKEN),
      body: JSON.stringify({
        message: `Append audio for id=${id}: ${filename} (kelas=${kelas}, tanggal=${tanggal})`,
        content: newContent,
        ...(sha ? { sha } : {}),
        branch: BRANCH,
      }),
    });

    const putText = await putRes.text();
    let putJson = {};
    try { putJson = JSON.parse(putText); } catch {}

    if (!putRes.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: putJson?.message || `Gagal update file agregat`,
        detail: putText.slice(0, 300),
      }), { status: putRes.status, headers: { "Content-Type": "application/json", ...CORS } });
    }

    return new Response(JSON.stringify({
      success: true,
      file: aggFile,
      id, kelas, tanggal, filename,
      audioCount: santri.marks.audio.length,
      commit: putJson?.commit?.sha || null,
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
