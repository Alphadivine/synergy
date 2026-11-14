/* Synergy — settings. Filled in with the live values; no edits needed to deploy. */
window.SYNERGY_CONFIG = {
  // Cloudflare Worker that fetches and caches RivalsMeta's public team-up stats
  WORKER_URL: "https://synergy-api.quentinclayton643.workers.dev",
  // Where the stats come from (shown and linked in the app's footer)
  SOURCE_NAME: "RivalsMeta",
  SOURCE_URL: "https://rivalsmeta.com/team-ups",
  // When the current season has fewer games than this for your hero (with your filters),
  // Synergy automatically shows last season's numbers instead.
  MIN_HERO_GAMES: 800,
  // Games needed before a team-up's numbers are trusted at face value
  // (below this they are pulled toward the hero's average so tiny samples can't top the list).
  SHRINK_GAMES: 150
};
