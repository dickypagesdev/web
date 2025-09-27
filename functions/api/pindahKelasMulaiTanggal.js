export const onRequestOptions = () => json({}, 204);

export async function onRequestPost(ctx){
  const db = ctx.env.ABSENSI_DB || ctx.env.DB;
  if (!db) return jsonErr(500, "Database binding (env.ABSENSI_DB) tidak tersedia.");

  try{
    const b = await ctx.request.json();
    const kelasAsal   = normKelas(b?.kelasAsal);
    const kelasTujuan = normKelas(b?.kelasTujuan);
    const ids   = arr(b?.ids);
    const nises = arr(b?.nises);
    const start = String(b?.startDate||"").trim();

    if (!kelasAsal || !kelasTujuan) return jsonErr(400,"Wajib: kelasAsal & kelasTujuan");
    if (kelasAsal === kelasTujuan)  return jsonErr(400,"kelasAsal dan kelasTujuan tidak boleh sama");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return jsonErr(400,"startDate harus YYYY-MM-DD");
    if (!ids.length && !nises.length) return jsonErr(400,"Wajib: minimal ids[] atau nises[]");

    let nisList = [...new Set(nises.map(String))];
    if (!nisList.length && ids.length){
      const rs = await db.prepare(
        `SELECT nis FROM students WHERE kelas=? AND id IN (${ph(ids.length)})`
      ).bind(kelasAsal, ...ids).all();
      nisList = (rs?.results||[]).map(r=>String(r.nis)).filter(Boolean);
    }
    if (!nisList.length) return jsonErr(404,"Santri tidak ditemukan di kelas asal.");

    const before = await db.prepare(
      `SELECT date AS tanggal, COUNT(*) AS cnt
       FROM absensi
       WHERE kelas=? AND date>=? AND nis IN (${ph(nisList.length)})
       GROUP BY date ORDER BY date`
    ).bind(kelasAsal, start, ...nisList).all();
    const details = (before?.results||[]).map(r=>({tanggal:r.tanggal, moved:Number(r.cnt||0)}));
    const totalMoved = details.reduce((a,b)=>a+b.moved,0);

    const now = nowIso();
    await db.exec("BEGIN TRANSACTION");

    await db.prepare(
      `UPDATE absensi SET kelas=?, updated_at=?
       WHERE kelas=? AND date>=? AND nis IN (${ph(nisList.length)})`
    ).bind(kelasTujuan, now, kelasAsal, start, ...nisList).run();

    await db.prepare(
      `UPDATE students SET kelas=?, updated_at=?
       WHERE kelas=? AND nis IN (${ph(nisList.length)})`
    ).bind(kelasTujuan, now, kelasAsal, ...nisList).run();

    await db.exec("COMMIT");
    return json({ success:true, totalMoved, details, from:kelasAsal, to:kelasTujuan, startDate:start });
  }catch(e){
    try{ await (ctx.env.ABSENSI_DB || ctx.env.DB)?.exec("ROLLBACK"); }catch{}
    return jsonErr(500, e?.message || String(e));
  }
}

/* utils */
const nowIso = ()=> new Date().toISOString();
const normKelas = (k)=> String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`;
const json = (o,s=200)=> new Response(JSON.stringify(o), {status:s, headers:hdr()});
const jsonErr = (s,e,d)=> json({success:false, error:e, ...(d?{detail:d}:{})}, s);
const hdr = ()=>({
  "content-type":"application/json; charset=utf-8",
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"POST,OPTIONS",
  "access-control-allow-headers":"content-type, authorization",
});
const arr = (v)=> Array.isArray(v)?v:[];
const ph = (n)=> Array.from({length:n},()=>"?").join(",");
