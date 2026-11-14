/* Synergy — Marvel Rivals team-up picker
   Pick the hero you're playing, add teammates, and see which of your two team-ups
   to run. Stats: RivalsMeta's public team-up data via the Synergy Worker. */
(() => {
  'use strict';
  const APP_VERSION = '1.0.1';
  const CFG = window.SYNERGY_CONFIG || {};
  const K = CFG.SHRINK_GAMES || 150;
  const MIN_GAMES = CFG.MIN_HERO_GAMES || 800;
  const ROLE_FROM_SITE = { Tank: 'Vanguard', Damage: 'Duelist', Support: 'Strategist' };
  const ROLES = ['Vanguard', 'Duelist', 'Strategist'];
  const RANKS = {
    all: { label: 'All ranks', keys: null },
    dia: { label: 'Diamond+', keys: ['5', '6', '9', '7', '8'] },
    gm:  { label: 'Grandmaster+', keys: ['6', '9', '7', '8'] },
    cel: { label: 'Celestial+', keys: ['9', '7', '8'] },
  };
  const CACHE_KEY = 'synergy.stats.v1';
  const STATE_KEY = 'synergy.state.v1';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x, d = 1) => (x == null || isNaN(x) ? '—' : (x * 100).toFixed(d) + '%');
  const fmtInt = (n) => (n || 0).toLocaleString('en-US');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- storage (guarded) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
  };

  // ---------- heroes + team-ups ----------
  const ALIAS = window.SYNERGY_HERO_ALIASES || {};
  const HEROES = new Map();   // id -> {id, name, role, slug}
  for (const [id, name, role, slug] of window.SYNERGY_HEROES || []) HEROES.set(id, { id, name, role, slug });
  const bySlug = () => { const m = new Map(); HEROES.forEach((h) => { if (h.slug) m.set(h.slug, h.id); m.set(slugify(h.name), h.id); }); return m; };
  function slugify(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  let TEAMUPS = new Map();    // id -> {id, name, anchor, partner, base, enh, isNew}
  let BY_ANCHOR = new Map();
  let BY_PARTNER = new Map();

  function setTeamups(list) {
    TEAMUPS = new Map(); BY_ANCHOR = new Map(); BY_PARTNER = new Map();
    for (const t of list) {
      TEAMUPS.set(t.id, t);
      if (!BY_ANCHOR.has(t.anchor)) BY_ANCHOR.set(t.anchor, []);
      BY_ANCHOR.get(t.anchor).push(t);
      if (t.partner != null) {
        if (!BY_PARTNER.has(t.partner)) BY_PARTNER.set(t.partner, []);
        BY_PARTNER.get(t.partner).push(t);
      }
    }
    BY_ANCHOR.forEach((arr) => arr.sort((a, b) => a.id - b.id));
  }

  function fallbackTeamups() {
    return String(window.SYNERGY_FALLBACK_TEAMUPS || '').split(';').filter(Boolean).map((row) => {
      const [id, name, hs, n] = row.split('|');
      const [anchor, partner] = hs.split(',').map(Number);
      return { id: Number(id), name, anchor, partner, base: '', enh: '', isNew: n === 'N' };
    });
  }

  function applyMeta(meta) {
    if (meta && Array.isArray(meta.heroes)) {
      for (const [rawId, name, role] of meta.heroes) {
        const id = ALIAS[rawId] || rawId;
        if (!HEROES.has(id)) HEROES.set(id, { id, name: String(name).replace(/\s*\(.*\)$/, ''), role: ROLE_FROM_SITE[role] || 'Flex', slug: null });
      }
    }
    if (meta && Array.isArray(meta.teamups) && meta.teamups.length) {
      setTeamups(meta.teamups.map(([id, name, anchor, partner, base, enh, isNew]) => ({ id, name, anchor: ALIAS[anchor] || anchor, partner: partner == null ? null : (ALIAS[partner] || partner), base, enh, isNew: !!isNew })));
    } else {
      setTeamups(fallbackTeamups());
    }
  }

  // ---------- state ----------
  const saved = store.get(STATE_KEY) || {};
  const state = Object.assign({ hero: 1023, mates: [], pick: 'me', mode: 'comp', rank: 'all', role: 'all', season: 'auto', q: '' }, saved, { q: '' });
  (function readUrl() {
    const p = new URLSearchParams(location.search);
    const map = bySlug();
    const h = p.get('hero');
    if (h && map.has(h)) state.hero = map.get(h);
    const t = p.get('team');
    if (t != null) state.mates = t.split(',').map((s) => map.get(s)).filter((id) => id && id !== state.hero).slice(0, 5);
  })();
  const save = () => store.set(STATE_KEY, { hero: state.hero, mates: state.mates, pick: state.pick, mode: state.mode, rank: state.rank, role: state.role, season: state.season });

  // ---------- stats ----------
  let DATA = null;          // Worker response
  let DATA_NOTE = '';       // e.g. "offline copy"
  const aggCache = new Map();

  function aggregate(season, mode, rankKey) {
    const key = season.id + '|' + mode + '|' + rankKey;
    if (aggCache.has(key)) return aggCache.get(key);
    const ranks = (season.modes && season.modes[mode]) || {};
    const want = RANKS[rankKey].keys;
    const h = new Map(); const t = new Map();
    for (const [rk, r] of Object.entries(ranks)) {
      if (want && !want.includes(rk)) continue;
      for (const [rawId, v] of Object.entries(r.h || {})) {
        const id = ALIAS[rawId] || Number(rawId);
        const cur = h.get(id) || [0, 0, 0];
        cur[0] += v[0] || 0; cur[1] += v[1] || 0; cur[2] += v[2] || 0;
        h.set(id, cur);
      }
      for (const [id, v] of Object.entries(r.t || {})) {
        const cur = t.get(Number(id)) || [0, 0];
        cur[0] += v[0] || 0; cur[1] += v[1] || 0;
        t.set(Number(id), cur);
      }
    }
    const out = { h, t, season };
    aggCache.set(key, out);
    return out;
  }

  function chooseSeason(heroId) {
    if (!DATA || !DATA.seasons || !DATA.seasons.length) return { S: null, fellBack: false };
    const [cur, prev] = DATA.seasons;
    if (state.season === 'prev' && prev) return { S: aggregate(prev, state.mode, state.rank), fellBack: false };
    const now = aggregate(cur, state.mode, state.rank);
    if (state.season === 'cur' || !prev) return { S: now, fellBack: false };
    const hs = now.h.get(heroId);
    const curGames = hs ? hs[2] : 0;
    if (curGames >= MIN_GAMES) return { S: now, fellBack: false };
    // Only fall back if last season actually has more team-up games for this hero
    // (a brand-new hero or team-up has nothing last season).
    const old = aggregate(prev, state.mode, state.rank);
    const pairGames = (S) => (BY_ANCHOR.get(heroId) || []).reduce((n, t) => n + ((S.t.get(t.id) || [0])[0]), 0);
    if (pairGames(old) > pairGames(now)) return { S: old, fellBack: true, curGames };
    return { S: now, fellBack: false, thin: true, curGames };
  }

  function evaluate(heroId, S) {
    const opts = (BY_ANCHOR.get(heroId) || []).slice(0, 2);
    const hs = S ? S.h.get(heroId) : null;
    const heroWR = hs && hs[0] ? hs[1] / hs[0] : null;
    const heroGames = hs ? hs[2] : 0;
    const base = heroWR == null ? 0.5 : heroWR;
    const list = opts.map((tu) => {
      const st = S ? (S.t.get(tu.id) || [0, 0]) : [0, 0];
      const m = st[0]; const w = st[1];
      const wr = m ? w / m : null;
      const adj = (w + K * base) / (m + K);
      const lift = adj - base;
      const rawLift = wr == null || heroWR == null ? null : wr - heroWR;
      const pairRate = heroGames ? m / heroGames : null;
      const active = state.mates.includes(tu.partner);
      const hasData = !!S && m > 0;
      const score = hasData ? clamp(Math.round(50 + 400 * lift + Math.min(10, 50 * (pairRate || 0))), 1, 99) : null;
      return { tu, m, w, wr, lift, rawLift, pairRate, active, hasData, score, inSeason: !!S && (S.t.has(tu.id) || m === 0) };
    });
    let best = null;
    const live = list.filter((o) => o.active);
    const pool = live.length ? live : list;
    for (const o of pool) if (!best || (o.score ?? -1) > (best.score ?? -1)) best = o;
    return { list, best, heroWR, heroGames, liveCount: live.length };
  }

  // ---------- rendering helpers ----------
  function heroImg(id, cls, tall) {
    const h = HEROES.get(id);
    if (!h) return `<span class="ini r-Flex ${cls || ''}" aria-hidden="true">?</span>`;
    const ini = h.name.replace(/^The /, '').split(/[\s&-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    if (h.slug) return `<img class="${cls || ''}" src="heroes/${h.slug}${tall ? '-tall' : ''}.webp" alt="" loading="lazy" data-ini="${esc(ini)}" data-role="${esc(h.role)}">`;
    return `<span class="ini r-${h.role} ${cls || ''}" aria-hidden="true">${esc(ini)}</span>`;
  }
  const heroName = (id) => (HEROES.get(id) || { name: 'Hero ' + id }).name;
  const SHORT = { 'Doctor Strange': 'Strange', 'Captain America': 'Cap', 'Jeff the Land Shark': 'Jeff', 'Cloak & Dagger': 'C&D', 'Mister Fantastic': 'Mr. Fantastic', 'Devil Dinosaur': 'Devil Dino', 'Elsa Bloodstone': 'Elsa', 'Rocket Raccoon': 'Rocket', 'Peni Parker': 'Peni', 'Adam Warlock': 'Adam', 'Invisible Woman': 'Sue Storm', 'Squirrel Girl': 'Squirrel Girl', 'Scarlet Witch': 'Wanda', 'Winter Soldier': 'Bucky', 'Black Panther': 'Panther', 'Black Widow': 'Widow' };
  const short = (id) => { const n = heroName(id); if (SHORT[n]) return SHORT[n]; const m = n.replace(/^The /, ''); return m.length <= 12 ? m : m.split(' ')[0]; };

  function segButtons(el, items, current, onPick) {
    el.innerHTML = items.map(([v, label, disabled]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${v === current}" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) onPick(b.dataset.v); };
  }

  function timeAgo(iso) {
    const t = Date.parse(iso); if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 2) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 48) return h + 'h ago';
    return Math.round(h / 24) + ' days ago';
  }

  // ---------- render ----------
  function renderControls() {
    segButtons($('modeSeg'), [['comp', 'Competitive'], ['qp', 'Quick Play']], state.mode, (v) => { state.mode = v; update(); });
    segButtons($('rankSeg'), Object.entries(RANKS).map(([k, r]) => [k, r.label]), state.rank, (v) => { state.rank = v; update(); });
    const s = DATA && DATA.seasons ? DATA.seasons : [];
    const items = [['auto', 'Auto']];
    if (s[0]) items.push(['cur', s[0].label]);
    if (s[1]) items.push(['prev', s[1].label]);
    segButtons($('seasonSeg'), items, state.season, (v) => { state.season = v; update(); });
    segButtons($('pickSeg'), [['me', 'I’m playing'], ['team', 'Add teammates']], state.pick, (v) => { state.pick = v; update(); });
    $('pickHint').textContent = state.pick === 'me' ? 'Tap the hero you locked in.' : 'Tap who your teammates picked (up to 5). Tap again to remove.';
    const roles = [['all', 'All'], ...ROLES.map((r) => [r, r])];
    const rc = $('roleChips');
    rc.innerHTML = roles.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${state.role === v}">${l}</button>`).join('');
    rc.onclick = (e) => { const b = e.target.closest('button'); if (b) { state.role = b.dataset.v; update(); } };
  }

  function renderStatus(choice) {
    const st = $('status');
    if (!DATA) { st.textContent = DATA_NOTE || 'Loading stats…'; return; }
    const S = choice && choice.S;
    const label = S ? S.season.label : '';
    st.textContent = `${label} · ${state.mode === 'comp' ? 'Competitive' : 'Quick Play'} · ${RANKS[state.rank].label} · refreshed ${timeAgo(DATA.updated)}${DATA_NOTE ? ' · ' + DATA_NOTE : ''}`;
    const b = $('banner');
    const msgs = [];
    if (DATA.stale) msgs.push('RivalsMeta couldn’t be reached on the last refresh, so these are the most recent saved numbers.');
    if (choice && choice.fellBack) {
      const cur = DATA.seasons[0];
      msgs.push(`${cur.label} only has ${fmtInt(choice.curGames)} ${esc(heroName(state.hero))} games so far with these filters, so you’re seeing <strong>${esc(S.season.label)}</strong> numbers. Switch the season to <strong>${esc(cur.label)}</strong> to see the new season anyway.`);
    }
    if (choice && choice.thin && state.season === 'auto') {
      msgs.push(`${esc(S.season.label)} only has ${fmtInt(choice.curGames)} ${esc(heroName(state.hero))} games so far, and there\u2019s nothing to compare from last season, so these early numbers will move a lot.`);
    }
    b.hidden = !msgs.length; b.className = 'banner'; b.innerHTML = msgs.join('<br>');
  }

  function renderRoster() {
    const q = state.q.trim().toLowerCase();
    const heroes = [...HEROES.values()]
      .filter((h) => state.role === 'all' || h.role === state.role || h.role === 'Flex')
      .filter((h) => !q || h.name.toLowerCase().includes(q))
      .sort((a, b) => matchRank(a, q) - matchRank(b, q) || (ROLES.indexOf(a.role) + 10 * (a.role === 'Flex')) - (ROLES.indexOf(b.role) + 10 * (b.role === 'Flex')) || a.name.localeCompare(b.name));
    const partners = new Set((BY_ANCHOR.get(state.hero) || []).map((t) => t.partner));
    $('heroGrid').innerHTML = heroes.length ? heroes.map((h) => {
      const isMe = h.id === state.hero; const isMate = state.mates.includes(h.id);
      const tag = isMe ? 'YOU' : isMate ? 'TEAM' : partners.has(h.id) ? 'PARTNER' : '';
      const cls = isMe ? 'on' : isMate ? 'mate' : '';
      return `<button type="button" class="tile ${cls}" data-id="${h.id}" aria-label="${esc(h.name)}${tag ? ' (' + tag.toLowerCase() + ')' : ''}" aria-pressed="${state.pick === 'me' ? isMe : isMate}">${heroImg(h.id)}<span class="nm">${esc(h.name)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</button>`;
    }).join('') : '<div class="empty">No heroes match.</div>';
  }

  // When searching, names that start with the text come first, then any word starting with it.
  function matchRank(h, q) {
    if (!q) return 0;
    const n = h.name.toLowerCase();
    if (n.startsWith(q) || n.replace(/^the /, '').startsWith(q)) return 0;
    if (n.split(/[\s&-]+/).some((w) => w.startsWith(q))) return 1;
    return 2;
  }

  function pickHero(id) {
    if (state.pick === 'me') {
      state.hero = id;
      state.mates = state.mates.filter((m) => m !== id);
    } else if (id !== state.hero) {
      toggleMate(id);
      return;
    }
    update();
  }
  function toggleMate(id) {
    if (state.mates.includes(id)) state.mates = state.mates.filter((m) => m !== id);
    else if (state.mates.length < 5) state.mates = state.mates.concat(id);
    else { toast('Your team is full: remove someone first'); return; }
    update();
  }

  function renderMain(choice) {
    const main = $('main');
    const id = state.hero;
    const h = HEROES.get(id) || { name: 'Hero', role: 'Flex' };
    const S = choice ? choice.S : null;
    const ev = evaluate(id, S);
    const hs = S ? S.h.get(id) : null;

    const head = `
      <section class="hero-head">
        ${heroImg(id, 'hero-pic', true)}
        <div class="hero-meta">
          <div class="eyebrow">You are playing</div>
          <div class="hero-name">${esc(h.name)}</div>
          <div class="hero-sub">${esc(h.role === 'Flex' ? 'Vanguard / Duelist / Strategist' : h.role)}${hs ? ` · ${pct(ev.heroWR)} win rate across ${fmtInt(hs[2])} games` : DATA ? ' · no games recorded yet' : ''}</div>
        </div>
      </section>`;

    const slots = Array.from({ length: Math.max(0, 5 - state.mates.length) }, () => '<div class="slot">empty</div>').join('');
    const team = `
      <section class="panel team" aria-label="Your team">
        <div class="eyebrow">On your team</div>
        ${state.mates.map((m) => `<button type="button" class="mate-chip" data-remove="${m}" aria-label="Remove ${esc(heroName(m))}">${heroImg(m)}${esc(heroName(m))}<span class="x" aria-hidden="true">×</span></button>`).join('')}
        ${slots}
        ${state.mates.length ? '<button type="button" class="linkish" data-clear="1">Clear team</button>' : ''}
      </section>`;

    let body = '';
    if (!ev.list.length) {
      body = `<section class="panel why">No team-ups found for ${esc(h.name)} this season.</section>`;
    } else {
      const cards = ev.list.map((o, i) => card(o, i, o === ev.best && (o.hasData || o.active), h)).join('');
      body = `<section class="options">${cards}</section><section class="panel why"><strong>Why:</strong> ${whyText(ev, h)}</section>`;
    }
    body += boostsSection(id);
    main.innerHTML = head + team + (DATA ? body : (DATA_NOTE ? body : `<div class="panel loading">Loading team-up stats…</div>`));
  }

  function card(o, i, best, hero) {
    const tu = o.tu; const p = tu.partner;
    const pn = heroName(p);
    const liftCls = o.rawLift == null ? '' : o.rawLift >= 0 ? 'up' : 'down';
    const liftTxt = o.rawLift == null ? '—' : (o.rawLift >= 0 ? '+' : '') + (o.rawLift * 100).toFixed(1);
    const low = o.hasData && o.m < 50 ? `<div class="low">Only ${fmtInt(o.m)} games together so far, so treat these numbers loosely.</div>` : '';
    const scoreLbl = !o.hasData ? 'no games<br>recorded yet' : o.active ? 'synergy score<br>for your team now' : `synergy score<br>if ${esc(short(p))} joins`;
    return `
      <article class="card ${best ? 'best' : ''}">
        <div class="card-top">
          <div class="eyebrow">Option ${i ? 'B' : 'A'}${tu.isNew ? '<span class="newtag">NEW</span>' : ''}</div>
          ${best ? '<div class="pick">PICK THIS</div>' : ''}
        </div>
        <div class="tu-name">${esc(tu.name)}</div>
        <div class="partner">
          ${heroImg(p)}
          <div class="who">
            <div class="state ${o.active ? 'on' : ''}">${o.active ? `✓ ${esc(pn)} is on your team — ENHANCED` : `Base effect — enhanced with ${esc(pn)}`}</div>
            ${o.active ? '' : `<button type="button" class="add-partner" data-add="${p}">+ ${esc(pn)} is on my team</button>`}
          </div>
        </div>
        <div class="score-row">
          <div class="score ${o.active || !o.hasData ? '' : 'dim'}">${o.score == null ? '—' : o.score}</div>
          <div class="score-lbl">${scoreLbl}</div>
        </div>
        <div class="stats">
          <div class="stat"><div class="k">Paired in</div><div class="v">${pct(o.pairRate)}</div><div class="s">of ${esc(short(hero.id))} games</div></div>
          <div class="stat"><div class="k">Win w/ ${esc(short(p))}</div><div class="v">${pct(o.wr)}</div><div class="s">${fmtInt(o.m)} games</div></div>
          <div class="stat"><div class="k">Vs ${esc(short(hero.id))} avg</div><div class="v ${liftCls}">${liftTxt}</div><div class="s">win-rate points</div></div>
        </div>
        ${low}
        <div class="fx">
          ${tu.base ? `<div><b>Base:</b> ${esc(tu.base)}</div>` : ''}
          ${tu.enh ? `<div><b>Enhanced:</b> ${esc(tu.enh)}</div>` : ''}
        </div>
      </article>`;
  }

  function whyText(ev, h) {
    const b = ev.best;
    if (!DATA) return 'Stats aren’t loaded, so there’s no recommendation yet. You can still compare the two team-ups and their partners.';
    if (!b || !b.hasData) return `There aren’t enough ${esc(h.name)} games with either partner yet to recommend one. Try the previous season or All ranks.`;
    const pn = esc(heroName(b.tu.partner));
    const other = ev.list.find((o) => o !== b);
    if (ev.liveCount === 2) return `Both partners are on your team, so both team-ups are enhanced. <strong>${esc(b.tu.name)}</strong> with ${pn} has the better record (${pct(b.wr)} win rate over ${fmtInt(b.m)} games vs ${pct(other.wr)}).`;
    if (ev.liveCount === 1) {
      const lift = b.rawLift == null ? '' : ` That pairing wins ${pct(b.wr)} of the time, ${b.rawLift >= 0 ? 'above' : 'below'} ${esc(h.name)}’s ${pct(ev.heroWR)} average.`;
      return `${pn} is on your team, so <strong>${esc(b.tu.name)}</strong> gets its enhanced effect.${lift}`;
    }
    return `Neither partner is locked in, so both would run their base effect. The stats only track games where a partner was on the team, so they can’t compare base effects. <strong>${esc(b.tu.name)}</strong> has the bigger payoff if a teammate can swap to <strong>${pn}</strong> (${pct(b.wr)} win rate together over ${fmtInt(b.m)} games).`;
  }

  function boostsSection(id) {
    const list = (BY_PARTNER.get(id) || []).filter((t) => t.anchor !== id);
    if (!list.length) return '';
    const items = list.map((t) => {
      const live = state.mates.includes(t.anchor);
      return `<div class="boost ${live ? 'live' : ''}">${heroImg(t.anchor)}<div><div>${esc(heroName(t.anchor))} · ${esc(t.name)}</div><div class="sub">${live ? 'On your team: tell them to run it' : 'If they’re on your team'}</div></div></div>`;
    }).join('');
    return `<section class="panel boosts"><div class="eyebrow">You power up these team-ups</div><div class="boost-list">${items}</div></section>`;
  }

  function update() {
    save();
    const choice = DATA ? chooseSeason(state.hero) : null;
    renderControls();
    renderStatus(choice);
    renderRoster();
    renderMain(choice);
  }

  // A missing or broken portrait falls back to the hero's initials instead of an empty box.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.dataset.ini) return;
    const span = document.createElement('span');
    span.className = `ini r-${img.dataset.role} ${img.className}`;
    span.setAttribute('aria-hidden', 'true');
    span.textContent = img.dataset.ini;
    img.replaceWith(span);
  }, true);

  // ---------- events ----------
  $('heroGrid').addEventListener('click', (e) => { const b = e.target.closest('.tile'); if (b) pickHero(Number(b.dataset.id)); });
  $('main').addEventListener('click', (e) => {
    const r = e.target.closest('[data-remove]'); if (r) { toggleMate(Number(r.dataset.remove)); return; }
    const a = e.target.closest('[data-add]'); if (a) { const pid = Number(a.dataset.add); if (pid !== state.hero && !state.mates.includes(pid)) toggleMate(pid); return; }
    if (e.target.closest('[data-clear]')) { state.mates = []; update(); }
  });
  $('search').addEventListener('input', (e) => { state.q = e.target.value; renderRoster(); });
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = $('heroGrid').querySelector('.tile'); if (first) { pickHero(Number(first.dataset.id)); e.target.value = ''; state.q = ''; renderRoster(); } }
    if (e.key === 'Escape') { e.target.value = ''; state.q = ''; renderRoster(); }
  });
  $('shareBtn').addEventListener('click', async () => {
    const hs = (id) => (HEROES.get(id) || {}).slug || slugify(heroName(id));
    const u = new URL(location.href.split('?')[0]);
    u.searchParams.set('hero', hs(state.hero));
    if (state.mates.length) u.searchParams.set('team', state.mates.map(hs).join(','));
    try { await navigator.clipboard.writeText(u.toString()); toast('Link copied'); }
    catch (e) { prompt('Copy this link:', u.toString()); }
  });

  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200); }

  // ---------- data loading ----------
  async function load() {
    applyMeta(null);
    const cached = store.get(CACHE_KEY);
    if (cached && cached.seasons) { DATA = cached; DATA_NOTE = 'saved copy'; applyMeta(cached.meta); }
    update();
    if (!CFG.WORKER_URL) { DATA_NOTE = 'no Worker set in config.js'; update(); return; }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(CFG.WORKER_URL.replace(/\/$/, '') + '/stats', { signal: ctl.signal });
      clearTimeout(timer);
      const d = await r.json();
      if (!r.ok || !d.ok || !d.seasons) throw new Error(d.error || 'HTTP ' + r.status);
      DATA = d; DATA_NOTE = ''; aggCache.clear();
      applyMeta(d.meta);
      store.set(CACHE_KEY, d);
    } catch (e) {
      if (DATA) DATA_NOTE = 'saved copy (couldn’t refresh)';
      else {
        DATA_NOTE = 'stats unavailable';
        const b = $('banner'); b.hidden = false; b.className = 'banner err';
        b.textContent = 'Couldn’t load team-up stats right now (' + (e.name === 'AbortError' ? 'timed out' : e.message) + '). The team-ups and partners still show; try again in a minute.';
      }
    }
    update();
  }

  window.SYNERGY_VERSION = APP_VERSION;
  load();
})();
