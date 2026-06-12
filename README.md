# ⚽ World Cup 2026 Sweepstakes Leaderboard

A football-themed, auto-updating leaderboard for our group's World Cup 2026 sweepstakes.
Scores every player on their teams' results **plus** how far each team goes, and refreshes
automatically after every match via a scheduled GitHub Action. No server, no database — just
a static page that reads a JSON file the Action keeps up to date.

**Live site:** https://joshkong-shadow.github.io/worldcup-2026-sweepstakes/

---

## Scoring

**Match points** (every match, group + knockout):

| Result | Points |
|--------|:------:|
| Win    | 3 |
| Draw   | 1 |
| Loss   | 0 |

A knockout decided on penalties → the team that **advances** is scored a Win.

**Furthest-stage bonus** (best stage a team reaches, once):

| Stage | Bonus | | Stage | Bonus |
|---|:--:|---|---|:--:|
| Group exit | 0 | | 4th place | 45 |
| Round of 32 | 5 | | 3rd place | 55 |
| Round of 16 | 10 | | Runner-up | 65 |
| Quarter-final | 20 | | Champion | 80 |
| Semi-final | 35 | | | |

A player's total = (match points + stage bonus) summed across **all** their teams.

---

## How it works

```
data/rosters.json   ──┐
data/teams.json     ──┤   scripts/update.mjs   ──►  data/standings.json  ──►  index.html
results feed (API)  ──┘   (runs in GitHub Actions)         (committed)        (the leaderboard)
```

- `scripts/scoring.mjs` — the pure scoring engine (unit-tested in `scripts/scoring.test.mjs`).
- `scripts/sources.mjs` — results-feed adapters (football-data.org + a local-file adapter).
- `scripts/update.mjs` — fetches results, scores everyone, writes `data/standings.json`.
- `.github/workflows/update.yml` — runs `update.mjs` every 10 minutes and commits changes.
- `index.html` / `app.js` — the leaderboard (reads `standings.json`). Click any country to
  open a **match recap** (every result, opponent, score, W/D/L).
- `schedule.html` / `schedule.js` — the **Tournament Schedule**: knockout bracket + 12 group
  tables (reads `tournament.json`), with owner tags showing whose sweepstakes pick each team is.
- `edit.html` / `edit.js` — the **Edit Teams** roster editor.

---

## Deploy (one-time setup)

1. **Create a free results API key** at <https://www.football-data.org/client/register>
   (the World Cup competition is on the free tier).
2. **Push this folder to a GitHub repo.**
3. **Add the key as a secret:** repo → *Settings → Secrets and variables → Actions →
   New repository secret* → name `FOOTBALL_DATA_TOKEN`, value = your key.
4. **Turn on Pages:** repo → *Settings → Pages* → *Source: Deploy from a branch* →
   branch `main`, folder `/ (root)`. Your URL appears here — paste it at the top of this file.
5. **Kick off the first run:** repo → *Actions → Update standings → Run workflow*.
   After it finishes, the live leaderboard shows real results. Done — it now updates itself.

> Until the Action runs with a key, the site shows clearly-labelled **DEMO data** so you can
> see the design. To clear it, run the Action (or `npm run update` locally with the token).

---

## Editing teams / trades

Open **Edit Teams** (link in the top bar). Remove a team to free it up, then add it to whoever
traded for it — the editor won't let two people own the same team. Then either:

- **Download `rosters.json`** and commit it to `data/` (simple, no secrets), **or**
- Use **Advanced → Save live to GitHub** with a fine-grained token
  (*Contents: Read & write* on this repo only) to commit straight from the browser.

Either way, the next Action run (a roster commit triggers one immediately) recomputes the board.

---

## Local development

```bash
# preview the site
npx serve .            # then open the printed URL

# regenerate demo data (no API key needed)
npm run seed           # full simulated tournament
npm run seed -- --group   # group stage only (early-tournament look)
SOURCE=file npm run update

# run against the live feed
FOOTBALL_DATA_TOKEN=xxxx npm run update

# tests
npm test
```

## Notes & tweaks

- **Roster:** Wei carries 5 teams by agreement. Wei↔Ben trade (Saudi Arabia ↔ New Zealand)
  is applied in `data/rosters.json` — adjust in Edit Teams if needed.
- **⚠ Denmark is not in the WC 2026 field** (confirmed against the official feed — they're not
  among the 48 qualified teams). Wei drafted Denmark, so that pick scores **0**. All other 48
  picks are real participants. Swap Denmark for a free team in Edit Teams if you want.
- **Data source confirmed:** football-data.org's free tier returns all 104 matches with the
  correct stage labels (`GROUP_STAGE`, `LAST_32` … `FINAL`) and the `/standings` group tables.
- **Different data source?** Add an adapter in `scripts/sources.mjs` and point `SOURCE` at it.
  A free no-key option is [rezarahiminia/worldcup2026](https://github.com/rezarahiminia/worldcup2026).
- **Refresh cadence:** change the `cron` in `.github/workflows/update.yml`.
- If a feed team name doesn't match, `update.mjs` logs it — add an alias in `data/teams.json`.
