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

function teamLine(t) {
  const elim = isEliminated(t) ? " eliminated" : "";
  const r = t.record;
  return `
    <div class="teamline${elim}">
      <img loading="lazy" src="${FLAG(t.iso)}" alt="${t.name}" onerror="this.style.visibility='hidden'">
      <div>
        <div class="tl-name">${t.name}</div>
        <div class="tl-rec">${r.w}W · ${r.d}D · ${r.l}L &nbsp;|&nbsp; ${t.matchPoints} match + ${t.stageBonus} bonus</div>
      </div>
      <span class="badge ${badgeClass(t.stage.key)}">${t.stage.label}</span>
      <span class="tl-pts">${t.total}</span>
    </div>`;
}

function rowHtml(p, i) {
  const topClass = p.rank <= 3 ? ` top${p.rank}` : "";
  const flags = p.teams
    .map((t) => `<img loading="lazy" class="${isEliminated(t) ? "out" : ""}" src="${FLAG(t.iso, 20)}" alt="${t.name}" title="${t.name} — ${t.total} pts" onerror="this.style.visibility='hidden'">`)
    .join("");
  const teams = p.teams
    .slice()
    .sort((a, b) => b.total - a.total)
    .map(teamLine)
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

function podiumHtml(players) {
  // visual order: 2nd, 1st, 3rd
  const top = players.filter((p) => p.rank <= 3);
  const byRank = (r) => top.find((p) => p.rank === r);
  const order = [byRank(2), byRank(1), byRank(3)].filter(Boolean);
  return order
    .map((p) => {
      const flags = p.teams
        .map((t) => `<img loading="lazy" src="${FLAG(t.iso, 20)}" alt="${t.name}" onerror="this.style.visibility='hidden'">`)
        .join("");
      return `
        <div class="pod pod-${p.rank}" style="animation-delay:${p.rank * 90}ms">
          <span class="rankno">#${p.rank}</span>
          <div class="medal">${MEDALS[p.rank - 1]}</div>
          <div class="pod-name">${p.name}</div>
          <div class="pod-pts">${p.total}<small> PTS</small></div>
          <div class="pod-flags">${flags}</div>
        </div>`;
    })
    .join("");
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
