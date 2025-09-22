// POST /api/pindahKelasMulaiTanggal
// body: { kelasAsal, kelasTujuan, ids[], nises[], idMap[], startDate }

export const onRequestPost = async ({ request, env }) => {
  const db = env.ABSENSI_DB;
  let body; try { body = await request.json(); } catch { return json({error:'Body JSON'},400); }
  const { kelasAsal, kelasTujuan, ids = [], nises = [], idMap = [], startDate } = body || {};
  if (!kelasAsal || !kelasTujuan || !startDate) return json({error:'kelasAsal, kelasTujuan, startDate wajib'},400);

  const { results: dates } = await db.prepare(
    `SELECT DISTINCT tanggal FROM absensi_rows WHERE kelas=? AND tanggal>=? ORDER BY tanggal ASC`
  ).bind(kelasAsal, startDate).all();

  const map = new Map(); (idMap||[]).forEach(m => { if (m?.oldId&&m?.newId) map.set(String(m.oldId), String(m.newId)); });
  const idSet = new Set(ids.map(String));
  const nisSet = new Set(nises.map(String));

  let totalMoved = 0;
  for (const d of (dates||[])) {
    const tanggal = d.tanggal;
    const { results: rows } = await db.prepare(
      `SELECT row_id, id, nis FROM absensi_rows WHERE kelas=? AND tanggal=?`
    ).bind(kelasAsal, tanggal).all();

    const targets = rows.filter(r => idSet.has(String(r.id)) || (r.nis && nisSet.has(String(r.nis))));
    if (!targets.length) continue;

    await db.batch(targets.map(r => {
      const newId = map.get(String(r.id)) || String(r.id);
      return db.prepare(`UPDATE absensi_rows SET kelas=?, id=? WHERE row_id=?`)
               .bind(kelasTujuan, newId, r.row_id);
    }));

    totalMoved += targets.length;
  }

  await db.exec(`DELETE FROM totals_store WHERE kelas IN (?, ?)`, [kelasAsal, kelasTujuan]);
  return json({ success:true, totalMoved });
};

const json = (o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
export const onRequestOptions = () => new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
