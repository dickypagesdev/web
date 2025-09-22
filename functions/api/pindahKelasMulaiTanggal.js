// /functions/api/pindahKelasMulaiTanggal.js  (D1)
// POST /api/pindahKelasMulaiTanggal
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

  let { kelasAsal, kelasTujuan, ids, nises, santriIds, startDate, idMap } = body || {};
  if (!kelasAsal || !kelasTujuan) return json(400, { error: "Wajib: kelasAsal & kelasTujuan" });
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json(400, { error: "startDate wajib YYYY-MM-DD" });

  const asal   = normKelas(kelasAsal);
  const tujuan = normKelas(kelasTujuan);

  const idsArr   = Array.isArray(ids) ? ids.map(String) : [];
  const nisesArr = Array.isArray(nises) ? nises.map(String) : [];
  const legacy   = Array.isArray(santriIds) ? santriIds.map(String) : [];
  const rawKeys  = [...idsArr, ...nisesArr, ...legacy].map((v)=>String(v||"").trim()).filter(Boolean);
  if (rawKeys.length === 0) return json(400, { error: "Minimal satu id/nis (ids/nises/santriIds)" });

  const cond = [`class_name = ?`, `tanggal >= ?`];
  const binds = [asal, startDate];

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

  const sqlSelect = `
    SELECT rowid, tanggal, student_nis, student_id_text, student_name,
           payload_json, total_juz, total_mur
    FROM attendance
    WHERE ${cond.join(" AND ")}
  `;
  const cand = await (env.ABSENSI_DB || env.DB).prepare(sqlSelect).bind(...binds).all();
  const rows = Array.isArray(cand.results) ? cand.results : [];
  if (!rows.length) return json(404, { error: "Tidak ada baris yang cocok" });

  const idMapArr = Array.isArray(idMap) ? idMap : [];
  const mapByOldId = new Map(idMapArr.map((m) => [String(m.oldId || ""), String(m.newId || "")]));

  await (env.ABSENSI_DB || env.DB).exec("BEGIN");
  try {
    for (const r of rows) {
      const oldId = String(r.student_id_text || "");
      const newId = mapByOldId.get(oldId) || oldId;
      const nStuKey = buildStudentKey(r.student_nis, newId, r.student_name);

      await (env.ABSENSI_DB || env.DB).prepare(
        `INSERT INTO attendance
         (class_name, tanggal, student_key, student_nis, student_id_text, student_name,
          payload_json, total_juz, total_mur, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
         ON CONFLICT(class_name, tanggal, student_key) DO NOTHING`
      ).bind(
        tujuan, r.tanggal, nStuKey,
        r.student_nis || null, newId || null, r.student_name || null,
        r.payload_json, r.total_juz ?? 0, r.total_mur ?? 0
      ).run();
    }

    const rowids = rows.map((x) => x.rowid);
    const delSql = `DELETE FROM attendance WHERE rowid IN (${placeholders(rowids.length)})`;
    await (env.ABSENSI_DB || env.DB).prepare(delSql).bind(...rowids).run();

    await (env.ABSENSI_DB || env.DB).exec("COMMIT");
  } catch (e) {
    await (env.ABSENSI_DB || env.DB).exec("ROLLBACK");
    return json(500, { error: `Gagal pindah: ${e.message || e}` });
  }

  return json(200, { success: true, movedCandidates: rows.length });
}
