import { ok, bad, selectAttendance } from "../_lib/db.js";

export async function onRequestGet({ request, env }){
  const u = new URL(request.url);
  const kelas = u.searchParams.get("kelas");
  const tanggal = u.searchParams.get("tanggal");
  if (!kelas || !tanggal) return ok([]);

  const data = await selectAttendance(env, kelas, tanggal);
  // (opsional) urutkan
  data.sort((a,b)=>{
    const na = parseInt(a?.nis,10), nb = parseInt(b?.nis,10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a?.nama||"").localeCompare(String(b?.nama||""));
  });
  return ok(data);
}
