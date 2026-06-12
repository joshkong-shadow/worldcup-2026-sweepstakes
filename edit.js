// Edit Teams — in-browser roster editor. Loads teams.json + rosters.json,
// lets you add/remove/trade teams (no team can be owned twice), then save by
// downloading the new rosters.json or committing it straight to GitHub.

const FLAG = (iso, w = 24) => `https://flagcdn.com/w${w}/${iso}.png`;
const EXPECTED = 4; // expected teams per player (Wei has 5 by agreement — just a soft hint)

let TEAMS = {};      // id -> {name, iso, aliases}
let roster = [];     // [{id, name, teams: [teamId]}]
let original = "";   // JSON snapshot for reset

const $ = (s) => document.querySelector(s);
const msg = (text, kind = "") => { const el = $("#save-msg"); el.textContent = text; el.className = "save-msg " + kind; };

function ownedSet() {
  return new Set(roster.flatMap((p) => p.teams));
}
function unassigned() {
  const owned = ownedSet();
  return Object.keys(TEAMS).filter((id) => !owned.has(id))
    .sort((a, b) => TEAMS[a].name.localeCompare(TEAMS[b].name));
}

function render() {
  const owned = ownedSet();
  const free = unassigned();

  // summary chips
  const totalTeams = roster.reduce((s, p) => s + p.teams.length, 0);
  const dupes = totalTeams - owned.size;
  $("#summary").innerHTML = [
    `<span class="chip-stat">Players <b>${roster.length}</b></span>`,
    `<span class="chip-stat">Teams assigned <b>${totalTeams}</b> / ${Object.keys(TEAMS).length}</span>`,
    `<span class="chip-stat ${free.length ? "warn" : ""}">Unassigned <b>${free.length}</b></span>`,
    dupes > 0 ? `<span class="chip-stat bad">Duplicates <b>${dupes}</b></span>` : "",
  ].join("");

  // player cards
  $("#players").innerHTML = roster.map((p, pi) => {
    const chips = p.teams.map((id) => {
      const t = TEAMS[id];
      if (!t) return `<div class="tchip"><span style="grid-column:1/3;color:#ff9a9a">Unknown: ${id}</span><button data-rm="${pi}:${id}">✕</button></div>`;
      return `<div class="tchip">
        <img src="${FLAG(t.iso)}" alt="" onerror="this.style.visibility='hidden'">
        <span>${t.name}</span>
        <button title="Remove" data-rm="${pi}:${id}">✕</button>
      </div>`;
    }).join("");
    const opts = ["<option value=''>+ Add a team…</option>"]
      .concat(free.map((id) => `<option value="${id}">${TEAMS[id].name}</option>`))
      .join("");
    const offCount = p.teams.length !== EXPECTED;
    return `<div class="pcard">
      <h3>${p.name} <span class="cnt ${offCount ? "off" : ""}">${p.teams.length} team${p.teams.length === 1 ? "" : "s"}</span></h3>
      <div class="teamchips">${chips || "<span class='none' style='color:var(--ink-dim);font-size:13px'>No teams</span>"}</div>
      <div class="add-row"><select data-add="${pi}">${opts}</select></div>
    </div>`;
  }).join("");

  // pool
  $("#pool").innerHTML = free.length
    ? free.map((id) => `<span class="pchip"><img src="${FLAG(TEAMS[id].iso, 20)}" alt="">${TEAMS[id].name}</span>`).join("")
    : "<span class='none'>Every team is assigned. ✅</span>";

  // wire controls
  document.querySelectorAll("[data-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      const [pi, id] = b.dataset.rm.split(":");
      roster[+pi].teams = roster[+pi].teams.filter((t) => t !== id);
      render(); msg("Unsaved changes", "");
    })
  );
  document.querySelectorAll("[data-add]").forEach((sel) =>
    sel.addEventListener("change", () => {
      const pi = +sel.dataset.add, id = sel.value;
      if (!id) return;
      if (ownedSet().has(id)) { msg(`${TEAMS[id].name} is already owned`, "err"); return; }
      roster[pi].teams.push(id);
      render(); msg("Unsaved changes", "");
    })
  );
}

function buildJson() {
  return JSON.stringify({
    _comment: "Source of truth for who owns which teams. Edited via the Edit Teams tab.",
    updatedAt: new Date().toISOString().slice(0, 10),
    players: roster.map((p) => ({ id: p.id, name: p.name, teams: p.teams })),
  }, null, 2) + "\n";
}

function validate() {
  const owned = ownedSet();
  const total = roster.reduce((s, p) => s + p.teams.length, 0);
  if (total !== owned.size) { msg("Fix duplicate teams before saving", "err"); return false; }
  return true;
}

// ── actions ──────────────────────────────────────────────────────────────
function download() {
  if (!validate()) return;
  const blob = new Blob([buildJson()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rosters.json";
  a.click();
  URL.revokeObjectURL(a.href);
  msg("Downloaded — commit it to data/rosters.json", "ok");
}

async function copyJson() {
  if (!validate()) return;
  try { await navigator.clipboard.writeText(buildJson()); msg("JSON copied to clipboard", "ok"); }
  catch { msg("Copy failed — use Download instead", "err"); }
}

async function saveGitHub() {
  if (!validate()) return;
  const repo = $("#gh-repo").value.trim();
  const branch = $("#gh-branch").value.trim() || "main";
  const path = $("#gh-path").value.trim() || "data/rosters.json";
  const token = $("#gh-token").value.trim();
  if (!repo.includes("/") || !token) { msg("Enter repo (owner/name) and a token", "err"); return; }
  localStorage.setItem("wc_gh", JSON.stringify({ repo, branch, path }));

  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  msg("Saving to GitHub…", "");
  try {
    // get current sha (needed to update an existing file)
    let sha;
    const cur = await fetch(`${api}?ref=${branch}`, { headers });
    if (cur.ok) sha = (await cur.json()).sha;
    const content = btoa(unescape(encodeURIComponent(buildJson())));
    const put = await fetch(api, {
      method: "PUT", headers,
      body: JSON.stringify({ message: "Update rosters via Edit Teams", content, sha, branch }),
    });
    if (!put.ok) throw new Error(`${put.status} ${(await put.json()).message || ""}`);
    msg("✅ Saved live! The board updates on the next sync.", "ok");
  } catch (e) {
    msg("GitHub save failed: " + e.message, "err");
  }
}

function reset() {
  roster = JSON.parse(original).players.map((p) => ({ ...p, teams: [...p.teams] }));
  render(); msg("Reverted to saved roster", "");
}

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  const [t, r] = await Promise.all([
    fetch("data/teams.json").then((x) => x.json()),
    fetch(`data/rosters.json?t=${Date.now()}`, { cache: "no-store" }).then((x) => x.json()),
  ]);
  TEAMS = t.teams;
  original = JSON.stringify(r);
  roster = r.players.map((p) => ({ ...p, teams: [...p.teams] }));

  // restore saved GitHub config (not the token)
  try {
    const saved = JSON.parse(localStorage.getItem("wc_gh") || "{}");
    if (saved.repo) $("#gh-repo").value = saved.repo;
    if (saved.branch) $("#gh-branch").value = saved.branch;
    if (saved.path) $("#gh-path").value = saved.path;
  } catch {}

  render();
  $("#btn-download").addEventListener("click", download);
  $("#btn-copy").addEventListener("click", copyJson);
  $("#btn-reset").addEventListener("click", reset);
  $("#btn-gh").addEventListener("click", saveGitHub);
}

boot().catch((e) => msg("Failed to load data: " + e.message, "err"));
