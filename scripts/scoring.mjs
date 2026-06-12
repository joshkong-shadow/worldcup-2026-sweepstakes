// ─────────────────────────────────────────────────────────────────────────────
// Scoring engine for the World Cup 2026 sweepstakes.
// Pure functions, no I/O — easy to test. Used by update.mjs and seed.mjs.
//
// RULES (as agreed with the group):
//   Match points:  Win = 3, Draw = 1, Loss = 0  (applies to EVERY match, group + knockout)
//   Penalty shootout: the team that ADVANCES is scored as a Win (3); the other a Loss (0).
//   Furthest-stage bonus (one-off, best stage the team reaches):
//     Group Stage Exit = 0, Round of 32 = 5, Round of 16 = 10, Quarter-final = 20,
//     Semi-final = 35, 4th = 45, 3rd = 55, Runner-up = 65, Champion = 80
//   A player's total = sum of all their teams' (match points + stage bonus).
// ─────────────────────────────────────────────────────────────────────────────

// Knockout stages in order of depth. GROUP_STAGE is depth 0.
export const STAGE_ORDER = [
  "GROUP_STAGE",
  "LAST_32",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

// Map the many ways a feed might label a stage onto our canonical labels.
const STAGE_ALIASES = {
  GROUP_STAGE: "GROUP_STAGE",
  GROUP: "GROUP_STAGE",
  GROUPS: "GROUP_STAGE",
  LAST_32: "LAST_32",
  ROUND_OF_32: "LAST_32",
  R32: "LAST_32",
  LAST_16: "LAST_16",
  ROUND_OF_16: "LAST_16",
  R16: "LAST_16",
  QUARTER_FINALS: "QUARTER_FINALS",
  QUARTER_FINAL: "QUARTER_FINALS",
  QUARTERFINALS: "QUARTER_FINALS",
  QF: "QUARTER_FINALS",
  SEMI_FINALS: "SEMI_FINALS",
  SEMI_FINAL: "SEMI_FINALS",
  SEMIFINALS: "SEMI_FINALS",
  SF: "SEMI_FINALS",
  THIRD_PLACE: "THIRD_PLACE",
  THIRD_PLACE_FINAL: "THIRD_PLACE",
  PLAYOFF_FOR_THIRD_PLACE: "THIRD_PLACE",
  "3RD_PLACE": "THIRD_PLACE",
  FINAL: "FINAL",
};

export function normalizeStage(raw) {
  if (!raw) return "GROUP_STAGE";
  const key = String(raw).toUpperCase().replace(/[\s-]+/g, "_");
  return STAGE_ALIASES[key] || "GROUP_STAGE";
}

// Human labels for display.
export const STAGE_LABEL = {
  GROUP_STAGE: "Group Stage",
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-final",
  SEMI_FINALS: "Semi-final",
  THIRD_PLACE: "Third-place playoff",
  FINAL: "Final",
};

// Bonus for a "best result" classification.
export const STAGE_BONUS = {
  GROUP_EXIT: 0,
  LAST_32: 5,
  LAST_16: 10,
  QUARTER_FINALS: 20,
  SEMI_FINALS: 35,
  FOURTH: 45,
  THIRD: 55,
  RUNNER_UP: 65,
  CHAMPION: 80,
};

// ─────────────────────────────────────────────────────────────────────────────
// A "team match" is a normalized record from the perspective of ONE team:
//   { stage: <canonical>, status: "FINISHED"|"SCHEDULED"|"LIVE", result: "W"|"D"|"L"|null,
//     opponent, scoreFor, scoreAgainst, label, utcDate }
// ─────────────────────────────────────────────────────────────────────────────

function depth(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}

// Determine the best-result classification + bonus for a team, given all its matches.
// `groupComplete` tells us whether this team's group games are all finished (so a
// non-advancing team can be confirmed as a "Group Stage Exit").
export function classifyTeam(matches) {
  const finished = matches.filter((m) => m.status === "FINISHED");
  const reachedStages = new Set(matches.map((m) => m.stage)); // scheduled counts as "reached"

  const finalMatch = finished.find((m) => m.stage === "FINAL");
  if (finalMatch) {
    return finalMatch.result === "W"
      ? { key: "CHAMPION", label: "Champion", bonus: STAGE_BONUS.CHAMPION }
      : { key: "RUNNER_UP", label: "Runner-up", bonus: STAGE_BONUS.RUNNER_UP };
  }
  // In the final but not played yet → guaranteed at least runner-up.
  if (reachedStages.has("FINAL")) {
    return { key: "RUNNER_UP", label: "Finalist", bonus: STAGE_BONUS.RUNNER_UP };
  }

  const thirdMatch = finished.find((m) => m.stage === "THIRD_PLACE");
  if (thirdMatch) {
    return thirdMatch.result === "W"
      ? { key: "THIRD", label: "3rd Place", bonus: STAGE_BONUS.THIRD }
      : { key: "FOURTH", label: "4th Place", bonus: STAGE_BONUS.FOURTH };
  }
  if (reachedStages.has("THIRD_PLACE")) {
    return { key: "FOURTH", label: "Playing for 3rd", bonus: STAGE_BONUS.FOURTH };
  }

  // Deepest stage the team has reached (scheduled or finished).
  let deepest = "GROUP_STAGE";
  for (const s of reachedStages) if (depth(s) > depth(deepest)) deepest = s;

  switch (deepest) {
    case "SEMI_FINALS":
      return { key: "SEMI_FINALS", label: "Semi-finalist", bonus: STAGE_BONUS.SEMI_FINALS };
    case "QUARTER_FINALS":
      return { key: "QUARTER_FINALS", label: "Quarter-finalist", bonus: STAGE_BONUS.QUARTER_FINALS };
    case "LAST_16":
      return { key: "LAST_16", label: "Round of 16", bonus: STAGE_BONUS.LAST_16 };
    case "LAST_32":
      return { key: "LAST_32", label: "Round of 32", bonus: STAGE_BONUS.LAST_32 };
    default:
      return { key: "GROUP", label: "Group Stage", bonus: STAGE_BONUS.GROUP_EXIT };
  }
}

// Match points from finished matches (penalty winner already encoded as result "W").
export function matchPointsFor(matches) {
  let w = 0, d = 0, l = 0;
  for (const m of matches) {
    if (m.status !== "FINISHED" || !m.result) continue;
    if (m.result === "W") w++;
    else if (m.result === "D") d++;
    else if (m.result === "L") l++;
  }
  return { w, d, l, points: w * 3 + d * 1, played: w + d + l };
}

// Full score for one team.
export function scoreTeam(matches) {
  const record = matchPointsFor(matches);
  const classification = classifyTeam(matches);
  return {
    record,
    matchPoints: record.points,
    stage: classification,
    stageBonus: classification.bonus,
    total: record.points + classification.bonus,
  };
}
