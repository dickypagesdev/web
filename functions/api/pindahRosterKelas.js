// /functions/api/pindahRosterKelas.js
// POST body: { kelasAsal, kelasTujuan, identifiers: [nis|id|namaLowercase, ...] }
// Env: GITHUB_TOKEN (contents:write)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (o, s=200) => new Response(JSON.stringify(o), { status:s, headers:{"Content-Type":"application/json", ...CORS} });
export const onRequestOptions = () => new Response(null, { status:204, headers: CORS });

const OWNER_REPO = "dickypagesdev/server";
const BRANCH = "main";
// Jika roster kamu di folder lain, ubah di sini:
const ROSTER_DIR = ""; // contoh "roster"; kalau root: "".

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (s) => btoa(String.fromCharCode(...enc.encode(s)));
const b64dec = (b64s) => {
  const bin = atob(b64s || "");
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

// --- helper nama kelas & path aman ---
const normKelas = (k) => {
  const v = String(k || "").trim();
  if (!v) return "";
  return v.startsWith("kelas_") ? v : `kelas_${v}`;
};
const kelasFile = (k) => `${normKelas(k)}.json`;
const withDir = (file) => (ROSTER_DIR ? `${ROSTER_DIR}/${file}` : file);

// --- GitHub helpers ---
async function readJsonFile(token, file) {
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(withDir(file))}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders(token) });
  if (r.status === 404) return { data: [], sha: null, ok: true, status: 404 };
  if (!r.ok) throw new Error(`GET ${file} -> ${r.status}`);
  const j = await r.json();
  let data = [];
  try { data = JSON.parse(b64dec(j.content) || "[]"); } catch {}
  return { data: Array.isArray(data) ? data : [], sha: j.sha || null, ok: true, status: 200 };
}

async function writeJsonFile(token, file, data, sha, msg) {
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(withDir(file))}`;
  const body = {
    message: msg,
    content: b64(JSON.stringify(data, null, 2)),
    branch: BRANCH,
    sha: sha || undefined,
  };
  const r = await fetch(url, { method:"PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`PUT ${file} -> ${r.status}: ${t.slice(0,200)}`);
  }
}

// --- main ---
export const onRequestPost = async ({ request, env }) => {
  try {
    if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN belum diset." }, 500);
    const token = env.GITHUB_TOKEN;

    const body = await request.json().catch(()=> ({}));
    let { kelasAsal, kelasTujuan, identifiers } = body || {};
    kelasAsal   = normKelas(kelasAsal);
    kelasTujuan = normKelas(kelasTujuan);
    identifiers = Array.isArray(identifiers) ? identifiers : [];

    if (!kelasAsal || !kelasTujuan || !identifiers.length) {
      return json({ error:"kelasAsal, kelasTujuan, identifiers[] wajib." }, 400);
    }
    if (kelasAsal === kelasTujuan) {
      return json({ error:"kelasAsal tidak boleh sama dengan kelasTujuan." }, 400);
    }

    const srcFile = kelasFile(kelasAsal);
    const dstFile = kelasFile(kelasTujuan);

    // 1) Baca roster asal & tujuan
    const src = await readJsonFile(token, srcFile);
    const dst = await readJsonFile(token, dstFile); // jika 404, kita akan create baru

    // safety: kalau roster asal kosong/404 -> hentikan
    if (!src.data.length) {
      return json({ error:"Roster asal kosong atau tidak ditemukan.", file: srcFile }, 404);
    }

    // 2) Seleksi entri yang dipindah
    const idSet = new Set(
      identifiers.map(x => String(x).trim()).filter(Boolean)
    );
    const moved = [];
    const keep  = [];
    for (const s of src.data) {
      const id  = String(s?.id ?? "").trim();
      const nis = String(s?.nis ?? "").trim();
      const nameKey = String(s?.nama ?? "").trim().toLowerCase();
      if (idSet.has(id) || idSet.has(nis) || idSet.has(nameKey)) moved.push(s);
      else keep.push(s);
    }
    if (!moved.length) {
      return json({ success:true, moved:0, idMap:[], note:"Tidak ada entri yang cocok." });
    }

    // 3) Merge ke tujuan (hindari duplikat id/nis)
    const destData = Array.isArray(dst.data) ? [...dst.data] : [];
    const seenId   = new Set(destData.map(x => String(x?.id ?? "")).filter(Boolean));
    const seenNis  = new Set(destData.map(x => String(x?.nis ?? "")).filter(Boolean));

    let appended = 0;
    for (const s of moved) {
      const id  = String(s?.id ?? "").trim();
      const nis = String(s?.nis ?? "").trim();
      const dup = (id && seenId.has(id)) || (nis && seenNis.has(nis));
      if (dup) continue;
      destData.push(s);
      if (id)  seenId.add(id);
      if (nis) seenNis.add(nis);
      appended++;
    }

    // 4) TULIS TUJUAN DULU (agar kalau gagal, sumber belum kosong)
    await writeJsonFile(
      token,
      dstFile,
      destData,
      dst.sha, // boleh null untuk create
      `Move roster -> append ${appended} from ${srcFile} to ${dstFile}`
    );

    // 5) Baru TULIS SUMBER (jadi sisa = keep)
    await writeJsonFile(
      token,
      srcFile,
      keep,
      src.sha,
      `Move roster -> remove ${moved.length} from ${srcFile} (moved to ${dstFile})`
    );

    // 6) idMap (di sini id tidak berubah, tapi disiapkan bila nanti ingin transform id)
    const idMap = moved
      .map(s => ({ oldId: String(s?.id ?? "").trim(), newId: String(s?.id ?? "").trim() }))
      .filter(m => m.oldId);

    return json({
      success:true,
      moved: moved.length,
      appendedToDest: appended,
      idMap,
      srcFile,
      dstFile
    });

  } catch (err) {
    return json({ error: "Internal Error", detail: String(err?.message || err) }, 500);
  }
};
