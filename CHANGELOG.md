# Changelog

## 2026-11 — v1.0.0 first release
- Pick your hero and teammates; see both team-up options with stats and a PICK THIS recommendation
- Stats from RivalsMeta's public team-up data via the `synergy-api` Cloudflare Worker (12-hour cache, 2-week backup copy)
- Competitive / Quick Play and rank filters; Auto season falls back to last season early in a new season
- Synergy score blends win rate with the partner, sample size and popularity
- "You power up" list, Copy link sharing, saved copy of stats when offline
- Hero portraits for all 55 heroes (Season 11), built from the Hero Art folder
