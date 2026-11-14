# Synergy

**Which of your two Marvel Rivals team-ups should you run?** Pick the hero you locked in, add your teammates, and Synergy shows both team-up options side by side with real match stats, then highlights the one to pick.

Live: https://alphadivine.github.io/synergy/

## Features

- **Option A vs B** for every hero: team-up name, partner, base and enhanced effects
- **Teammate aware**: add who's on your team and Synergy knows which team-up is enhanced
- **Win-rate gain + confidence** for each option, with small samples pulled toward the hero's average so they can't top the list
- **Filters**: Competitive (All ranks / Diamond+ / Grandmaster+ / Celestial+) or Quick Play
- **Auto season**: early in a new season it shows last season's numbers until your team-ups have enough games
- **Compact view** for a second monitor: a big glanceable pick with type-ahead hero switching
- **Squads**: save your usual teammates and load them in one tap
- **Who to ask for**: the hero a teammate could swap to that helps your whole team most
- Heroes in game order, grouped by role
- **You power up**: team-ups on your team that get stronger because of your hero
- **Copy link** to share a hero + team setup with friends
- All 55 heroes with portraits; new heroes appear automatically

## How it works

Stats come from [RivalsMeta](https://rivalsmeta.com/team-ups)'s public team-up data, fetched by a small Cloudflare Worker and cached for 12 hours. The site is static (GitHub Pages).

Fan-made tool, not affiliated with NetEase Games or Marvel.

---
Last updated: November 2026 (v1.1.0)
