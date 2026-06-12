// Builds the data for the Schedule page: group tables + knockout bracket.
// Kept separate from scoring so each stays simple.
import { STAGE_LABEL, STAGE_ORDER } from "./scoring.mjs";

const KO_STAGES = STAGE_ORDER.filter((s) => s !== "GROUP_STAGE"); // LAST_32 … FINAL

// `resolve(name)` → { id, name, iso } | null  ;  `ownerOf(id)` → player name | null
export function buildTournament(matches, standingsGroups, resolve, ownerOf) {
  const teamCell = (rawName) => {
    if (!rawName) return null;
    const t = resolve(rawName);
    if (!t) return { name: rawName, iso: null, owner: null };
    return { id: t.id, name: t.name, iso: t.iso, owner: ownerOf(t.id) };
  };

  // ── Knockout bracket ──────────────────────────────────────────────────────
  const bracket = {};
  for (const stage of KO_STAGES) {
    const rows = matches
      .filter((m) => m.stage === stage)
      .sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0))
      .map((m) => {
        const home = teamCell(m.home), away = teamCell(m.away);
        let homeRes = null, awayRes = null;
        if (m.status === "FINISHED" && m.winner) {
          if (m.winner === "DRAW") homeRes = awayRes = "D";
          else { homeRes = m.winner === "HOME" ? "W" : "L"; awayRes = m.winner === "HOME" ? "L" : "W"; }
        }
        return {
          stage, label: STAGE_LABEL[stage], status: m.status, utcDate: m.utcDate,
          home, away, homeGoals: m.homeGoals, awayGoals: m.awayGoals,
          homeRes, awayRes, winnerSide: m.winner,
        };
      });
    if (rows.length) bracket[stage] = rows;
  }

  // ── Group tables ──────────────────────────────────────────────────────────
  let groups;
  if (standingsGroups && standingsGroups.length) {
    groups = standingsGroups.map((g) => ({
      group: g.group,
      table: g.table.map((r) => {
        const cell = teamCell(r.name);
        return { ...r, iso: cell?.iso || null, owner: cell?.owner || null, name: cell?.name || r.name };
      }),
    }));
  } else {
    groups = computeGroupsFromMatches(matches, teamCell);
  }

  return { groups, bracket };
}

// Fallback: tally group tables straight from finished GROUP_STAGE matches.
function computeGroupsFromMatches(matches, teamCell) {
  const byGroup = new Map();
  const ensure = (g, name) => {
    if (!byGroup.has(g)) byGroup.set(g, new Map());
    const tbl = byGroup.get(g);
    if (!tbl.has(name)) tbl.set(name, { name, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 });
    return tbl.get(name);
  };
  for (const m of matches) {
    if (m.stage !== "GROUP_STAGE" || !m.group) continue;
    if (m.status !== "FINISHED") { ensure(m.group, m.home); ensure(m.group, m.away); continue; }
    const h = ensure(m.group, m.home), a = ensure(m.group, m.away);
    h.played++; a.played++;
    h.gf += m.homeGoals; h.ga += m.awayGoals; a.gf += m.awayGoals; a.ga += m.homeGoals;
    if (m.winner === "HOME") { h.won++; a.lost++; h.points += 3; }
    else if (m.winner === "AWAY") { a.won++; h.lost++; a.points += 3; }
    else { h.draw++; a.draw++; h.points++; a.points++; }
  }
  const fmtGroup = (g) => g.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([g, tbl]) => ({
      group: fmtGroup(g),
      table: [...tbl.values()]
        .map((r) => { r.gd = r.gf - r.ga; const c = teamCell(r.name); return { ...r, iso: c?.iso || null, owner: c?.owner || null, name: c?.name || r.name }; })
        .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name))
        .map((r, i) => ({ ...r, position: i + 1 })),
    }));
}
