# Changelog

## 2026-11 — v1.1.0 compact view, squads, who-to-ask-for
- Heroes now appear in game order: grouped by role with headers, launch roster first, then by release date (Deadpool in all three roles)
- Quick Play ignores rank: the rank filter is turned off there since Quick Play isn't ranked
- Cards lead with win-rate points vs your hero's average plus a confidence tag (High / Medium / Low / Very few games), replacing the bunched-up 0-100 score
- Recommendations use the adjusted gain, so a big number from a handful of games can't win; the Why line calls this out
- Team-up effects fold away under "Effects" (open one and they all open; remembered)
- Auto season now falls back to last season based on games with your team-up partners (under 300), not total hero games
- New Compact view for a second monitor: huge PICK THIS card, the other option on one line, type-ahead hero switching (remembered; ?view=compact link)
- Squads: save your usual teammates and load them in one tap
- "Best hero to ask a teammate to swap to": ranks heroes by how much they'd add across your whole team

## 2026-11 — v1.0.1 initials fallback for missing art
- A hero portrait that fails to load now shows the hero's initials instead of an empty white box
- Service worker cache bumped so the update shows up right away

## 2026-11 — v1.0.0 first release
- Pick your hero and teammates; see both team-up options with stats and a PICK THIS recommendation
- Stats from RivalsMeta's public team-up data via the `synergy-api` Cloudflare Worker (12-hour cache, 2-week backup copy)
- Competitive / Quick Play and rank filters; Auto season falls back to last season early in a new season
- Synergy score blends win rate with the partner, sample size and popularity
- "You power up" list, Copy link sharing, saved copy of stats when offline
- Hero portraits for all 55 heroes (Season 11), built from the Hero Art folder
