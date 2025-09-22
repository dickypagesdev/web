// Cloudflare Pages Function (ESM)
// POST /api/pindahKelasSemuaTanggal
// body: { kelasAsal, kelasTujuan, ids[], nises[], idMap[] }
// Env: ABSENSI_DB (D1)

export const onRequestPost = async ({ request, env }) => {
  const db = env.ABSENSI_DB;
  let body; try { body = await request.json(); } catch { return json({error:'Body JSON'},400); }
  const { kelasAsal, kelasTujuan, ids = [], nises = [], idMap = [] } = body || {};
  if (!kelasAsal || !kelasTujuan) return json({error:'kelasAsal & kelasTujuan wajib'},400);

  // 1) Ambil semua tanggal yang punya data untuk kelasAsal
  const { results: dates } = await db.prepare(
    `SELECT DISTINCT tanggal FROM absensi_rows WHERE kelas=?`
  ).bind(kelasAsal).all();

  // 2) Siapkan pemetaan id lama → id baru (string)
  const map = new Map();
  (idMap||[]).forEach(m => { if (m?.oldId && m?.newId) map.set(String(m.oldId), String(m.newId)); });

  // 3) Build filter santri (by id lama atau NIS)
  const idSet = new Set(ids.map(String));
  const nisSet = new Set(nises.map(String));

  let totalMoved = 0;

  // 4) Loop tiap tanggal → UPDATE kelas + id (bila berubah)
  for (const d of (dates||[])) {
    const tanggal = d.tanggal;

    // Ambil baris yang akan dipindah (kelasAsal + match id/nis)
    const { results: rows } = await db.prepare(
      `SELECT row_id, id, nis FROM absensi_rows
       WHERE kelas=? AND tanggal=?`
    ).bind(kelasAsal, tanggal).all();

    const targets = rows.filter(r => idSet.has(String(r.id)) || (r.nis && nisSet.has(String(r.nis))));
    if (!targets.length) continue;

    // Batch update
    const tx = await db.batch(
      targets.map(r => {
        const newId = map.get(String(r.id)) || String(r.id); // kalau tidak berubah, tetap
        return db.prepare(
          `UPDATE absensi_rows SET kelas=?, id=? WHERE row_id=?`
        ).bind(kelasTujuan, newId, r.row_id);
      })
    );

    totalMoved += targets.length;
  }

  // 5) Invalidate cache totals (opsional)
  await db.exec(`DELETE FROM totals_store WHERE kelas IN (?, ?)`, [kelasAsal, kelasTujuan]);

  return json({ success:true, totalMoved });
};

const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
export const onRequestOptions = () => new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
