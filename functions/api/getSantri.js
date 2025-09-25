import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/getSantri.js
// GET /api/getSantri?kelas=1 | kelas_1 | kelas-01 | kelas_01.json
// Return: array roster santri ([]) bila belum ada file
// ENV: GITHUB_TOKEN — fallback ke MTQ_TOKEN

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

function normKelasInput(raw = "") {
  let v = String(raw || "").trim();
  if (!v) return "";
  v = v.replace(/\.json$/i, ""); // buang .json jika ada
  v = v.replace(/-/g, "_");      // kelas-01 -> kelas_01
  if (!/^kelas_/i.test(v)) {
    // Jika hanya angka 1–2 digit, nol-pad ke 2 (opsional)
    const m = v.match(/^(\d{1,2})$/);
    if (m) v = `kelas_${m[1].padStart(2, "0")}`;
    else   v = `kelas_${v}`;
  }
  return v;
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) return json({ error: "GITHUB_TOKEN belum diset." }, 500);

  const url   = new URL(request.url);
  const raw   = url.searchParams.get("kelas") || "";
  if (!raw) return json({ error: "Parameter 'kelas' wajib diisi" }, 400);

  const kelas = normKelasInput(raw);
  if (!kelas) return json({ error: "Parameter 'kelas' tidak valid" }, 400);

  const filePath = `${kelas}.json`; // root repo

  try {
    const { exists, data } = await ghGetJsonAgg(token, filePath);

    // Jika file belum ada → kembalikan array kosong
    if (!exists) return json([]);

    // Normal: roster adalah array
    const arr = Array.isArray(data) ? data : [];
    return json(arr);
  } catch (err) {
    return json({ error: "Gagal mengambil data", detail: String(err?.message || err) }, 502);
  }
}
