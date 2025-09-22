// functions/_lib/db.js
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
export const ok  = (o, s=200)=>new Response(JSON.stringify(o), { status:s, headers:{ "Content-Type":"application/json", ...CORS }});
export const bad = (o, s=400)=>new Response(JSON.stringify(o), { status:s, headers:{ "Content-Type":"application/json", ...CORS }});

export const parseJSON = async (req)=>{ try{ return await req.json(); }catch{ return null; } };

export const mkKey = (row) => {
  const nis = (row?.nis ?? "").toString().trim();
  if (nis) return `NIS:${nis}`;
  const id  = (row?.id  ?? "").toString().trim();
  if (id)  return `ID:${id}`;
  return `ROW:${crypto.randomUUID()}`;
};

export async function selectAttendance(env, kelas, tanggal){
  const { results } = await env.DB.prepare(
    "SELECT payload_json FROM attendance_v2 WHERE class_name=? AND tanggal=?"
  ).bind(kelas, tanggal).all();
  const out=[]; for(const r of results||[]){ try{ out.push(JSON.parse(r.payload_json)); }catch{} }
  return out;
}

export async function saveSnapshot(env, kelas, tanggal, rows){
  const del = env.DB.prepare("DELETE FROM attendance_v2 WHERE class_name=? AND tanggal=?").bind(kelas, tanggal);
  const ops = [del];
  for (const row of (rows||[])) {
    if (!row) continue;
    ops.push(
      env.DB.prepare(
        `INSERT INTO attendance_v2 (class_name, tanggal, student_key, payload_json, updated_at)
         VALUES (?,?,?,?,datetime('now'))`
      ).bind(kelas, tanggal, mkKey(row), JSON.stringify(row))
    );
  }
  await env.DB.batch(ops);
  return ops.length - 1;
}

export async function upsertRosterFromRows(env, kelas, rows){
  const ops=[];
  for (const r of (rows||[])) {
    if (!r) continue;
    const key = mkKey(r);
    const nis = (r?.nis ?? "").toString().trim() || null;
    const idt = (!nis ? (r?.id ?? "").toString().trim() : "") || null;
    const nama= (r?.nama ?? "").toString().trim() || null;
    const jen = (r?.jenjang ?? "").toString().trim() || null;
    const sem = (r?.semester ?? "").toString().trim() || null;
    const ket = (r?.keterangan ?? "").toString().trim() || null;

    ops.push(
      env.DB.prepare(`
        INSERT INTO roster_v1 (class_name, student_key, id_text, nis_text, nama, jenjang, semester, keterangan, meta_json, updated_at)
        VALUES (?,?,?,?,?,?,?, ?, "{}", datetime('now'))
        ON CONFLICT(class_name, student_key) DO UPDATE SET
          id_text=COALESCE(excluded.id_text, id_text),
          nis_text=COALESCE(excluded.nis_text, nis_text),
          nama=COALESCE(excluded.nama, nama),
          jenjang=COALESCE(excluded.jenjang, jenjang),
          semester=COALESCE(excluded.semester, semester),
          keterangan=COALESCE(excluded.keterangan, keterangan),
          updated_at=datetime('now')
      `).bind(kelas, key, idt, nis, nama, jen, sem, ket)
    );
  }
  if (ops.length) await env.DB.batch(ops);
}

// util kecil
export const toArr = (x)=> Array.isArray(x) ? x : (x? [x] : []);
