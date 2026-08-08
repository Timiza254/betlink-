// ============================================================
// SPORTS DATA CONFIG
// Get a free API key: https://www.football-data.org/client/register
// Free tier covers the Premier League (competition code "PL") and
// a handful of other top leagues, 10 requests/minute.
//
// Heads up: this key lives in a public file since GitHub Pages is
// static hosting — anyone could view it in your page source. That's
// low-risk for a free-tier key (worst case: someone burns your rate
// limit), but don't reuse a paid-tier key here later.
// ============================================================
export const FOOTBALL_DATA_TOKEN = "c70203c46fdc4fa1ae5f2eeb29a6e413";

// Which competition to pull fixtures from. PL = English Premier League.
// Other free-tier codes: CL (Champions League), ELC (Championship).
export const COMPETITION_CODE = "PL";
