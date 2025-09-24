// functions/api/_utils.js

// ---------- HTTP helpers ----------
export function json(status, data, init = {}) {
  const baseHeaders = { "Content-Type": "application/json; charset=utf-8" };
  const hdr = init && init.headers ? { ...baseHeaders, ...init.headers } : baseHeaders;
  return new Response(JSON.stringify(data), { status, headers: hdr });
}
export const ok        = (data)                => json(200, data);
export const bad       = (msg, code = 400)     => json(code, { success: false, error: String(msg || "Bad Request") });
export const serverErr = (msg)                 => json(500,  { success: false, error: String(msg || "Server Error") });

// ---------- primitives ----------
export function str(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * parseNum: parsing angka robust (mendukung koma/titik campur)
 * - Hapus karakter non-angka kecuali . dan ,
 * - Deteksi pemisah desimal terakhir (.,)
 * - Normalisasi ke titik sebagai desimal
 */
export function parseNum(v, fallback = 0) {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  let s = String(v ?? "").trim();
  if (!s) return fallback;

  // buang semua kecuali digit, koma, titik, dan minus
  s = s.replace(/[^0-9.,-]/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot   = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // jika koma setelah titik → koma = desimal
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // titik setelah koma → titik = desimal
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // hanya koma → jadikan desimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // hanya titik → biarkan; hapus semua koma sisa
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

// ---------- domain helpers ----------
/** student_key = nis || id */
export function studentKeyOf(payload) {
  const nis = str(payload?.nis).trim();
  if (nis) return nis;
  const id = str(payload?.id).trim();
  return id || ""; // boleh kosong (idealnya ada salah satu)
}

/**
 * Hitung total mur dari payload:
 * - Prioritas pakai p.juzmurajaah bila ada & valid
 * - Jika kosong/0, jumlahkan juzmur1 + juzmur2 + juzmur3 (fallback)
 */
export function totalMurFromPayload(p) {
  const num = (x) => parseNum(x, 0);

  // coba total eksplisit dulu
  let tot = num(p?.juzmurajaah);

  if (!tot) {
    const s1 = num(p?.juzmur1 ?? p?.juzSesi1 ?? p?.juzmurajaah1);
    const s2 = num(p?.juzmur2 ?? p?.juzSesi2 ?? p?.juzmurajaah2);
    const s3 = num(p?.juzmur3 ?? p?.juzSesi3 ?? p?.juzmurajaah3);
    tot = s1 + s2 + s3;
  }

  // normalisasi 2 desimal
  const fixed = Number(parseFloat(tot).toFixed(2));
  return Number.isFinite(fixed) ? fixed : 0;
}
