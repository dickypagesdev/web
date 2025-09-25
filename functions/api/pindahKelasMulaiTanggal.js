// /functions/api/pindahKelasMulaiTanggal.js
// POST /api/pindahKelasMulaiTanggal
// Body: {
//   kelasAsal:"01|kelas_01",
//   kelasTujuan:"02|kelas_02",
//   startDate:"YYYY-MM-DD",
//   ids?:[], nises?:[], names?:[]
// }
import { ghGetJsonAgg, ghPutJsonAgg } from "./_ghAgg.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const norm = (k) => (String(k || "").startsWith("kelas_") ? String(k) : `kelas_${k}`);
const J = (s, d) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const sortItems = (a) =>
  [...a].sort(
    (x, y) => (parseInt(x?.id || 0, 10) || 0) - (parseInt(y?.id || 0, 10) || 0)
  );

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return J(405, { error: "Method Not Allowed" });
  }

  const token = env.GITHUB_TOKEN;
  if (!token) return J(500, { error: "GITHUB_TOKEN tidak tersedia" });

  // Parse body
  let body = {};
  try {
    body = await request.json();
  } catch {
    return J(400, { error: "Body bukan JSON valid" });
  }

  let {
    kelasAsal,
    kelasTujuan,
    startDate,
    ids = [],
    nises = [],
    names = [],
  } = body || {};

  if (!kelasAsal || !kelasTujuan || !startDate) {
    return J(400, {
      error: "Wajib: kelasAsal, kelasTujuan, startDate",
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
    return J(400, { error: "startDate harus YYYY-MM-DD" });
  }

  const asal = norm(kelasAsal);
  const tujuan = norm(kelasTujuan);

  if (!Array.isArray(ids)) ids = [];
  if (!Array.isArray(nises)) nises = [];
  if (!Array.isArray(names)) names = [];

  // matcher (id/nis/nama)
  const idPick = new Set(ids.map(String));
  const nisPick = new Set(nises.map(String));
  const namePick = new Set(names.map((v) => String(v).toLowerCase()));
  const match = (r) => {
    const id = String(r?.id ?? "");
    const nis = String(r?.nis ?? "");
    const nmL = String(r?.nama ?? "").toLowerCase();
    return (id && idPick.has(id)) || (nis && nisPick.has(nis)) || (nmL && namePick.has(nmL));
  };

  try {
    // READ RAW agregat asal & tujuan
    const src = await ghGetJsonAgg(token, `absensi/${asal}.json`);
    if (!src.exists) return J(404, { error: "Absensi asal tidak ditemukan" });
    const dst = await ghGetJsonAgg(token, `absensi/${tujuan}.json`);

    const srcObj =
      src.data && typeof src.data === "object"
        ? src.data
        : { meta: { kelas: asal, versi: 1 }, records: [] };

    const dstObj =
      dst.data && typeof dst.data === "object"
        ? dst.data
        : { meta: { kelas: tujuan, versi: 1 }, records: [] };

    const sRecs = Array.isArray(srcObj.records) ? srcObj.records : (srcObj.records = []);
    const dRecs = Array.isArray(dstObj.records) ? dstObj.records : (dstObj.records = []);

    let totalMoved = 0;

    for (const rec of sRecs) {
      const tgl = String(rec?.tanggal || "");
      if (!tgl || tgl < startDate) continue;

      const srcItems = Array.isArray(rec?.items) ? rec.items : [];
      const toMove = srcItems.filter(match);
      if (!toMove.length) continue;

      // record tujuan untuk tanggal ini
      let d = dRecs.find((r) => String(r?.tanggal) === tgl);
      if (!d) {
        d = { tanggal: tgl, items: [] };
        dRecs.push(d);
      }
      const dstItems = Array.isArray(d.items) ? d.items : (d.items = []);

      // index tujuan untuk dedup id/nis
      const seenId = new Set(dstItems.map((x) => String(x?.id ?? "")).filter(Boolean));
      const seenNis = new Set(dstItems.map((x) => String(x?.nis ?? "")).filter(Boolean));
      const merged = [...dstItems];

      for (const row of toMove) {
        const id = String(row?.id ?? "");
        const nis = String(row?.nis ?? "");

        let mergedIdx = -1;
        if (id && seenId.has(id)) {
          mergedIdx = merged.findIndex((x) => String(x?.id || "") === id);
        } else if (nis && seenNis.has(nis)) {
          mergedIdx = merged.findIndex((x) => String(x?.nis || "") === nis);
        }

        if (mergedIdx >= 0) {
          // merge (gabungkan marks.audio)
          const keep = merged[mergedIdx];
          const a = Array.isArray(keep?.marks?.audio) ? keep.marks.audio : [];
          const b = Array.isArray(row?.marks?.audio) ? row.marks.audio : [];
          const set = new Set([...a.map(String), ...b.map(String)]);
          const m = { ...keep, ...row };
          if (!m.marks) m.marks = {};
          m.marks.audio = Array.from(set);
          merged[mergedIdx] = m;
        } else {
          merged.push(row);
          if (id) seenId.add(id);
          if (nis) seenNis.add(nis);
        }
      }

      d.items = sortItems(merged);
      // kurangi dari asal
      rec.items = sortItems(srcItems.filter((r) => !match(r)));
      totalMoved += toMove.length;
    }

    // sort tanggal
    srcObj.records = [...sRecs].sort((a, b) =>
      String(a.tanggal).localeCompare(String(b.tanggal))
    );
    dstObj.records = [...dRecs].sort((a, b) =>
      String(a.tanggal).localeCompare(String(b.tanggal))
    );

    // TULIS (PUT) — base64 minified + retry (helper)
    await ghPutJsonAgg(
      token,
      `absensi/${tujuan}.json`,
      dstObj,
      null,
      `pindah mulai ${startDate}: ${asal} → ${tujuan}`
    );
    await ghPutJsonAgg(
      token,
      `absensi/${asal}.json`,
      srcObj,
      null,
      `pindah mulai ${startDate}: ${asal} → ${tujuan} (remove)`
    );

    return J(200, { ok: true, totalMoved });
  } catch (e) {
    return J(500, { error: String(e?.message || e) });
  }
}
