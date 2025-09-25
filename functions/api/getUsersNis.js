// /functions/api/getUsersNis.js
// GET /api/getUsersNis → { usedNis:[], count }
import { getJsonSmart } from "../_lib/ghjson.js";

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

export async function onRequestGet({ env }) {
  const TOKEN = env.GITHUB_TOKEN;
  if (!TOKEN) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  const r = await getJsonSmart("user.json", TOKEN);
  if (!r.ok) return json({ source:"github", step:"get-users", status: r.status, error: r.error }, 502);

  const users = Array.isArray(r.data) ? r.data : [];
  const seen = new Set();
  const usedNis = [];
  for (const u of users) {
    const arr = Array.isArray(u?.nis) ? u.nis : (u?.nis ? [u.nis] : []);
    for (const n of arr) {
      const disp = String(n ?? "").trim();
      const key  = disp.toLowerCase();
      if (!disp || seen.has(key)) continue;
      seen.add(key);
      usedNis.push(disp);
    }
  }
  return json({ usedNis, count: usedNis.length }, 200);
}

export async function onRequest(ctx) {
  if (!["GET", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ message: "Method Not Allowed" }, 405);
  }
}
