// /functions/api/pindahRosterKelas.js  (D1)
// POST /api/pindahRosterKelas
// ENV: ABSENSI_DB

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (s, d) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const normKelas = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const placeholders = (n) => Array.from({ length: n }, () => "?").join(",");
const buildStudentKey = (nis, id, name) => {
  const nNis = String(nis || "").trim();
  const nId  = String(id  || "").trim();
  const nNm  = String(name|| "").trim().toLowerCase();
  return nNis || nId || nNm || "";
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const db = env.ABSENSI_DB || env.DB;
  if (!db) return json(500, { error: "ABSENSI_DB binding tidak tersedia" });

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: "Body bukan JSON valid" }); }

  let { kelasAsal, kelasTujuan, ids, nises, santriIds, idMap } = body || {};
  if (!kelasAsal || !kelasTujuan) return json(400, { error: "Wajib: kelasAsal & kelasTujuan" });

  const asal   = normKelas(kelasAsal);
  const tujuan = normKelas(kelasTujuan);

  const idsArr   = Array.isArray(ids) ? ids.map(String) : [];
  const nisesArr = Array.isArray(nises) ? nises.map(String) : [];
  const legacy   = Array.isArray(santriIds) ? santriIds.map(String) : [];
  const rawKeys  = [...idsArr, ...nisesArr, ...legacy].map((v)=>String(v||"").trim()).filter(Boolean);
  if (!rawKeys.length) return json(400, { error: "Minimal satu id/nis (ids/nises/santriIds)" });

  // Bangun WHERE
  const cond = [`class_name = ?`];
  const binds = [asal];

  if (nisesArr.length) { cond.push(`(student_nis IN (${placeholders(nisesArr.length)}))`); binds.push(...nisesArr); }
  if (idsArr.length || legacy.length) {
    const unionIds = [...idsArr, ...legacy];
    cond.push(`(student_id_text IN (${placeholders(unionIds.length)}))`);
    binds.push(...unionIds);
  }
  const nameLikes = rawKeys.filter((x) => /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(x));
  if (nameLikes.length) {
    cond.push(`(LOWER(student_name) IN (${placeholders(nameLikes.length)}))`);
    binds.push(...nameLikes.map((s) => s.toLowerCase()));
  }

  const sqlSel = `
    SELECT rowid, student_nis, student_id_text, student_name,
           jenjang, semester, keterangan, meta_json
    FROM roster
    WHERE ${cond.join(" AND ")}
  `;
  const q = await db.prepare(sqlSel).bind(...binds).all();
  const rows = Array.isArray(q.results) ? q.results : [];
  if (!rows.length) return json(404, { error: "Tidak ada entri roster yang cocok" });

  const idMapArr = Array.isArray(idMap) ? idMap : [];
  const mapByOldId = new Map(idMapArr.map((m) => [String(m.oldId || ""), String(m.newId || "")]));

  await db.exec("BEGIN");
  try {
    for (const r of rows) {
      const oldId = String(r.student_id_text || "");
      const newId = mapByOldId.get(oldId) || oldId;

      const nStuKey = buildStudentKey(r.student_nis, newId, r.student_name);

      await db.prepare(
        `INSERT INTO roster
           (class_name, student_key, student_nis, student_id_text, student_name,
            jenjang, semester, keterangan, meta_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
         ON CONFLICT(class_name, student_key) DO NOTHING`
      ).bind(
        tujuan,
        nStuKey,
        r.student_nis || null,
        newId || null,
        r.student_name || null,
        r.jenjang || null,
        r.semester || null,
        r.keterangan || null,
        r.meta_json || null
      ).run();
    }

    // Hapus dari asal
    const rowids = rows.map((x) => x.rowid);
    await db.prepare(`DELETE FROM roster WHERE rowid IN (${placeholders(rowids.length)})`).bind(...rowids).run();

    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    return json(500, { error: `Gagal pindah roster: ${e.message || e}` });
  }

  return json(200, { success: true, moved: rows.length });
}
