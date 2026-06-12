// ─────────────────────────────────────────────────────────────────────────────
// Results-feed adapters. Each returns a normalized array of matches:
//   { stage, status: "FINISHED"|"LIVE"|"SCHEDULED", home, away,
//     homeGoals, awayGoals, winner: "HOME"|"AWAY"|"DRAW"|null, utcDate }
// `winner` already accounts for penalty shootouts (the advancing side).
// ─────────────────────────────────────────────────────────────────────────────
import { normalizeStage } from "./scoring.mjs";

function statusOf(s) {
  const v = String(s || "").toUpperCase();
  if (["FINISHED", "AWARDED"].includes(v)) return "FINISHED";
  if (["IN_PLAY", "PAUSED", "LIVE", "SUSPENDED"].includes(v)) return "LIVE";
  return "SCHEDULED";
}

// ── football-data.org (recommended; needs a free API key in FOOTBALL_DATA_TOKEN)
// Docs: https://www.football-data.org/documentation/quickstart  Competition code: WC
export async function fetchFootballData(token) {
  if (!token) throw new Error("FOOTBALL_DATA_TOKEN is not set");
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) throw new Error(`football-data.org responded ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const matches = json.matches || [];
  return matches.map((m) => {
    const status = statusOf(m.status);
    const stage = normalizeStage(m.stage);
    const ft = m.score?.fullTime || {};
    const pens = m.score?.penalties || {};
    let homeGoals = ft.home, awayGoals = ft.away;

    // Winner: trust the feed, but resolve shootouts explicitly (advancer = winner).
    let winner = null;
    const raw = m.score?.winner;
    if (raw === "HOME_TEAM") winner = "HOME";
    else if (raw === "AWAY_TEAM") winner = "AWAY";
    else if (raw === "DRAW") winner = "DRAW";

    const knockout = stage !== "GROUP_STAGE";
    if (status === "FINISHED" && knockout && (winner === "DRAW" || winner === null)) {
      if (pens.home != null && pens.away != null && pens.home !== pens.away) {
        winner = pens.home > pens.away ? "HOME" : "AWAY";
      }
    }
    return {
      stage,
      group: m.group || null,
      status,
      home: m.homeTeam?.name ?? m.homeTeam?.shortName ?? null,
      away: m.awayTeam?.name ?? m.awayTeam?.shortName ?? null,
      homeGoals,
      awayGoals,
      winner,
      utcDate: m.utcDate || null,
    };
  });
}

// ── football-data.org group standings (for the group tables on the schedule page).
// Returns [{ group: "Group A", table: [{ name, tla, crest, played, won, draw, lost, gf, ga, gd, points, position }] }]
export async function fetchFootballDataStandings(token) {
  if (!token) throw new Error("FOOTBALL_DATA_TOKEN is not set");
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/standings", {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) throw new Error(`football-data.org standings ${res.status}`);
  const json = await res.json();
  return (json.standings || [])
    .filter((s) => s.type === "TOTAL")
    .map((s) => ({
      group: s.group ? s.group.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Group",
      table: (s.table || []).map((r) => ({
        name: r.team?.name, tla: r.team?.tla, crest: r.team?.crest,
        played: r.playedGames, won: r.won, draw: r.draw, lost: r.lost,
        gf: r.goalsFor, ga: r.goalsAgainst, gd: r.goalDifference, points: r.points,
        position: r.position,
      })),
    }));
}

// ── Local JSON file adapter (for testing / offline seed / manual override).
// Expects { matches: [ { stage, status, home, away, homeGoals, awayGoals, winner } ] }
export async function fetchFromFile(fs, path) {
  const json = JSON.parse(await fs.readFile(path, "utf8"));
  return (json.matches || []).map((m) => ({
    stage: normalizeStage(m.stage),
    group: m.group ?? null,
    status: statusOf(m.status),
    home: m.home,
    away: m.away,
    homeGoals: m.homeGoals ?? null,
    awayGoals: m.awayGoals ?? null,
    winner: m.winner ?? null,
    utcDate: m.utcDate ?? null,
  }));
}
