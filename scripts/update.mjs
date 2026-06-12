// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator: fetch results → map to owned teams → score → write standings.json
// Run by GitHub Actions on a schedule, or locally with:  npm run update
//
// Env:
//   SOURCE=football-data | file        (default: football-data)
//   FOOTBALL_DATA_TOKEN=<your key>     (required for football-data)
//   FIXTURE_FILE=data/sample-matches.json   (used when SOURCE=file)
// ─────────────────────────────────────────────────────────────────────────────
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreTeam, STAGE_LABEL } from "./scoring.mjs";
import { fetchFootballData, fetchFromFile } from "./sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

async function loadJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

// Build a lookup from any team name/alias (lowercased, simplified) → teamId.
function buildNameIndex(teams) {
  const index = new Map();
  const norm = (s) =>
    String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  for (const [id, t] of Object.entries(teams)) {
    index.set(norm(t.name), id);
    index.set(norm(id), id);
    for (const a of t.aliases || []) index.set(norm(a), id);
  }
  return { index, norm };
}

async function getMatches() {
  const source = process.env.SOURCE || "football-data";
  if (source === "file") {
    const file = process.env.FIXTURE_FILE || join(DATA, "sample-matches.json");
    console.log(`[update] source=file (${file})`);
    return fetchFromFile({ readFile }, file);
  }
  console.log("[update] source=football-data.org");
  return fetchFootballData(process.env.FOOTBALL_DATA_TOKEN);
}

async function main() {
  const { teams } = await loadJson(join(DATA, "teams.json"));
  const rosters = await loadJson(join(DATA, "rosters.json"));
  const { index, norm } = buildNameIndex(teams);

  const matches = await getMatches();
  console.log(`[update] fetched ${matches.length} matches`);

  // Group normalized matches by teamId (only teams we care about).
  const perTeam = new Map(); // teamId -> [teamMatch]
  const unmatched = new Set();

  for (const m of matches) {
    for (const side of ["home", "away"]) {
      const name = m[side];
      if (!name) continue;
      const id = index.get(norm(name));
      if (!id) { unmatched.add(name); continue; }

      const isHome = side === "home";
      const gf = isHome ? m.homeGoals : m.awayGoals;
      const ga = isHome ? m.awayGoals : m.homeGoals;
      let result = null;
      if (m.status === "FINISHED" && m.winner) {
        if (m.winner === "DRAW") result = "D";
        else result = (m.winner === "HOME") === isHome ? "W" : "L";
      }
      const opponentName = isHome ? m.away : m.home;
      const oppId = index.get(norm(opponentName || ""));
      if (!perTeam.has(id)) perTeam.set(id, []);
      perTeam.get(id).push({
        stage: m.stage,
        status: m.status,
        result,
        scoreFor: gf,
        scoreAgainst: ga,
        opponent: oppId ? teams[oppId].name : opponentName,
        opponentIso: oppId ? teams[oppId].iso : null,
        label: STAGE_LABEL[m.stage],
        utcDate: m.utcDate,
      });
    }
  }

  if (unmatched.size) {
    console.warn(
      `[update] ${unmatched.size} team name(s) from the feed didn't match teams.json ` +
      `(fine if they're not in anyone's roster; otherwise add an alias):\n  - ` +
      [...unmatched].sort().join("\n  - ")
    );
  }

  // Score every player.
  const players = rosters.players.map((p) => {
    const teamRows = p.teams.map((teamId) => {
      const t = teams[teamId];
      if (!t) throw new Error(`Roster references unknown teamId "${teamId}" (player ${p.id})`);
      const teamMatches = (perTeam.get(teamId) || []).sort(
        (a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0)
      );
      const score = scoreTeam(teamMatches);
      return {
        teamId,
        name: t.name,
        iso: t.iso,
        ...score,
        matches: teamMatches,
      };
    });
    const total = teamRows.reduce((s, t) => s + t.total, 0);
    const matchPoints = teamRows.reduce((s, t) => s + t.matchPoints, 0);
    const stageBonus = teamRows.reduce((s, t) => s + t.stageBonus, 0);
    return { id: p.id, name: p.name, total, matchPoints, stageBonus, teams: teamRows };
  });

  // Rank: total desc, then match points desc, then name. Ties share a rank.
  players.sort((a, b) =>
    b.total - a.total || b.matchPoints - a.matchPoints || a.name.localeCompare(b.name)
  );
  let lastTotal = null, lastRank = 0;
  players.forEach((p, i) => {
    if (p.total !== lastTotal) { lastRank = i + 1; lastTotal = p.total; }
    p.rank = lastRank;
  });

  const standings = {
    generatedAt: new Date().toISOString(),
    source: process.env.SOURCE || "football-data",
    tournament: "FIFA World Cup 2026",
    matchesSeen: matches.length,
    finishedMatches: matches.filter((m) => m.status === "FINISHED").length,
    liveMatches: matches.filter((m) => m.status === "LIVE").length,
    unmatchedFeedTeams: [...unmatched].sort(),
    players,
  };

  await writeFile(join(DATA, "standings.json"), JSON.stringify(standings, null, 2) + "\n");
  console.log(
    `[update] wrote standings.json — leader: ${players[0]?.name} (${players[0]?.total} pts), ` +
    `${standings.finishedMatches} finished / ${standings.liveMatches} live`
  );
}

main().catch((err) => {
  console.error("[update] FAILED:", err.message);
  process.exit(1);
});
