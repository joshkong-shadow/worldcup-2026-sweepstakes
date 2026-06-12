// Schedule page — renders the knockout bracket + group tables from data/tournament.json
const FLAG = (iso, w = 20) => (iso ? `https://flagcdn.com/w${w}/${iso}.png` : "");
const KO_ORDER = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"];
const KO_TITLE = { LAST_32: "Round of 32", LAST_16: "Round of 16", QUARTER_FINALS: "Quarter-finals", SEMI_FINALS: "Semi-finals", FINAL: "Final" };

function timeAgo(iso) {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} hr${h > 1 ? "s" : ""} ago` : `${Math.round(h / 24)} day(s) ago`;
}
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "TBD");

function side(cell, res, goals, finished) {
  if (!cell) return `<div class="side tbd"><span></span><span class="nm">TBD</span><span class="sc"></span></div>`;
  const cls = !finished ? "" : res === "W" ? "win" : "lose";
  const owner = cell.owner ? `<small> · ${cell.owner}</small>` : "";
  const flag = cell.iso ? `<img src="${FLAG(cell.iso)}" alt="" onerror="this.style.visibility='hidden'">` : "<span></span>";
  return `<div class="side ${cls}">${flag}<span class="nm">${cell.name}${owner}</span><span class="sc">${finished ? goals : ""}</span></div>`;
}

function tie(m, isFinal) {
  const finished = m.status === "FINISHED";
  return `<div class="tie ${isFinal ? "final-tie" : ""}">
    ${side(m.home, m.homeRes, m.homeGoals, finished)}
    ${side(m.away, m.awayRes, m.awayGoals, finished)}
    <div class="bdate">${finished ? "FT" : fmtDate(m.utcDate)}</div>
  </div>`;
}

function renderBracket(bracket) {
  const root = document.getElementById("bracket");
  const present = KO_ORDER.filter((s) => bracket[s]?.length);
  if (!present.length) {
    root.outerHTML = `<div class="bracket-empty">The knockout bracket is set after the group stage — teams will appear here once the Round of 32 is locked in.</div>`;
    return;
  }
  root.innerHTML = present.map((stage) => {
    const isFinal = stage === "FINAL";
    const ties = bracket[stage].map((m) => tie(m, isFinal)).join("");
    let extra = "";
    if (isFinal) {
      const f = bracket.FINAL[0];
      if (f?.status === "FINISHED") {
        const champ = f.winnerSide === "HOME" ? f.home : f.away;
        if (champ) extra = `<div class="champ-banner"><small>🏆 CHAMPION</small>${champ.name}${champ.owner ? ` · ${champ.owner}` : ""}</div>`;
      }
    }
    return `<div class="bcol ${isFinal ? "final-col" : ""}"><div class="bcol-h">${KO_TITLE[stage]}</div>${ties}${extra}</div>`;
  }).join("");

  // third-place playoff (shown under the bracket)
  const tp = bracket.THIRD_PLACE?.[0];
  if (tp) {
    document.getElementById("thirdplace").innerHTML =
      `<div style="max-width:340px;margin:14px auto 0"><div class="bcol-h">Third-place playoff</div>${tie(tp, false)}</div>`;
  }
}

function renderGroups(groups) {
  const root = document.getElementById("groups");
  if (!groups?.length) { root.innerHTML = `<div class="bracket-empty">Group tables will populate as matches are played.</div>`; return; }
  root.innerHTML = groups.map((g) => {
    const rows = g.table.map((r) => {
      const qual = r.position <= 2 ? "qual" : "";
      const owner = r.owner ? `<span class="own">${r.owner}</span>` : "";
      const flag = r.iso ? `<img src="${FLAG(r.iso)}" alt="" onerror="this.style.visibility='hidden'">` : "";
      return `<tr class="${qual}">
        <td class="pos">${r.position}</td>
        <td class="l"><span class="team">${flag}<span>${r.name}</span>${owner}</span></td>
        <td>${r.played}</td><td>${r.won}</td><td>${r.draw}</td><td>${r.lost}</td>
        <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.points}</td>
      </tr>`;
    }).join("");
    return `<div class="gcard"><h3>${g.group}</h3>
      <table class="gtable">
        <thead><tr><th class="pos"></th><th class="l">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }).join("");
}

async function load() {
  try {
    const data = await (await fetch(`data/tournament.json?t=${Date.now()}`, { cache: "no-store" })).json();
    document.getElementById("status-text").textContent = `Updated ${timeAgo(data.generatedAt)}`;
    renderBracket(data.bracket || {});
    renderGroups(data.groups || []);
  } catch (e) {
    document.getElementById("status-text").textContent = "No data yet";
    document.getElementById("bracket").outerHTML = `<div class="bracket-empty">Couldn't load tournament data yet. Run the update job or wait for the next sync.</div>`;
    console.error(e);
  }
}
load();
setInterval(load, 120000);
