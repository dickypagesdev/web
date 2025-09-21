// functions/api/saveData.js
// Cloudflare Pages Functions (ESM) — Simpan hasil simpanDataMutabaah ke D1

export const onRequestPost = async ({ request, env }) => {
  try {
    const { tanggal, kelas, data } = await request.json();

    if (!tanggal || !kelas || !Array.isArray(data)) {
      return json({ success: false, error: "tanggal, kelas, dan data[] wajib" }, 400);
    }

    // 1) Pastikan kelas ada
    const cls = await ensureClass(env.DB, kelas);
    const classId = cls.id;

    // 2) Proses per-siswa
    let cntStudents = 0, cntAttendance = 0, cntRecitations = 0;

    // siapkan batch container agar cepat
    const attendanceOps = [];
    const recitationOps = [];

    for (const row of data) {
      // a) pastikan siswa ada (cari by NIS, fallback nama)
      const student = await ensureStudent(env.DB, {
        nis: normStr(row.nis),
        nama: normStr(row.nama) || "(Tanpa Nama)",
        semester: strOr(row.semester, "1"),
        jenjang: strOr(row.jenjang, ""),
        keterangan: strOr(row.keterangan, ""),
        kelas_last: kelas
      });
      cntStudents++;

      // pastikan membership aktif (class_students)
      await ensureClassMembership(env.DB, classId, student.id);

      // b) ABSENSI — baca dari absensiExpanded jika ada (contoh: ["Hadir1","Izin2",...])
      const expanded = Array.isArray(row.absensiExpanded) ? row.absensiExpanded : [];
      const parsedSessions = parseAbsensiExpanded(expanded); // [{seq:1,status:'hadir'}, ...]
      if (parsedSessions.length === 0 && typeof row.absensi === "string" && row.absensi.trim()) {
        // fallback: absensi string "Hadir1, Izin2"
        parsedSessions.push(...parseAbsensiExpanded(row.absensi.split(",").map(s => s.trim())));
      }

      for (const s of parsedSessions) {
        attendanceOps.push(
          env.DB.prepare(`
            INSERT INTO attendance (student_id, class_id, tanggal, sesi, status, note)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(student_id, class_id, tanggal, sesi)
            DO UPDATE SET status=excluded.status, note=excluded.note
          `).bind(student.id, classId, tanggal, String(s.seq), s.status, "")
        );
      }
      cntAttendance += parsedSessions.length;

      // c) MURAJAAH — ambil murSessions (array objek sesi lengkap)
      const mur = Array.isArray(row.murSessions) ? row.murSessions : [];
      for (const sess of mur) {
        // sess: { from, to, pages, jFrom, jTo, juz, score, predikatText, predikatHuruf }
        recitationOps.push(
          env.DB.prepare(`
            INSERT INTO recitations
              (student_id, class_id, tanggal, tipe, juz_from, juz_to,
               page_from, page_to, surah_from, ayat_from, surah_to, ayat_to,
               persen, note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(
            student.id, classId, tanggal, "murajaah",
            toIntOrNull(sess.jFrom), toIntOrNull(sess.jTo),
            pageFrom(sess.pages), pageTo(sess.pages),
            surahFrom(sess.from), ayatFrom(sess.from),
            surahTo(sess.to), ayatTo(sess.to),
            toReal(sess.score), // simpan skor di kolom 'persen'
            buildPredikatNote(sess.predikatText, sess.predikatHuruf)
          )
        );
      }
      cntRecitations += mur.length;
    }

    // 3) Jalankan batch
    if (attendanceOps.length) await env.DB.batch(attendanceOps);
    if (recitationOps.length) await env.DB.batch(recitationOps);

    // 4) Simpan snapshot payload penuh (rekap dashboard) untuk kelas & tanggal ini
    await env.DB.prepare(`
      INSERT INTO daily_snapshots(class_id, tanggal, payload)
      VALUES (?,?,?)
      ON CONFLICT(class_id, tanggal) DO UPDATE SET payload = excluded.payload
    `).bind(classId, tanggal, JSON.stringify(data)).run();

    return json({
      success: true,
      kelas,
      tanggal,
      counts: { students: cntStudents, attendance: cntAttendance, recitations: cntRecitations }
    });
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
};

/* =================== Helpers =================== */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
  });

function normStr(v) {
  if (v == null) return "";
  return String(v).trim();
}
function strOr(v, def = "") {
  const s = normStr(v);
  return s ? s : def;
}
function toIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function toReal(v, def = 0) {
  if (v == null || v === "") return def;
  const s = String(v).replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : def;
}

// "Hadir1" -> {seq:1,status:'hadir'}
function parseAbsensiExpanded(arr) {
  const out = [];
  for (const item of arr) {
    const s = normStr(item);
    if (!s) continue;
    // terima variasi: "Hadir1", "hadir1", "Izin 2", "Sakit-3"
    const m = s.match(/([A-Za-z]+)\s*[-_ ]?\s*(\d+)/);
    if (!m) continue;
    const status = m[1].toLowerCase(); // hadir|izin|sakit|alpha
    const seq = parseInt(m[2], 10);
    if (!Number.isFinite(seq)) continue;
    out.push({ status, seq });
  }
  return out;
}

function splitRef(ref) {
  // "Al-Baqarah:5" -> ["Al-Baqarah", 5]
  const s = normStr(ref);
  if (!s) return ["", null];
  const [surah, ayat] = s.split(":");
  const ay = toIntOrNull(ayat);
  return [surah || "", ay];
}
function surahFrom(ref) { return splitRef(ref)[0] || null; }
function ayatFrom(ref) { return splitRef(ref)[1]; }
function surahTo(ref) { return splitRef(ref)[0] || null; }
function ayatTo(ref) { return splitRef(ref)[1]; }

function splitPages(pages) {
  // "10-15" -> [10,15]
  const s = normStr(pages);
  if (!s) return [null, null];
  const m = s.match(/(-?\d+)\s*[-–]\s*(-?\d+)/);
  if (!m) return [null, null];
  return [toIntOrNull(m[1]), toIntOrNull(m[2])];
}
function pageFrom(p) { return splitPages(p)[0]; }
function pageTo(p) { return splitPages(p)[1]; }

function buildPredikatNote(text, huruf) {
  const t = normStr(text);
  const h = normStr(huruf);
  if (!t && !h) return "";
  if (t && h) return `${t} (${h})`;
  return t || h;
}

async function ensureClass(DB, name) {
  const got = await DB.prepare(`SELECT id FROM classes WHERE name = ?`).bind(name).first();
  if (got) return got;
  const ins = await DB.prepare(`INSERT INTO classes(name) VALUES (?)`).bind(name).run();
  return { id: ins.lastRowId };
}

async function ensureStudent(DB, { nis, nama, semester, jenjang, keterangan, kelas_last }) {
  let st = null;
  if (nis) st = await DB.prepare(`SELECT * FROM students WHERE nis = ?`).bind(nis).first();
  if (!st && nama) st = await DB.prepare(`SELECT * FROM students WHERE nama = ?`).bind(nama).first();

  if (st) {
    // update info dasar + kelas_last
    await DB.prepare(`
      UPDATE students
      SET nama = COALESCE(?, nama),
          semester = COALESCE(?, semester),
          jenjang = COALESCE(?, jenjang),
          keterangan = COALESCE(?, keterangan),
          kelas_last = COALESCE(?, kelas_last)
      WHERE id = ?
    `).bind(nama || st.nama, semester || st.semester, jenjang || st.jenjang, keterangan || st.keterangan, kelas_last || st.kelas_last, st.id).run();
    return st;
  }

  const ins = await DB.prepare(`
    INSERT INTO students (nis, nama, semester, jenjang, keterangan, kelas_last)
    VALUES (?,?,?,?,?,?)
  `).bind(nis || null, nama, semester, jenjang, keterangan, kelas_last).run();

  return { id: ins.lastRowId, nis, nama, semester, jenjang, keterangan, kelas_last };
}

async function ensureClassMembership(DB, class_id, student_id) {
  await DB.prepare(`
    INSERT OR IGNORE INTO class_students (class_id, student_id, active)
    VALUES (?,?,1)
  `).bind(class_id, student_id).run();

  // jika sebelumnya nonaktif, aktifkan lagi
  await DB.prepare(`
    UPDATE class_students SET active = 1
    WHERE class_id = ? AND student_id = ?
  `).bind(class_id, student_id).run();
}
