// /functions/api/pindahRosterKelas.js
// POST { kelasAsal, kelasTujuan, identifiers: ["id"|"nis"|"nama", ...] }
// - Merge by NIS dulu, lalu nama (lowercase) ke roster tujuan
// - Jika tidak ada: tambah baris baru dengan ID gap-first
// - Hapus baris yang dipindah dari roster asal
// - Kembalikan idMap {oldId,newId,nis,nama} untuk sinkronisasi absensi
// ENV: GITHUB_TOKEN  (opsional: GITHUB_REPO, GITHUB_BRANCH)

const DEFAULT_REPO   = "dickypagesdev/server";
const DEFAULT_BRANCH = "main";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64encode = (str) => {
  const bytes = enc.encode(str); let bin=""; for (let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin);
};
const b64decode = (b64 = "") => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return dec.decode(bytes);
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

const normKelas = (k) => {
  let v = String(k || "").trim().replace(/-/g, "_");
  if (!/^kelas_/.test(v)) v = `kelas_${v}`;
  return v;
};
const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-pindahRosterKelas/1.1",
});
const withRef = (url, branch) => `${url}?ref=${encodeURIComponent(branch)}`;

async function readJsonFile(repo, path, token, branch) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(withRef(url, branch), { headers: ghHeaders(token) });
  if (res.status === 404) return { ok: true, exists: false, sha: null, data: [] };
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => "") };
  const meta = await res.json();
  let arr = [];
  try { arr = JSON.parse(b64decode(meta.content || "")); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return { ok: true, exists: true, sha: meta.sha, data: arr };
}
async function writeJsonFile(repo, path, token, branch, arrayData, sha, message) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: b64encode(JSON.stringify(arrayData, null, 2)), branch };
  if (sha) body.sha = sha;
  // PUT + 1x refresh jika conflict
  let res = await fetch(url, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    const ref = await fetch(withRef(url, branch), { headers: ghHeaders(token) });
    if (ref.status === 200) {
      const meta = await ref.json();
      res = await fetch(url, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify({ ...body, sha: meta.sha }) });
    }
  }
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => "") };
  return { ok: true };
}

function collectUsedIdsNumeric(arr) {
  const set = new Set();
  for (const r of arr) {
    const n = parseInt(String(r?.id ?? ""), 10);
    if (Number.isInteger(n) && n > 0) set.add(String(n));
  }
  return set;
}
function allocNextIdGapFirst(usedSet) {
  let i = 1; while (usedSet.has(String(i))) i++; return String(i);
}
function sortByIdNumeric(arr) {
  return [...arr].sort((a,b)=> (parseInt(a?.id||0,10)||0) - (parseInt(b?.id||0,10)||0));
}

export const onRequestOptions = () => json({}, 204);

export async function onRequestPost({ request, env }) {
  const TOKEN  = env.GITHUB_TOKEN;
  const REPO   = env.GITHUB_REPO   || DEFAULT_REPO;
  const BRANCH = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  if (!TOKEN) return json({ error: "GITHUB_TOKEN tidak tersedia" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Body bukan JSON valid" }, 400); }

  let { kelasAsal, kelasTujuan, identifiers } = body || {};
  if (!kelasAsal || !kelasTujuan || !Array.isArray(identifiers) || !identifiers.length) {
    return json({ error: "Wajib: kelasAsal, kelasTujuan, identifiers[]" }, 400);
  }

  const asal   = normKelas(kelasAsal);
  const tujuan = normKelas(kelasTujuan);
  const src = await readJsonFile(REPO, `${asal}.json`, TOKEN, BRANCH);
  if (!src.ok || !src.exists) return json({ error: "File roster asal tidak ditemukan" }, 404);
  const dst = await readJsonFile(REPO, `${tujuan}.json`, TOKEN, BRANCH);
  if (!dst.ok) return json({ error: "Gagal baca roster tujuan", detail: dst.error, status: dst.status }, 502);

  const cleanIds = identifiers.map(v=>String(v??"").trim()).filter(Boolean);
  const pickId   = new Set(cleanIds);
  const pickNis  = new Set(cleanIds);
  const pickName = new Set(cleanIds.map(v=>v.toLowerCase()));
  const match = (r) => {
    const id  = String(r?.id ?? "");
    const nis = String(r?.nis ?? "");
    const nmL = String(r?.nama ?? "").toLowerCase();
    return pickId.has(id) || (nis && pickNis.has(nis)) || (nmL && pickName.has(nmL));
  };

  const toMove = src.data.filter(match);
  if (!toMove.length) return json({ error: "Santri tidak ditemukan di roster asal" }, 404);

  const dstArr   = Array.isArray(dst.data) ? [...dst.data] : [];
  const used     = collectUsedIdsNumeric(dstArr);
  const byNisDst = new Map();
  const byNameDst= new Map();
  dstArr.forEach((r,i)=>{
    const nis = String(r?.nis ?? "").trim();
    const nmL = String(r?.nama ?? "").trim().toLowerCase();
    if (nis) byNisDst.set(nis, i);
    if (nmL) byNameDst.set(nmL, i);
  });

  const idMap = [];
  const detail = [];

  for (const s of toMove) {
    const sNis = String(s?.nis ?? "").trim();
    const sNmL = String(s?.nama ?? "").trim().toLowerCase();

    let idx = -1;
    if (sNis && byNisDst.has(sNis)) idx = byNisDst.get(sNis);
    else if (sNmL && byNameDst.has(sNmL)) idx = byNameDst.get(sNmL);

    if (idx >= 0) {
      // merge ke tujuan tanpa ubah id tujuan
      const keep = dstArr[idx];
      const merged = {
        ...keep,
        nis: sNis || keep.nis,
        nama: s?.nama ?? keep.nama,
        jenjang: s?.jenjang ?? keep.jenjang,
        semester: s?.semester ?? keep.semester,
        keterangan: s?.keterangan ?? keep.keterangan,
      };
      dstArr[idx] = merged;
      detail.push({ type:"merged", id: keep.id, nis: merged.nis });
    } else {
      // tambah baris baru
      const newId = allocNextIdGapFirst(used); used.add(newId);
      const row = {
        id: newId,
        nis: sNis,
        nama: s?.nama ?? "",
        jenjang: s?.jenjang ?? "",
        semester: s?.semester ?? "",
        keterangan: s?.keterangan ?? "",
      };
      dstArr.push(row);
      detail.push({ type:"added", id:newId, nis: row.nis });
      const oldId = String(s?.id ?? "");
      if (oldId && oldId !== newId) idMap.push({ oldId, newId, nis: row.nis || "", nama: row.nama || "" });
    }
  }

  // tulis tujuan
  const sortedDst = sortByIdNumeric(dstArr);
  const wDst = await writeJsonFile(
    REPO, `${tujuan}.json`, TOKEN, BRANCH, sortedDst, dst.exists ? dst.sha : null,
    dst.exists ? `Pindah roster → merge/add ${detail.length} santri ke ${tujuan}`
               : `Buat ${tujuan} + seed ${detail.length} santri`
  );
  if (!wDst.ok) return json({ error: "Gagal menulis roster tujuan", detail: wDst.error, status: wDst.status }, 502);

  // hapus dari asal
  const remaining = src.data.filter(r => !match(r));
  const sortedRem = sortByIdNumeric(remaining);
  const wSrc = await writeJsonFile(
    REPO, `${asal}.json`, TOKEN, BRANCH, sortedRem, src.sha, `Remove ${toMove.length} santri pindah dari ${asal}`
  );
  if (!wSrc.ok) return json({ error: "Gagal menulis roster asal", detail: wSrc.error, status: wSrc.status }, 502);

  return json({ success:true, moved: toMove.length, idMap, detail }, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m === "OPTIONS") return json({}, 204);
  if (m === "POST")    return onRequestPost(ctx);
  return json({ error: "Method Not Allowed" }, 405);
}
