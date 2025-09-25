// /functions/api/saveData.js
// POST /api/saveData
// Body: { kelas, tanggal:"YYYY-MM-DD", items:[{ id?, nis?, nama?, marks?{audio?:[]}, ... }, ...] }
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const J = (s, d) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const normKelas = (k) =>
  String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`;

const pad2 = (n) => String(n).padStart(2, "0");
const fixTanggal = (t) => {
  // Terima "2025-9-5" => "2025-09-05"; tolak format lain
  const m = String(t || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = m[1];
  const mo = pad2(m[2]);
  const d = pad2(m[3]);
  return `${y}-${mo}-${d}`;
};

function sortById(arr) {
  return [...arr].sort(
    (a, b) =>
      (parseInt(a?.id || 0, 10) || 0) - (parseInt(b?.id || 0, 10) || 0)
  );
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return J(405, { error: "Method Not Allowed" });

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500, { error: "GITHUB_TOKEN tidak tersedia" });

  // --- parse & normalisasi payload
  let body = {};
  try {
    body = await request.json();
  } catch {
    return J(400, { error: "Body bukan JSON valid" });
  }

  let { kelas, tanggal, items } = body || {};

  kelas = normKelas(kelas);
  tanggal = fixTanggal(tanggal);

  // Jika items object tunggal → jadikan array
  if (items && !Array.isArray(items) && typeof items === "object") {
    items = [items];
  }

  // Validasi detail
  if (!kelas) return J(400, { error: "Wajib: kelas" });
  if (!tanggal)
    return J(400, { error: "Wajib: tanggal (format YYYY-MM-DD)" });
  if (!Array.isArray(items))
    return J(400, {
      error:
        "Wajib: items[] (array). Jika hanya 1 item, kirimkan dalam array atau biarkan otomatis di-wrap.",
    });

  const path = `absensi/${kelas}.json`;

  try {
    // --- READ (RAW)
    const got = await ghGetJsonAgg(token, path);
    const obj =
      got.exists && typeof got.data === "object"
        ? got.data
        : { meta: { kelas, versi: 1 }, records: [] };

    obj.meta = obj.meta || { kelas, versi: 1 };
    const records = Array.isArray(obj.records)
      ? obj.records
      : (obj.records = []);

    // upsert record tanggal
    let rec = records.find((r) => String(r?.tanggal) === String(tanggal));
    if (!rec) {
      rec = { tanggal, items: [] };
      records.push(rec);
    }
    const dst = Array.isArray(rec.items) ? rec.items : (rec.items = []);

    // index by id & nis untuk cepat merge
    const byId = new Map();
    const byNis = new Map();
    dst.forEach((r, i) => {
      const id = String(r?.id ?? "");
      const nis = String(r?.nis ?? "");
      if (id) byId.set(id, i);
      if (nis) byNis.set(nis, i);
    });

    // merge incoming
    for (const row of items) {
      const rid = String(row?.id ?? "");
      const rns = String(row?.nis ?? "");
      let idx = -1;
      if (rid && byId.has(rid)) idx = byId.get(rid);
      else if (rns && byNis.has(rns)) idx = byNis.get(rns);

      if (idx >= 0) {
        // merge — keep existing, override with incoming
        const keep = dst[idx] || {};
        const incoming = { ...row };
        const merged = { ...keep, ...incoming };

        // merge audio: gabungkan & dedup
        const a = Array.isArray(keep?.marks?.audio) ? keep.marks.audio : [];
        const b = Array.isArray(row?.marks?.audio) ? row.marks.audio : [];
        const set = new Set([...a.map(String), ...b.map(String)]);
        if (!merged.marks) merged.marks = {};
        merged.marks.audio = Array.from(set);

        dst[idx] = merged;
      } else {
        // append baru, pastikan marks.audio array
        const nr = { ...row };
        if (!nr.marks) nr.marks = {};
        if (!Array.isArray(nr.marks.audio)) nr.marks.audio = [];
        dst.push(nr);
        if (rid) byId.set(rid, dst.length - 1);
        if (rns) byNis.set(rns, dst.length - 1);
      }
    }

    // sort id & tanggal
    rec.items = sortById(dst);
    obj.records = [...records].sort((a, b) =>
      String(a.tanggal).localeCompare(String(b.tanggal))
    );

    // --- WRITE (PUT base64 minified + retry)
    await ghPutJsonAgg(token, path, obj, null, `saveData: ${kelas} ${tanggal}`);

    return J(200, { ok: true, kelas, tanggal, count: rec.items.length });
  } catch (e) {
    return J(500, { error: String(e?.message || e) });
  }
}
