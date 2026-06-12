// World Cup 2026 sweepstakes — leaderboard renderer.
// Reads data/standings.json (produced by the scoring job) and paints the board.

const FLAG = (iso, w = 40) => `https://flagcdn.com/w${w}/${iso}.png`;
const MEDALS = ["🥇", "🥈", "🥉"];

function timeAgo(iso) {
  if (!iso) return "—";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 90) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// classify a team's stage badge style
function badgeClass(stageKey) {
  if (stageKey === "CHAMPION") return "champ";
  if (stageKey === "RUNNER_UP" || stageKey === "THIRD" || stageKey === "FOURTH") return "final";
  if (stageKey === "GROUP") return "group";
  return "";
}

// A team is "eliminated" if it has finished its run short of the title and isn't advancing.
function isEliminated(team) {
  const k = team.stage.key;
  if (k === "CHAMPION") return false;
  const last = team.matches.filter((m) => m.status === "FINISHED").slice(-1)[0];
  if (!last) return false;
  // lost their most recent knockout match, or group exit
  if (k === "GROUP") {
    return team.matches.length >= 3 && team.matches.every((m) => m.status === "FINISHED");
  }
  return last.result === "L";
}

function teamLine(t, playerId) {
  const elim = isEliminated(t) ? " eliminated" : "";
  const r = t.record;
  return `
    <button class="teamline${elim}" data-recap="${playerId}:${t.teamId}" title="See ${t.name}'s match recap">
      <img loading="lazy" src="${FLAG(t.iso)}" alt="${t.name}" onerror="this.style.visibility='hidden'">
      <div>
        <div class="tl-name">${t.name} <span class="tl-look">↗</span></div>
        <div class="tl-rec">${r.w}W · ${r.d}D · ${r.l}L &nbsp;|&nbsp; ${t.matchPoints} match + ${t.stageBonus} bonus</div>
      </div>
      <span class="badge ${badgeClass(t.stage.key)}">${t.stage.label}</span>
      <span class="tl-pts">${t.total}</span>
    </button>`;
}

function rowHtml(p, i) {
  const topClass = p.rank <= 3 ? ` top${p.rank}` : "";
  const flags = p.teams
    .map((t) => `<img loading="lazy" class="${isEliminated(t) ? "out" : ""}" src="${FLAG(t.iso, 20)}" alt="${t.name}" title="${t.name} — ${t.total} pts" onerror="this.style.visibility='hidden'">`)
    .join("");
  const teams = p.teams
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((t) => teamLine(t, p.id))
    .join("");
  return `
    <li class="row${topClass}" style="animation-delay:${i * 55}ms" data-id="${p.id}">
      <div class="row-main" role="button" tabindex="0" aria-expanded="false">
        <div class="rank">${p.rank}</div>
        <div class="who">
          <span class="name">${p.name}</span>
          <span class="miniflags">${flags}</span>
        </div>
        <div class="score">
          <div class="pts">${p.total}</div>
          <div class="brk">${p.matchPoints} match · ${p.stageBonus} bonus</div>
        </div>
        <div class="chev">⌄</div>
      </div>
      <div class="detail"><div class="detail-inner">${teams}</div></div>
    </li>`;
}

// Podium grouped by score level (gold/silver/bronze), so JOINT positions all show.
// Leaders (top score) sit on top; the next two score levels go in a row below.
// A level with many tied players collapses to one summary card (avoids 10 cards on 0 pts).
function podiumCard(p, level, i) {
  const flags = p.teams
    .map((t) => `<img loading="lazy" src="${FLAG(t.iso, 20)}" alt="${t.name}" onerror="this.style.visibility='hidden'">`)
    .join("");
  return `
    <div class="pod lvl${level}" style="animation-delay:${i * 70}ms">
      <span class="rankno">#${p.rank}</span>
      <div class="medal">${MEDALS[level]}</div>
      <div class="pod-name">${p.name}</div>
      <div class="pod-pts">${p.total}<small> PTS</small></div>
      <div class="pod-flags">${flags}</div>
    </div>`;
}
function podiumSummaryCard(list, level) {
  const names = list.length <= 6 ? list.map((p) => p.name).join(", ") : `${list.length} players tied`;
  return `
    <div class="pod lvl${level} pod-summary">
      <span class="rankno">#${list[0].rank}</span>
      <div class="medal">${MEDALS[level]}</div>
      <div class="pod-name">${list.length} tied</div>
      <div class="pod-pts">${list[0].total}<small> PTS</small></div>
      <div class="pod-sub">${names}</div>
    </div>`;
}
function renderLevel(list, level) {
  return list.length > 4 ? podiumSummaryCard(list, level) : list.map((p, i) => podiumCard(p, level, i)).join("");
}
function podiumHtml(players) {
  // Group by actual rank (1/2/3) so joint positions all show and the medal always
  // matches the position — e.g. two tied for 1st → next player is #3 (bronze), not #2.
  const top = players.filter((p) => p.rank <= 3);
  if (!top.length) return "";
  const ranks = [...new Set(top.map((p) => p.rank))].sort((a, b) => a - b);
  const leaders = top.filter((p) => p.rank === ranks[0]);
  let html = `<div class="pod-row leaders">${renderLevel(leaders, ranks[0] - 1)}</div>`;
  const restHtml = ranks
    .slice(1)
    .map((r) => renderLevel(top.filter((p) => p.rank === r), r - 1))
    .join("");
  if (restHtml) html += `<div class="pod-row rest">${restHtml}</div>`;
  return html;
}

function wireRows() {
  document.querySelectorAll(".row").forEach((row) => {
    const main = row.querySelector(".row-main");
    const toggle = () => {
      const open = row.classList.toggle("open");
      main.setAttribute("aria-expanded", String(open));
    };
    main.addEventListener("click", toggle);
    main.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });
  document.querySelectorAll("[data-recap]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [pid, tid] = btn.dataset.recap.split(":");
      const player = (window.__DATA?.players || []).find((p) => p.id === pid);
      const team = player?.teams.find((t) => t.teamId === tid);
      if (team) openRecap(team, player.name);
    })
  );
}

// ── Match recap modal ────────────────────────────────────────────────────────
const RESULT_LABEL = { W: "Win", D: "Draw", L: "Loss" };
function fmtDate(iso) {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function openRecap(team, owner) {
  const finished = team.matches.filter((m) => m.status === "FINISHED");
  const upcoming = team.matches.filter((m) => m.status !== "FINISHED");
  const matchRow = (m) => {
    const res = m.result ? `<span class="res ${m.result}">${RESULT_LABEL[m.result]}</span>` : `<span class="res up">${m.status === "LIVE" ? "Live" : "Upcoming"}</span>`;
    const score = m.status === "FINISHED" ? `${m.scoreFor}–${m.scoreAgainst}` : "vs";
    const oppFlag = m.opponentIso ? `<img src="${FLAG(m.opponentIso, 20)}" alt="" onerror="this.style.visibility='hidden'">` : "";
    return `<div class="recap-row ${m.result || "up"}">
      <span class="rc-stage">${m.label || "—"}</span>
      <span class="rc-opp">${oppFlag}<span>${m.opponent || "TBD"}</span></span>
      <span class="rc-score">${score}</span>
      ${res}
      <span class="rc-date">${fmtDate(m.utcDate)}</span>
    </div>`;
  };
  const body = finished.length || upcoming.length
    ? [...finished, ...upcoming].map(matchRow).join("")
    : `<p class="recap-empty">No matches played yet.</p>`;

  const r = team.record;
  const el = document.getElementById("modal");
  el.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="${team.name} match recap">
      <button class="modal-x" aria-label="Close">✕</button>
      <div class="modal-head">
        <img class="modal-flag" src="${FLAG(team.iso, 80)}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="modal-team">${team.name}</div>
          <div class="modal-owner">${owner}'s team · <span class="badge ${badgeClass(team.stage.key)}">${team.stage.label}</span></div>
        </div>
        <div class="modal-tot"><b>${team.total}</b><small>PTS</small></div>
      </div>
      <div class="modal-stats">
        <span>${r.w}W · ${r.d}D · ${r.l}L</span>
        <span>${team.matchPoints} match pts</span>
        <span>+${team.stageBonus} stage bonus</span>
      </div>
      <div class="recap-list">${body}</div>
    </div>`;
  el.classList.add("show");
  const close = () => el.classList.remove("show");
  el.querySelector(".modal-x").addEventListener("click", close);
  el.onclick = (e) => { if (e.target === el) close(); };
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
}

function setStatus(data) {
  const pill = document.getElementById("status-pill");
  const text = document.getElementById("status-text");
  const live = (data.liveMatches || 0) > 0;
  pill.classList.toggle("live", live);
  if (live) {
    text.textContent = `LIVE · ${data.liveMatches} match${data.liveMatches > 1 ? "es" : ""} now`;
  } else {
    text.textContent = `Updated ${timeAgo(data.generatedAt)}`;
  }
  const fin = data.finishedMatches || 0;
  document.getElementById("foot-meta").textContent =
    `${fin} of 104 matches played · last sync ${timeAgo(data.generatedAt)}`;
  // demo banner if running off the sample feed
  if (data.source && data.source !== "football-data") {
    document.getElementById("demo-banner").hidden = false;
  }
}

async function load() {
  try {
    const res = await fetch(`data/standings.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    window.__DATA = data;
    setStatus(data);
    document.getElementById("podium").innerHTML = podiumHtml(data.players);
    document.getElementById("board").innerHTML = data.players.map(rowHtml).join("");
    wireRows();
  } catch (err) {
    document.getElementById("status-text").textContent = "No data yet";
    document.getElementById("board").innerHTML =
      `<li class="row" style="opacity:1;transform:none"><div class="row-main"><div></div>
       <div class="who"><span class="name">Standings will appear once the first match is scored.</span>
       <span class="tl-rec" style="color:var(--ink-dim)">Run the update job or wait for the next sync.</span></div>
       <div></div><div></div></div></li>`;
    console.error("Failed to load standings.json:", err);
  }
}

load();
// Auto-refresh the page data every 2 minutes so an open tab stays current.
setInterval(load, 120000);
