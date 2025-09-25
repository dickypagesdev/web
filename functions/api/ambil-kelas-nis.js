import { ghGetJsonAgg } from "../_ghAgg.js";

// /functions/api/ambil-kelas-nis.js
// Endpoint: GET /api/ambil-kelas-nis?kelas=Nama
// Menerima: 01, kelas_01, kelas-01, kelas_01.json
// Return: [{ id, nis, nama }, ...]

const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

export const onRequestOptions = () => json({}, 204);

export async function onRequestGet({ request, env }) {
  const TOKEN = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!TOKEN) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("kelas") || "").trim();
  if (!raw) return json({ message: "Parameter kelas wajib diisi." }, 400);

  // Normalisasi input → buat beberapa kandidat path yang mungkin (root repo)
  // contoh input yang didukung: "01", "kelas_01", "kelas-01", "kelas_01.json"
  const base = raw.replace(/\.json$/i, "").replace(/-/g, "_");

  const candidates = new Set();

  if (/^kelas_/.test(base)) {
    // sudah format kelas_XX
    candidates.add(`${base}.json`);
  } else {
    // angka 1–2 digit → nol-pad (1 -> 01)
    const m = base.match(/^(\d{1,2})$/);
    if (m) {
      const two = m[1].padStart(2, "0");
      candidates.add(`kelas_${two}.json`);
    }
    // umum: kelas_<base>.json
    candidates.add(`kelas_${base}.json`);
  }

  // Jika user benar2 kirim dengan .json penuh
  if (/\.json$/i.test(raw)) candidates.add(raw);

  const tried = [];
  let dataArray = null;

  for (const path of candidates) {
    tried.push(path);
    try {
      const { exists, data } = await ghGetJsonAgg(TOKEN, path);
      if (!exists) continue;
      // roster harus array
      if (Array.isArray(data)) {
        dataArray = data;
        break;
      }
    } catch {
      // lanjut kandidat berikutnya
      continue;
    }
  }

  if (!dataArray) {
    return json({
      source: "github",
      step: "get-kelas",
      message: "File kelas tidak ditemukan di repo.",
      tried,
      hint: "Pastikan nama file sesuai, mis. kelas_01.json dan query 'kelas=kelas_01' atau 'kelas=01'."
    }, 404);
  }

  const result = dataArray.map((s) => ({
    id: s?.id,
    nis: s?.nis,
    nama: s?.nama,
  }));

  return json(result, 200);
}

export async function onRequest(ctx) {
  if (!["GET", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ message: "Method Not Allowed" }, 405);
  }
}
