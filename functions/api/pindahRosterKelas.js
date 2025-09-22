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
const ROSTER_DIR = ""; // misal "roster"; kalau root: "".

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

async function readRoster(token, file) {
  const path = ROSTER_DIR ? `${ROSTER_DIR}/${file}` : file;
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders(token) });
  if (r.status === 404) return { data: [], sha: null };
  if (!r.ok) throw new Error(`readRoster(${file}) ${r.status}`);
  const j = await r.json();
  let data = []; try { data = JSON.parse(b64dec(j.content) || "[]"); } catch {}
  return { data: Array.isArray(data)?data:[], sha: j.sha || null };
}

async function writeRoster(token, file, data, oldSha) {
  const path = ROSTER_DIR ? `${ROSTER_DIR}/${file}` : file;
  const url = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: `move roster: ${file}`,
    content: b64(JSON.stringify(data, null, 2)),
    branch: BRANCH,
    sha: oldSha || undefined,
  };
  const r = await fetch(url, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    throw new Error(`writeRoster(${file}) ${r.status} ${t.slice(0,200)}`);
  }
}

const kelasFile = (k) => `${k}.json`; // contoh: kelas_012526.json

export const onRequestPost = async ({ request, env }) => {
  try {
    if (!env.GITHUB_TOKEN) return json({ error: "GITHUB_TOKEN belum diset." }, 500);
    const { kelasAsal, kelasTujuan, identifiers } = await request.json().catch(()=> ({}));
    if (!kelasAsal || !kelasTujuan || !Array.isArray(identifiers) || !identifiers.length) {
      return json({ error:"kelasAsal, kelasTujuan, identifiers[] wajib." }, 400);
    }
    const token = env.GITHUB_TOKEN;

    // 1) baca roster asal & tujuan
    const src = await readRoster(token, kelasFile(kelasAsal));
    const dst = await readRoster(token, kelasFile(kelasTujuan));

    const idSet   = new Set(identifiers.map(x=>String(x).trim()).filter(Boolean));
    const moved = [];
    const keep  = [];

    for (const s of src.data) {
      const id  = String(s?.id ?? "").trim();
      const nis = String(s?.nis ?? "").trim();
      const nameKey = String(s?.nama ?? "").trim().toLowerCase();

      if (idSet.has(id) || idSet.has(nis) || idSet.has(nameKey)) {
        moved.push(s);
      } else {
        keep.push(s);
      }
    }

    if (!moved.length) {
      return json({ success:true, moved:0, idMap:[] });
    }

    // 2) merge ke tujuan (hindari duplikat NIS/ID)
    const seenId  = new Set(dst.data.map(x => String(x?.id ?? "")).filter(Boolean));
    const seenNis = new Set(dst.data.map(x => String(x?.nis ?? "")).filter(Boolean));
    const merged = [...dst.data];

    for (const s of moved) {
      const id  = String(s?.id ?? "").trim();
      const nis = String(s?.nis ?? "").trim();
      if ((id && seenId.has(id)) || (nis && seenNis.has(nis))) {
        // kalau duplikat, skip tambah (biarkan data tujuan)
        continue;
      }
      merged.push(s);
      if (id)  seenId.add(id);
      if (nis) seenNis.add(nis);
    }

    // 3) tulis balik ke GitHub
    await writeRoster(token, kelasFile(kelasAsal), keep, src.sha);   // asal jadi sisa
    await writeRoster(token, kelasFile(kelasTujuan), merged, dst.sha);

    // idMap (di sini id tidak berubah; kalau suatu saat kamu transform id, isi di sini)
    const idMap = moved
      .map(s => ({ oldId: String(s?.id ?? "").trim(), newId: String(s?.id ?? "").trim() }))
      .filter(m => m.oldId);

    return json({ success:true, moved: moved.length, idMap });

  } catch (err) {
    return json({ error: "Internal Error", detail: String(err?.message || err) }, 500);
  }
};
