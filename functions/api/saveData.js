export async function onRequestPost({ request, env }) {
  const { tanggal, kelas, data } = await request.json().catch(()=>({}));
  if (!kelas || !tanggal || !Array.isArray(data)) {
    return new Response(JSON.stringify({ success:false, error:'payload tidak valid' }), {
      status:400, headers: { 'Content-Type':'application/json' }
    });
  }

  // fungsi bantu: bikin student_key stabil
  const toKey = (obj) => {
    const nis = (obj?.nis ?? '').toString().trim();
    const id  = (obj?.id  ?? '').toString().trim();
    const nm  = (obj?.nama?? '').toString().trim().toLowerCase();
    if (nis) return `NIS:${nis}`;
    if (id)  return `ID:${id}`;
    if (nm)  return `NAME:${nm}`;
    return `ROW:${cryptoRandom()}`; // fallback ekstrem; kecil kemungkinan terpakai
  };

  const cryptoRandom = () => Math.random().toString(36).slice(2);

  // siapkan batch UPSERT semua baris santri
  const stmt = env.DB.prepare(
    `INSERT INTO attendance_v2 (class_name, tanggal, student_key, payload_json, updated_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))
     ON CONFLICT(class_name, tanggal, student_key)
     DO UPDATE SET payload_json=excluded.payload_json, updated_at=datetime('now')`
  );

  const ops = [];
  for (const row of data) {
    // simpan seluruh objek yang sudah kamu bangun di frontend (tanpa hilang satupun field)
    const key = toKey(row);
    ops.push(
      stmt.bind(
        String(kelas), String(tanggal), String(key),
        JSON.stringify(row)
      )
    );
  }

  try {
    await env.DB.batch(ops);
    return new Response(JSON.stringify({ success:true, saved:data.length }), {
      headers: { 'Content-Type':'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success:false, error:String(e?.message||e) }), {
      status:500, headers: { 'Content-Type':'application/json' }
    });
  }
}
