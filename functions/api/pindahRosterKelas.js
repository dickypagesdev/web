export const onRequestOptions = () => json({}, 204);

export async function onRequestPost(ctx){
  const db = ctx.env.ABSENSI_DB || ctx.env.DB;
  if (!db) return jsonErr(500, "Database binding (env.ABSENSI_DB) tidak tersedia.");

  try {
    const b = await ctx.request.json();
    const kelasAsal   = normKelas(b?.kelasAsal);
    const kelasTujuan = normKelas(b?.kelasTujuan);
    const identifiers = Array.isArray(b?.identifiers) ? b.identifiers : [];

    if (!kelasAsal || !kelasTujuan) return jsonErr(400,"Wajib: kelasAsal & kelasTujuan");
    if (kelasAsal === kelasTujuan)  return jsonErr(400,"kelasAsal dan kelasTujuan tidak boleh sama");
    if (!identifiers.length)        return jsonErr(400,"Wajib: identifiers[] (id/nis/nama)");

    const src = (await db.prepare(`SELECT * FROM students WHERE kelas=?`).bind(kelasAsal).all()).results || [];
    const dst = (await db.prepare(`SELECT * FROM students WHERE kelas=?`).bind(kelasTujuan).all()).results || [];

    const wantID   = new Set(identifiers.map(v=>String(v).trim()).filter(v=>/^\d+$/.test(v)));
    const wantNIS  = new Set(identifiers.map(v=>String(v).trim()).filter(Boolean));
    const wantNAME = new Set(identifiers.map(v=>String(v).trim().toLowerCase()).filter(Boolean));

    const matchRow = (r)=>{
      const id  = String(r?.id ?? "");
      const nis = String(r?.nis ?? "");
      const nmL = String(r?.nama ?? "").toLowerCase();
      return (wantID.has(id) || wantNIS.has(nis) || wantNAME.has(nmL));
    };
    const sumber = src.filter(matchRow);
    if (!sumber.length) return jsonErr(404, "Santri tidak ditemukan di kelas asal (cek id/nis/nama).");

    const byNis  = new Map(dst.filter(r=>r.nis).map(r=>[String(r.nis), r]));
    const byName = new Map(dst.map(r=>[String(r.nama||"").toLowerCase(), r]));

    const cols   = await getCols(db, "students");
    const nonId  = cols.filter(c=>c.toLowerCase()!=="id");

    let merged=0, inserted=0;
    const now = nowIso();

    await db.exec("BEGIN TRANSACTION");
    for (const s of sumber){
      const keyNis  = String(s.nis||"");
      const keyName = String(s.nama||"").toLowerCase();
      const d = (keyNis && byNis.get(keyNis)) || (keyName && byName.get(keyName)) || null;

      if (d){
        const sets=[], params=[];
        for (const c of nonId){
          if (c === "created_at") continue;
          sets.push(`${c}=?`);
          params.push(c==="kelas" ? kelasTujuan : (s[c] ?? d[c] ?? null));
        }
        sets.push(`updated_at=?`); params.push(now);
        params.push(d.id, d.kelas);
        await db.prepare(`UPDATE students SET ${sets.join(",")} WHERE id=? AND kelas=?`).bind(...params).run();
        merged++;
      } else {
        const placeholders = nonId.map(_=>"?").join(",");
        const vals = nonId.map(c => c==="kelas" ? kelasTujuan :
                                   c==="updated_at" ? now :
                                   c==="created_at" ? (s.created_at || now) :
                                   (s[c] ?? null));
        await db.prepare(`INSERT INTO students (${nonId.join(",")}) VALUES (${placeholders})`).bind(...vals).run();
        inserted++;
      }
    }
    await db.exec("COMMIT");

    return json({ success:true, moved: merged+inserted, merged, inserted, idMap: [] });
  } catch (e){
    try{ await (ctx.env.ABSENSI_DB || ctx.env.DB)?.exec("ROLLBACK"); }catch{}
    return jsonErr(500, e?.message || String(e));
  }
}

/* utils */
const nowIso = ()=> new Date().toISOString();
const normKelas = (k)=> String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`;
const json = (obj, status=200)=> new Response(JSON.stringify(obj), {status, headers:hdr()});
const jsonErr = (status, error, detail)=> json({success:false, error, ...(detail?{detail}:{})}, status);
const hdr = ()=>({
  "content-type":"application/json; charset=utf-8",
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"POST,OPTIONS",
  "access-control-allow-headers":"content-type, authorization",
});
async function getCols(db, table){
  const rs = await db.prepare(`PRAGMA table_info("${table.replace(/"/g,'""')}")`).all();
  return (rs?.results||[]).map(r=>String(r.name));
}
