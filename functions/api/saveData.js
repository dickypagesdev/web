export const onRequestPost = async ({ request, env }) => {
  try {
    // 0) Sanity check binding
    if (!env.DB || !env.DB.prepare) {
      return jerr("D1 binding 'DB' tidak tersedia. Tambahkan D1 binding Name=DB di Pages → Settings → Functions.", 500, { step: "binding" });
    }

    const body = await safeJson(request);
    if (!body.ok) return jerr("Body bukan JSON valid.", 400, { step: "parse" });

    const { tanggal, kelas, data } = body.val;
    if (!tanggal || !kelas || !Array.isArray(data)) {
      return jerr("tanggal, kelas, dan data[] wajib.", 400, { step: "validate", tanggal, kelas, hasData: Array.isArray(data) });
    }

    // 1) Pastikan kelas
    const cls = await ensureClass(env.DB, kelas);
    const classId = cls.id;

    // 2) Loop siswa
    let cntStudents = 0, cntAttendance = 0, cntRecitations = 0;
    const attendanceOps = [];
    const recitationOps = [];

    for (const [i, row] of data.entries()) {
      // student
      const student = await ensureStudent(env.DB, {
        nis: normStr(row.nis),
        nama: normStr(row.nama) || "(Tanpa Nama)",
        semester: strOr(row.semester, "1"),
        jenjang: strOr(row.jenjang, ""),
        keterangan: strOr(row.keterangan, ""),
        kelas_last: kelas
      }).catch(e => { throw tagged(e, "ensureStudent", { index: i, nis: row.nis, nama: row.nama }); });
      cntStudents++;

      await ensureClassMembership(env.DB, classId, student.id).catch(e => { throw tagged(e, "ensureClassMembership", { student_id: student.id }); });

      // attendance
      const expanded = Array.isArray(row.absensiExpanded) ? row.absensiExpanded : (typeof row.absensi === "string" ? row.absensi.split(",").map(s=>s.trim()) : []);
      const parsedSessions = parseAbsensiExpanded(expanded);
      for (const s of parsedSessions) {
        attendanceOps.push(
          env.DB.prepare(`
            INSERT INTO attendance (student_id,class_id,tanggal,sesi,status,note)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(student_id,class_id,tanggal,sesi) DO UPDATE SET status=excluded.status, note=excluded.note
          `).bind(student.id, classId, tanggal, String(s.seq), s.status, "")
        );
      }
      cntAttendance += parsedSessions.length;

      // recitations (murajaah)
      const mur = Array.isArray(row.murSessions) ? row.murSessions : [];
      for (const [j, sess] of mur.entries()) {
        recitationOps.push(
          env.DB.prepare(`
            INSERT INTO recitations
              (student_id,class_id,tanggal,tipe,juz_from,juz_to,page_from,page_to,surah_from,ayat_from,surah_to,ayat_to,persen,note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(
            student.id, classId, tanggal, "murajaah",
            toIntOrNull(sess.jFrom), toIntOrNull(sess.jTo),
            pageFrom(sess.pages), pageTo(sess.pages),
            surahFrom(sess.from), ayatFrom(sess.from),
            surahTo(sess.to), ayatTo(sess.to),
            toReal(sess.score), buildPredikatNote(sess.predikatText, sess.predikatHuruf)
          )
        );
      }
      cntRecitations += mur.length;
    }

    // 3) Eksekusi batch — masing2 dilapisi try agar error ketahuan
    try { if (attendanceOps.length) await env.DB.batch(attendanceOps); }
    catch (e) { throw tagged(e, "batchAttendance", { ops: attendanceOps.length }); }

    try { if (recitationOps.length) await env.DB.batch(recitationOps); }
    catch (e) { throw tagged(e, "batchRecitations", { ops: recitationOps.length }); }

    // 4) Snapshot
    try {
      await env.DB.prepare(`
        INSERT INTO daily_snapshots(class_id,tanggal,payload)
        VALUES (?,?,?)
        ON CONFLICT(class_id, tanggal) DO UPDATE SET payload = excluded.payload
      `).bind(classId, tanggal, JSON.stringify(data)).run();
    } catch (e) { throw tagged(e, "snapshotUpsert", { classId, tanggal, dataLen: data.length }); }

    return json({ success: true, kelas, tanggal, counts: { students: cntStudents, attendance: cntAttendance, recitations: cntRecitations } });

  } catch (e) {
    // kirim pesan lengkap ke client supaya kamu tahu step mana yang gagal
    return jerr(e.message || "Server error", 500, e.meta || {});
  }
};

/* ===== Helpers (sama seperti sebelumnya, ditambah util debug) ===== */
const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers: { "content-type":"application/json","access-control-allow-origin":"*" } });
const jerr = (msg, status=500, meta={}) => json({ success:false, error: msg, meta }, status);
const tagged = (e, step, meta={}) => { e.meta = { step, ...meta }; return e; };

async function safeJson(request){
  try { return { ok:true, val: await request.json() }; }
  catch { return { ok:false }; }
}
function normStr(v){ return v==null ? "" : String(v).trim(); }
function strOr(v, d=""){ const s=normStr(v); return s?s:d; }
function toIntOrNull(v){ const n=parseInt(v,10); return Number.isFinite(n)?n:null; }
function toReal(v, d=0){ if(v==null||v==="") return d; const n=parseFloat(String(v).replace(",", ".")); return Number.isFinite(n)?n:d; }
function parseAbsensiExpanded(arr){ const out=[]; for(const item of arr){ const s=normStr(item); if(!s) continue; const m=s.match(/([A-Za-z]+)\s*[-_ ]?\s*(\d+)/); if(!m) continue; out.push({ status:m[1].toLowerCase(), seq:parseInt(m[2],10)}); } return out; }
function splitRef(ref){ const s=normStr(ref); if(!s) return ["",null]; const [surah, ayat]=s.split(":"); const ay=parseInt(ayat,10); return [surah||"", Number.isFinite(ay)?ay:null]; }
function surahFrom(ref){ return splitRef(ref)[0] || null; }
function ayatFrom(ref){ return splitRef(ref)[1]; }
function surahTo(ref){ return splitRef(ref)[0] || null; }
function ayatTo(ref){ return splitRef(ref)[1]; }
function splitPages(p){ const s=normStr(p); if(!s) return [null,null]; const m=s.match(/(-?\d+)\s*[-–]\s*(-?\d+)/); return m?[parseInt(m[1],10), parseInt(m[2],10)]:[null,null]; }
function pageFrom(p){ return splitPages(p)[0]; }
function pageTo(p){ return splitPages(p)[1]; }
function buildPredikatNote(text, huruf){ const t=normStr(text), h=normStr(huruf); if(!t&&!h) return ""; if(t&&h) return `${t} (${h})`; return t||h; }

async function ensureClass(DB, name){
  const got = await DB.prepare(`SELECT id FROM classes WHERE name = ?`).bind(name).first();
  if (got) return got;
  const ins = await DB.prepare(`INSERT INTO classes(name) VALUES (?)`).bind(name).run();
  return { id: ins.lastRowId };
}
async function ensureStudent(DB, { nis, nama, semester, jenjang, keterangan, kelas_last }){
  let st=null;
  if (nis) st = await DB.prepare(`SELECT * FROM students WHERE nis = ?`).bind(nis).first();
  if (!st && nama) st = await DB.prepare(`SELECT * FROM students WHERE nama = ?`).bind(nama).first();
  if (st){
    await DB.prepare(`
      UPDATE students SET nama=COALESCE(?,nama), semester=COALESCE(?,semester), jenjang=COALESCE(?,jenjang),
        keterangan=COALESCE(?,keterangan), kelas_last=COALESCE(?,kelas_last) WHERE id=?
    `).bind(nama||st.nama, semester||st.semester, jenjang||st.jenjang, keterangan||st.keterangan, kelas_last||st.kelas_last, st.id).run();
    return st;
  }
  const ins = await DB.prepare(`
    INSERT INTO students(nis,nama,semester,jenjang,keterangan,kelas_last) VALUES (?,?,?,?,?,?)
  `).bind(nis||null, nama, semester, jenjang, keterangan, kelas_last).run();
  return { id: ins.lastRowId, nis, nama, semester, jenjang, keterangan, kelas_last };
}
async function ensureClassMembership(DB, class_id, student_id){
  await DB.prepare(`INSERT OR IGNORE INTO class_students(class_id,student_id,active) VALUES (?,?,1)`).bind(class_id, student_id).run();
  await DB.prepare(`UPDATE class_students SET active=1 WHERE class_id=? AND student_id=?`).bind(class_id, student_id).run();
}
