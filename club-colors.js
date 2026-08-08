// Approximate primary shirt colors for Premier League clubs, used as a
// visual accent (not official branding). Falls back to Betlink green for
// any team not listed here — new clubs, cup competitions, etc.
export const CLUB_COLORS = {
  "Arsenal FC": "#EF0107",
  "Aston Villa FC": "#670E36",
  "AFC Bournemouth": "#DA291C",
  "Brentford FC": "#E30613",
  "Brighton & Hove Albion FC": "#0057B8",
  "Chelsea FC": "#034694",
  "Crystal Palace FC": "#1B458F",
  "Everton FC": "#003399",
  "Fulham FC": "#000000",
  "Ipswich Town FC": "#0044A9",
  "Leeds United FC": "#FFCD00",
  "Leicester City FC": "#003090",
  "Liverpool FC": "#C8102E",
  "Manchester City FC": "#6CABDD",
  "Manchester United FC": "#DA291C",
  "Newcastle United FC": "#241F20",
  "Nottingham Forest FC": "#DD0000",
  "Southampton FC": "#D71920",
  "Sunderland AFC": "#EB172F",
  "Tottenham Hotspur FC": "#132257",
  "West Ham United FC": "#7A263A",
  "Wolverhampton Wanderers FC": "#FDB913",
  "Hull City AFC": "#F18A00",
  "Burnley FC": "#6C1D45",
  "Sheffield United FC": "#EE2737"
};

export function clubColor(teamName) {
  return CLUB_COLORS[teamName] || "#00A651"; // Betlink green fallback
}
