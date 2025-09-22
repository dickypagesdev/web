import { ok, bad, parseJSON, saveSnapshot, upsertRosterFromRows } from "../_lib/db.js";

export async function onRequestPost({ request, env }){
  const body = await parseJSON(request);
  const { tanggal, kelas, data } = body || {};
  if (!tanggal || !kelas || !Array.isArray(data)) return bad({ success:false, error:"tanggal, kelas, data[] wajib" });

  const saved = await saveSnapshot(env, kelas, tanggal, data);
  await upsertRosterFromRows(env, kelas, data);
  return ok({ success:true, saved });
}
