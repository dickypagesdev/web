// functions/api/dev_import_from_github.js
// DEV-ONLY: hapus file ini setelah import selesai.
// Param:
//   ?kelas=kelas_012526           (import roster + relasi kelas)
//   &all_absensi=1                (scan folder absensi/ dan import semua tanggal untuk kelas itu)
//   &tanggal=YYYY-MM-DD           (opsional: import 1 hari saja untuk kelas tsb)
//   &import_ayat=1                (sekali: getAyat.json -> ayat_json)
//   &import_pagesmap=1            (sekali: getPagesMap.json -> pages_map_json)
//   &import_users=1               (sekali: user.json -> app_users)

const GH = { owner: "dickypagesdev", repo: "server", branch: "main" };

const gh = (path) =>
  `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(GH.branch)}`;

async function ghReadJson(path, token) {
  const r = await fetch(gh(path), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "cf-importer" },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} ${path}`);
  const j = await r.json();
  const raw = atob(j.content || "");
  try { return JSON.parse(raw); } catch { throw new Error(`Invalid JSON: ${path}`); }
}

async function ghListDir(path, token) {
  const r = await fetch(gh(path), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "cf-importer" },
  });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`GitHub ${r.status} list ${path}`);
  const arr = await r.json();
  return Array.isArray(arr) ? arr : [];
}

export async function onRequest({ request, env }) {
  if (!env.GITHUB_TOKEN) return Response.json({ error: "Set GITHUB_TOKEN dulu." }, { status: 500 });

  const url = new URL(request.url);
  const kelas = (url.searchParams.get("kelas") || "").trim();
  const tanggal = (url.searchParams.get("tanggal") || "").trim();
  const doAllAbsensi = url.searchParams.get("all_absensi") === "1";
  const doAyat = url.searchParams.get("import_ayat") === "1";
  const doPages = url.searchParams.get("import_pagesmap") === "1";
  const doUsers = url.searchParams.get("import_users") === "1";

  const DB = env.DB;
  const out = { ok: true, steps: [] };

  // 1) Import users (sekali)
  if (doUsers) {
    const users = await ghReadJson("user.json", env.GITHUB_TOKEN);
    if (Array.isArray(users)) {
      for (const u of users) {
        const uname = String(u?.username || "").trim();
        const pass  = String(u?.password || "").trim();
        if (!uname || !pass) continue;
        await DB.prepare("INSERT OR IGNORE INTO app_users(username,password) VALUES(?,?)").bind(uname, pass).run();
        const userRow = await DB.prepare("SELECT id FROM app_users WHERE username=?").bind(uname).first();
        if (userRow?.id) {
          // kelas
          for (const k of Array.isArray(u.kelas) ? u.kelas : []) {
            await DB.prepare("INSERT OR IGNORE INTO user_classes(user_id,kelas) VALUES(?,?)")
              .bind(userRow.id, String(k)).run();
          }
          // opsional: nis (kalau ada properti 'nis' array)
          for (const n of Array.isArray(u.nis) ? u.nis : []) {
            await DB.prepare("INSERT OR IGNORE INTO user_nis(user_id,nis) VALUES(?,?)")
              .bind(userRow.id, String(n)).run();
          }
        }
      }
      out.steps.push({ users: users.length });
    }
  }

  // 2) Import getAyat & getPagesMap (sekali)
  if (doAyat) {
    const j = await ghReadJson("getAyat.json", env.GITHUB_TOKEN);
    await DB.prepare("INSERT OR REPLACE INTO ayat_json(k,v) VALUES('surah_list',?)")
      .bind(JSON.stringify(j || [])).run();
    out.steps.push({ import_ayat: true, count: Array.isArray(j) ? j.length : 0 });
  }
  if (doPages) {
    const j = await ghReadJson("getPagesMap.json", env.GITHUB_TOKEN);
    await DB.prepare("INSERT OR REPLACE INTO pages_map_json(k,v) VALUES('pages_map',?)")
      .bind(JSON.stringify(j || {})).run();
    out.steps.push({ import_pagesmap: true });
  }

  // 3) Import roster kelas + relasi
  if (kelas) {
    const roster = await ghReadJson(`${kelas}.json`, env.GITHUB_TOKEN);
    if (!Array.isArray(roster)) return Response.json({ error: `${kelas}.json tidak valid` }, { status: 400 });
    await DB.prepare("INSERT OR IGNORE INTO classes(name) VALUES (?)").bind(kelas).run();
    const classId = (await DB.prepare("SELECT id FROM classes WHERE name=?").bind(kelas).first())?.id;

    let inserted = 0;
    for (const s of roster) {
      const nis  = s?.nis ? String(s.nis).trim() : null;
      const nama = String(s?.nama || "").trim();
      if (!nama) continue;

      // upsert student by NIS if available
      let sid = null;
      if (nis) {
        const found = await DB.prepare("SELECT id FROM students WHERE nis=?").bind(nis).first();
        if (found?.id) {
          sid = found.id;
          await DB.prepare(
            "UPDATE students SET nama=?, semester=?, jenjang=?, keterangan=?, kelas_last=? WHERE id=?"
          ).bind(nama, String(s?.semester ?? '1'), String(s?.jenjang ?? ''), String(s?.keterangan ?? ''), kelas, sid).run();
        } else {
          const ins = await DB.prepare(
            "INSERT INTO students(nis,nama,semester,jenjang,keterangan,kelas_last) VALUES(?,?,?,?,?,?)"
          ).bind(nis, nama, String(s?.semester ?? '1'), String(s?.jenjang ?? ''), String(s?.keterangan ?? ''), kelas).run();
          sid = ins.meta.last_row_id;
        }
      } else {
        const ins = await DB.prepare(
          "INSERT INTO students(nis,nama,semester,jenjang,keterangan,kelas_last) VALUES(NULL,?,?,?,?,?)"
        ).bind(nama, String(s?.semester ?? '1'), String(s?.jenjang ?? ''), String(s?.keterangan ?? ''), kelas).run();
        sid = ins.meta.last_row_id;
      }

      if (classId && sid) {
        await DB.prepare("INSERT OR IGNORE INTO class_students(class_id,student_id) VALUES(?,?)")
          .bind(classId, sid).run();
      }
      inserted++;
    }
    out.steps.push({ kelas, roster_inserted: inserted });

    // 4) Import absensi
    const importOneDay = async (tgl) => {
      const arr = await ghReadJson(`absensi/${kelas}_${tgl}.json`, env.GITHUB_TOKEN);
      if (!Array.isArray(arr)) return 0;
      let cnt = 0;
      for (const o of arr) {
        // temukan student_id
        let sid = null;
        const nis = o?.nis ? String(o.nis).trim() : null;
        if (nis) sid = (await DB.prepare("SELECT id FROM students WHERE nis=?").bind(nis).first())?.id || null;
        if (!sid && o?.id) {
          // fallback by id numeric
          const byId = await DB.prepare("SELECT id FROM students WHERE id=?").bind(Number(o.id)).first();
          sid = byId?.id || null;
        }
        if (!sid) continue;

        await DB.prepare(`
          INSERT INTO mutabaah_records(student_id,tanggal,kelas,data_json,updated_at)
          VALUES(?,?,?,?,datetime('now'))
          ON CONFLICT(student_id,tanggal) DO UPDATE SET
            data_json=excluded.data_json,
            kelas=excluded.kelas,
            updated_at=datetime('now')
        `).bind(sid, tgl, kelas, JSON.stringify(o)).run();
        cnt++;
      }
      return cnt;
    };

    if (tanggal) {
      const n = await importOneDay(tanggal);
      out.steps.push({ absensi_tanggal: tanggal, inserted: n });
    }

    if (doAllAbsensi) {
      const listing = await ghListDir("absensi", env.GITHUB_TOKEN);
      const files = listing
        .map(x => x?.name || "")
        .filter(n => n.startsWith(`${kelas}_`) && n.endsWith(".json"));
      let total = 0;
      for (const fname of files) {
        const tgl = fname.replace(`${kelas}_`, "").replace(".json", "");
        total += await importOneDay(tgl);
      }
      out.steps.push({ absensi_all_for: kelas, inserted: total, files: files.length });
    }
  }

  return Response.json(out);
}
