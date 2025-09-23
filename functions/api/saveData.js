// functions/api/saveData.js  — D1 version
export const onRequestOptions = () => json({}, 204);

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },
});

const nowIso = () => new Date().toISOString();
const normKey = (v) => String(v ?? "").trim();

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding DB tidak tersedia" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error:"Body harus JSON" }, 400); }

  let { tanggal, kelas, data } = body || {};
  tanggal = normKey(tanggal); kelas = normKey(kelas);
  if (!tanggal || !kelas || !Array.isArray(data)) return json({ error:"Data tidak lengkap" }, 400);

  const tx = env.DB.prepare("BEGIN").run();
  try {
    const upsert = env.DB.prepare(`
      INSERT INTO attendance_snapshots
        (class_name, tanggal, student_key, nama, jenjang, semester,
         payload_json, total_juz_num, total_mur_num, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(class_name, tanggal, student_key) DO UPDATE SET
        nama          = excluded.nama,
        jenjang       = excluded.jenjang,
        semester      = excluded.semester,
        payload_json  = excluded.payload_json,
        total_juz_num = excluded.total_juz_num,
        total_mur_num = excluded.total_mur_num,
        updated_at    = excluded.updated_at
    `);

    const now = nowIso();

    for (const it of data) {
      const id  = normKey(it?.id);
      const nis = normKey(it?.nis);
      const student_key = nis || id;
      if (!student_key) continue; // tanpa key, skip agar tidak 500

      const payload = JSON.stringify(it ?? {});
      const total_juz = Number(it?.totalJuz ?? 0) || 0;
      const total_mur =
        Number(it?.juzmurajaah ?? (
          Number(it?.juzmur1||0)+Number(it?.juzmur2||0)+Number(it?.juzmur3||0)
        )) || 0;

      upsert.bind(
        kelas, tanggal, student_key,
        normKey(it?.nama), normKey(it?.jenjang), normKey(it?.semester),
        payload, total_juz, total_mur, now, now
      ).run();
    }

    env.DB.prepare("COMMIT").run();
    return json({ success:true }, 200);
  } catch (e) {
    env.DB.prepare("ROLLBACK").run();
    return json({ success:false, error: String(e?.message||e) }, 500);
  }
}

export async function onRequest(ctx){
  const m = ctx.request.method.toUpperCase();
  if (m === "OPTIONS") return onRequestOptions();
  if (m !== "POST") return json({ message:"Method Not Allowed" }, 405);
  return onRequestPost(ctx);
}
