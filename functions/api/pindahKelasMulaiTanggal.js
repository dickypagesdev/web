// functions/api/pindahKelasMulaiTanggal.js
import { json as J } from "./_utils"; // pakai response helper sederhana jika mau
// NOTE: di file kamu aslinya banyak util GitHub. Kita pakai PERSIS milikmu,
// lalu tambahkan blok "mirror D1" di bagian paling bawah loop tanggal.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "dickypagesdev/server";
const BRANCH     = "main";
const API_BASE   = `https://api.github.com/repos/${OWNER_REPO}/contents`;

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
});
const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;
const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);

const dec = new TextDecoder();
const enc = new TextEncoder();
const b64decode = (b64 = "") => { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return dec.decode(bytes); };
const b64encode = (str = "") => { const bytes = enc.encode(str); let bin = ""; for (let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); };

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS }});

async function readDir(dir, token) {
  const res = await fetch(withRef(`${API_BASE}/${dir}`), { headers: ghHeaders(token) });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(()=> "") };
  return { ok: true, data: await res.json() };
}
async function readJsonFile(path, token) {
  const res = await fetch(withRef(`${API_BASE}/${path}`), { headers: ghHeaders(token) });
  if (res.status === 404) return { ok: true, exists: false, sha: null, data: [] };
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(()=> "") };
  const js = await res.json();
  let arr = []; try { arr = JSON.parse(b64decode(js.content || "")); } catch {}
  if (!Array.isArray(arr)) arr = [];
  return { ok: true, exists: true, sha: js.sha, data: arr };
}
async function writeJsonFile(path, arrayData, token, sha = null, message = "update") {
  const body = { message, content: b64encode(JSON.stringify(arrayData, null, 2)), committer: { name: "admin", email: "admin@local" }, branch: BRANCH, ...(sha ? { sha } : {}) };
  const res = await fetch(`${API_BASE}/${path}`, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(()=> "") };
  return { ok: true };
}

const mapIdIfNeeded = (row, idMap) => {
  if (!Array.isArray(idMap) || idMap.length === 0) return row;
  const oldId = (row.id ?? "").toString();
  const found = idMap.find((m) => String(m.oldId) === oldId);
  if (found && found.newId) return { ...row, id: String(found.newId) };
  return row;
};
const matchRow = (row, keySet, nameSetLower) => {
  const rid  = (row.id   ?? "").toString();
  const rnis = (row.nis  ?? "").toString();
  const rnmL = String(row.nama ?? "").toLowerCase();
  return (rid && keySet.has(rid)) || (rnis && keySet.has(rnis)) || (rnmL && nameSetLower.has(rnmL));
};
const sortByIdNumeric = (arr) => [...arr].sort((a,b)=> (parseInt(a?.id||0,10)||0) - (parseInt(b?.id||0,10)||0));

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN tidak tersedia" });

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: "Body bukan JSON valid" }); }

  let { kelasAsal, kelasTujuan, ids, nises, santriIds, startDate, idMap } = body || {};
  if (!kelasAsal || !kelasTujuan) return json(400, { error: "Wajib: kelasAsal & kelasTujuan" });
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json(400, { error: "startDate harus YYYY-MM-DD" });

  const asal   = normKelas(kelasAsal);
  const tujuan = normKelas(kelasTujuan);

  const idsArr   = Array.isArray(ids) ? ids : [];
  const nisesArr = Array.isArray(nises) ? nises : [];
  const legacy   = Array.isArray(santriIds) ? santriIds : [];
  const rawKeys  = [...idsArr, ...nisesArr, ...legacy].map((x)=> String(x||"").trim()).filter(Boolean);
  if (rawKeys.length === 0) return json(400, { error: "Wajib: minimal satu id/nis (ids/nises/santriIds)" });

  const keySet = new Set(rawKeys);
  const nameSetLower = new Set(rawKeys.map((v)=> v.toLowerCase()));

  // === GitHub: list file asal >= startDate
  const dir = await readDir("absensi", token);
  if (!dir.ok) return json(500, { error: "Gagal baca folder absensi", detail: dir.error });

  const asalFiles = (Array.isArray(dir.data) ? dir.data : [])
    .filter((f)=> f?.type === "file" && new RegExp(`^${asal}_\\d{4}-\\d{2}-\\d{2}\\.json$`).test(f.name))
    .map((f)=> ({ name: f.name, path: `absensi/${f.name}`, date: f.name.replace(`${asal}_`, "").replace(".json", "") }))
    .filter((item)=> item.date >= startDate)
    .sort((a,b)=> a.date.localeCompare(b.date));

  if (!asalFiles.length) return json(404, { error: "Tidak ada file absensi yang cocok" });

  const report = [];
  let totalMoved = 0;

  // === D1 helper
  const db = env.ABSENSI_DB;
  const upsertD1 = db.prepare(`
    INSERT INTO attendance_snapshots
      (class_name, tanggal, student_key, nama, jenjang, semester, payload_json, total_juz_num, total_mur_num, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'))
    ON CONFLICT(class_name, tanggal, student_key) DO UPDATE SET
      nama=excluded.nama, jenjang=excluded.jenjang, semester=excluded.semester,
      payload_json=excluded.payload_json, total_juz_num=excluded.total_juz_num,
      total_mur_num=excluded.total_mur_num, updated_at=excluded.updated_at
  `);
  const delSrcD1 = db.prepare(`
    DELETE FROM attendance_snapshots
    WHERE class_name=?1 AND tanggal=?2 AND student_key=?3
  `);

  // fungsi bantu remap student_key berdasarkan idMap
  const remapKey = (row) => {
    const nis = String(row?.nis || "").trim();
    if (nis) return nis; // prioritas nis
    const id  = String(row?.id  || "").trim();
    if (!idMap || !Array.isArray(idMap) || !id) return id;
    const f = idMap.find(m=> String(m.oldId) === id);
    return f?.newId ? String(f.newId) : id;
  };

  for (const f of asalFiles) {
    const tanggal = f.date;
    const srcPath = f.path;
    const dstPath = `absensi/${tujuan}_${tanggal}.json`;

    // === GitHub: baca & tulis
    const src = await readJsonFile(srcPath, token);
    if (!src.ok) { report.push({ tanggal, moved: 0, note: "gagal baca asal" }); continue; }
    if (!src.exists || !Array.isArray(src.data) || !src.data.length) {
      report.push({ tanggal, moved: 0, note: "asal kosong/tidak ada" }); continue;
    }

    const toMoveRaw = src.data.filter((r)=> matchRow(r, keySet, nameSetLower));
    if (!toMoveRaw.length) { report.push({ tanggal, moved: 0, note: "tidak ada match" }); continue; }

    const toMove    = toMoveRaw.map((r)=> mapIdIfNeeded(r, idMap));
    const remaining = src.data.filter((r)=> !matchRow(r, keySet, nameSetLower));

    const dst = await readJsonFile(dstPath, token);
    if (!dst.ok) { report.push({ tanggal, moved: 0, note: "gagal baca tujuan" }); continue; }
    const dstArr = Array.isArray(dst.data) ? dst.data : [];

    // merge + dedup by id/nis
    const merged = [...dstArr, ...toMove];
    const seenId = new Set(), seenNis = new Set();
    const deduped = [];
    for (const r of merged) {
      const rid  = (r?.id  ?? "").toString();
      const rnis = (r?.nis ?? "").toString();
      const k1 = rid  ? `id:${rid}`   : null;
      const k2 = rnis ? `nis:${rnis}` : null;
      if (k1 && seenId.has(k1)) continue;
      if (k2 && seenNis.has(k2)) continue;
      if (k1) seenId.add(k1);
      if (k2) seenNis.add(k2);
      deduped.push(r);
    }
    const sortedCombined = sortByIdNumeric(deduped);

    const okDst = await writeJsonFile(
      dstPath, sortedCombined, token, dst.exists ? dst.sha : null,
      dst.exists ? `Append ${toMove.length} santri -> ${tujuan} (${tanggal}, sorted)`
                 : `Create ${tujuan} (${tanggal}) & seed ${toMove.length} santri (sorted)`
    );
    if (!okDst.ok) { report.push({ tanggal, moved: 0, note: `gagal tulis tujuan (${okDst.status})` }); continue; }

    const sortedRemaining = sortByIdNumeric(remaining);
    const okSrc = await writeJsonFile(
      srcPath, sortedRemaining, token, src.sha || null,
      `Remove ${toMoveRaw.length} santri pindah dari ${asal} (${tanggal}, sorted)`
    );
    if (!okSrc.ok) { report.push({ tanggal, moved: 0, note: `gagal tulis asal (${okSrc.status})` }); continue; }

    // === D1 MIRROR: pindahkan baris attendance_snapshots
    // 1) Ambil kandidat sumber (berdasar nis/id)
    //    Kita tidak punya index by nama, jadi yang match via nama di GitHub
    //    bisa tidak ketemu di D1 kalau student_key tidak nis/id. Itu wajar.
    const keysNis = new Set(toMoveRaw.map(r => String(r?.nis||"").trim()).filter(Boolean));
    const keysId  = new Set(toMoveRaw.map(r => String(r?.id ||"").trim()).filter(Boolean));

    // Ambil semua baris harian untuk tanggal ini
    const rows = await db.prepare(`
      SELECT class_name, tanggal, student_key, payload_json, nama, jenjang, semester, total_juz_num, total_mur_num
      FROM attendance_snapshots
      WHERE class_name=?1 AND tanggal=?2
    `).bind(asal, tanggal).all();

    for (const row of (rows.results || [])) {
      const sk = String(row.student_key || "").trim();
      if (!sk) continue;
      // match bila student_key = nis/id yang dipindah
      if (!(keysNis.has(sk) || keysId.has(sk))) continue;

      // remap key jika perlu (pakai data GitHub yang dipindah)
      const srcObj = toMoveRaw.find(r => String(r.nis||"")===sk || String(r.id||"")===sk) || {};
      const newKey = remapKey(srcObj) || sk;

      // UPSERT ke tujuan
      await upsertD1.bind(
        tujuan, tanggal, newKey,
        row.nama || "", row.jenjang || "", row.semester || "",
        row.payload_json, row.total_juz_num || 0, row.total_mur_num || 0
      ).run();

      // Hapus sumber
      await delSrcD1.bind(asal, tanggal, sk).run();
    }

    totalMoved += toMove.length;
    report.push({ tanggal, moved: toMove.length });
  }

  // hapus cache totals yang mungkin stale
  await env.ABSENSI_DB.prepare(`DELETE FROM totals_store WHERE kelas IN (?1, ?2)`).bind(asal, tujuan).run();

  return json(200, { success: true, totalMoved, details: report });
}
