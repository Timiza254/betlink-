import { FOOTBALL_DATA_TOKEN, COMPETITION_CODE } from "./sports-config.js";

const BASE = "https://api.football-data.org/v4";
// football-data.org doesn't send CORS headers for direct browser requests,
// so we route through a free CORS proxy. We try a few in sequence in case
// one is down or blocks the custom auth header — fine for testing; swap
// for a real backend/serverless proxy before a public launch.
const PROXIES = [
  url => "https://corsproxy.io/?url=" + encodeURIComponent(url),
  url => "https://api.cors.lol/?url=" + encodeURIComponent(url),
  url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url)
];

// Returns an array of scheduled matches in the next `days` days.
export async function fetchUpcomingFixtures(days = 21) {
  if (!FOOTBALL_DATA_TOKEN || FOOTBALL_DATA_TOKEN.startsWith("YOUR_")) {
    throw new Error("no-api-key");
  }
  const dateFrom = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const targetUrl = `${BASE}/competitions/${COMPETITION_CODE}/matches?status=SCHEDULED&dateFrom=${dateFrom}&dateTo=${to}`;

  let lastError = null;
  for (const buildProxyUrl of PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(targetUrl), {
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
    } catch (err) {
      lastError = err;
      // try the next proxy
    }
  }
  throw lastError || new Error("all-proxies-failed");
}
