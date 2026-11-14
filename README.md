# Synergy

**Which of your two Marvel Rivals team-ups should you run?** Pick the hero you locked in, add your teammates, and Synergy shows both team-up options side by side with real match stats, then highlights the one to pick.

Live: https://alphadivine.github.io/synergy/

## Features

- **Option A vs B** for every hero: team-up name, partner, base and enhanced effects
- **Teammate aware**: add who's on your team and Synergy knows which team-up is enhanced
- **Synergy score** blending win rate with your partner and how popular the pairing is, with small samples pulled toward the hero's average
- **Filters**: Competitive / Quick Play, All ranks / Diamond+ / Grandmaster+ / Celestial+
- **Auto season**: early in a new season it shows last season's numbers until there's enough data
- **You power up**: team-ups on your team that get stronger because of your hero
- **Copy link** to share a hero + team setup with friends
- All 55 heroes with portraits; new heroes appear automatically

## How it works

Stats come from [RivalsMeta](https://rivalsmeta.com/team-ups)'s public team-up data, fetched by a small Cloudflare Worker and cached for 12 hours. The site is static (GitHub Pages).

Fan-made tool, not affiliated with NetEase Games or Marvel.

---
Last updated: November 2026 (v1.0.0)
