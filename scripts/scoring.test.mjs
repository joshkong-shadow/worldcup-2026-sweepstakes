// Minimal scoring tests — run with: npm test
import assert from "node:assert";
import { scoreTeam, classifyTeam, matchPointsFor, normalizeStage } from "./scoring.mjs";

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

const m = (stage, result, status = "FINISHED") => ({ stage, result, status });

test("stage normalization handles variants", () => {
  assert.equal(normalizeStage("ROUND_OF_32"), "LAST_32");
  assert.equal(normalizeStage("Quarter-finals"), "QUARTER_FINALS");
  assert.equal(normalizeStage("FINAL"), "FINAL");
  assert.equal(normalizeStage(undefined), "GROUP_STAGE");
});

test("match points: W=3, D=1, L=0", () => {
  const r = matchPointsFor([m("GROUP_STAGE", "W"), m("GROUP_STAGE", "D"), m("GROUP_STAGE", "L")]);
  assert.equal(r.points, 4);
  assert.deepEqual([r.w, r.d, r.l], [1, 1, 1]);
});

test("scheduled matches don't earn points", () => {
  const r = matchPointsFor([m("GROUP_STAGE", null, "SCHEDULED")]);
  assert.equal(r.points, 0);
});

test("group exit = 0 bonus", () => {
  assert.equal(classifyTeam([m("GROUP_STAGE", "W")]).bonus, 0);
});

test("reaching Round of 16 = 10 bonus", () => {
  assert.equal(classifyTeam([m("GROUP_STAGE", "W"), m("LAST_32", "W"), m("LAST_16", "L")]).bonus, 10);
});

test("champion = 80, runner-up = 65", () => {
  assert.equal(classifyTeam([m("FINAL", "W")]).bonus, 80);
  assert.equal(classifyTeam([m("FINAL", "L")]).bonus, 65);
});

test("3rd place playoff win = 55, loss = 45", () => {
  assert.equal(classifyTeam([m("SEMI_FINALS", "L"), m("THIRD_PLACE", "W")]).bonus, 55);
  assert.equal(classifyTeam([m("SEMI_FINALS", "L"), m("THIRD_PLACE", "L")]).bonus, 45);
});

test("full champion run totals match points + 80", () => {
  // 7 wins (group x3 + 4 KO) = 21 match pts, + champion 80 = 101
  const matches = [
    m("GROUP_STAGE", "W"), m("GROUP_STAGE", "W"), m("GROUP_STAGE", "W"),
    m("LAST_32", "W"), m("LAST_16", "W"), m("QUARTER_FINALS", "W"),
    m("SEMI_FINALS", "W"), m("FINAL", "W"),
  ];
  const s = scoreTeam(matches);
  assert.equal(s.matchPoints, 24);     // 8 wins
  assert.equal(s.stageBonus, 80);
  assert.equal(s.total, 104);
});

console.log(`\n${passed} tests passed.`);
