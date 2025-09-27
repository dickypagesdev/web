export const onRequestOptions = () => json({}, 204);

export async function onRequestPost(ctx){
  const db = ctx.env.ABSENSI_DB || ctx.env.DB;
  if (!db) return jsonErr(500, "Database binding (env.ABSENSI_DB) tidak tersedia.");

  try{
    // Di skema ini tidak ada tabel roster terpisah.
    // Roster tersirat dari attendance_snapshots, sehingga step ini tidak perlu memodifikasi DB.
    // Tetap balas sukses agar alur front-end lanjut ke langkah berikutnya.
    return json({ success:true, moved:0, merged:0, inserted:0, idMap:[] });
  }catch(e){
    return jsonErr(500, e?.message || String(e));
  }
}

/* utils */
const json = (o,s=200)=> new Response(JSON.stringify(o), {status:s, headers:hdr()});
const jsonErr = (s,e,d)=> json({success:false, error:e, ...(d?{detail:d}:{})}, s);
const hdr = ()=>({
  "content-type":"application/json; charset=utf-8",
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"POST,OPTIONS",
  "access-control-allow-headers":"content-type, authorization",
});
