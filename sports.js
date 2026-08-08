import { FOOTBALL_DATA_TOKEN, COMPETITION_CODE } from "./sports-config.js";

const BASE = "https://api.football-data.org/v4";
// football-data.org doesn't send CORS headers for direct browser requests,
// so we route through a free CORS proxy. Fine for testing; swap for a real
// backend/serverless proxy before a public launch (public proxies can be
// slow or go down).
const PROXY = "https://corsproxy.io/?url=";

// Returns an array of scheduled matches in the next `days` days.
export async function fetchUpcomingFixtures(days = 21) {
  if (!FOOTBALL_DATA_TOKEN || FOOTBALL_DATA_TOKEN.startsWith("YOUR_")) {
    throw new Error("no-api-key");
  }
  const dateFrom = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  const targetUrl = `${BASE}/competitions/${COMPETITION_CODE}/matches?status=SCHEDULED&dateFrom=${dateFrom}&dateTo=${to}`;

  const res = await fetch(PROXY + encodeURIComponent(targetUrl), {
    headers: { "X-Auth-Token": FOOTBALL_DATA_TOKEN }
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (_) {}
    throw new Error(`fixtures-fetch-failed-${res.status}${detail ? ": " + detail : ""}`);
  }
  const data = await res.json();
  return (data.matches || []).map(m => ({
    id: m.id,
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    kickoff: m.utcDate
  }));
}
