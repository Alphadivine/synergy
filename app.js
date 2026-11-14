/* Synergy — Marvel Rivals team-up picker
   Pick the hero you're playing, add teammates, and see which of your two team-ups
   to run. Stats: RivalsMeta's public team-up data via the Synergy Worker. */
(() => {
  'use strict';
  const APP_VERSION = '1.1.0';
  const CFG = window.SYNERGY_CONFIG || {};
  const K = CFG.SHRINK_GAMES || 150;
  const MIN_PAIR = CFG.MIN_PAIR_GAMES || 300;
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
  const SQUADS_KEY = 'synergy.squads.v1';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x, d = 1) => (x == null || isNaN(x) ? '—' : (x * 100).toFixed(d) + '%');
  const pts = (x) => (x == null || isNaN(x) ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1));
  const fmtInt = (n) => (n || 0).toLocaleString('en-US');

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
  };

  // ---------- heroes + team-ups ----------
  const ALIAS = window.SYNERGY_HERO_ALIASES || {};
  const HEROES = new Map();   // id -> {id, name, role, slug}
  for (const [id, name, role, slug] of window.SYNERGY_HEROES || []) HEROES.set(id, { id, name, role, slug });
  const ROLE_ORDER = window.SYNERGY_ROLE_ORDER || {};
  function slugify(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  const bySlug = () => { const m = new Map(); HEROES.forEach((h) => { if (h.slug) m.set(h.slug, h.id); m.set(slugify(h.name), h.id); }); return m; };

  // Heroes for one role, in game order; heroes the order list doesn't know go at the end.
  function roleList(role) {
    const listed = (ROLE_ORDER[role] || []).filter((id) => HEROES.has(id));
    const extra = [...HEROES.values()].filter((h) => h.role === role && !listed.includes(h.id)).map((h) => h.id);
    return listed.concat(extra);
  }

  let TEAMUPS = new Map(), BY_ANCHOR = new Map(), BY_PARTNER = new Map();
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
        if (!HEROES.has(id)) HEROES.set(id, { id, name: String(name).replace(/\s*\(.*\)$/, ''), role: ROLE_FROM_SITE[role] || 'Duelist', slug: null });
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
  const state = Object.assign({ hero: 1023, mates: [], pick: 'me', mode: 'comp', rank: 'all', role: 'all', season: 'auto', compact: false, fxOpen: false }, saved, { q: '', savingSquad: false });
  let squads = store.get(SQUADS_KEY) || [];
  (function readUrl() {
    const p = new URLSearchParams(location.search);
    const map = bySlug();
    const h = p.get('hero');
    if (h && map.has(h)) state.hero = map.get(h);
    const t = p.get('team');
    if (t != null) state.mates = t.split(',').map((s) => map.get(s)).filter((id) => id && id !== state.hero).slice(0, 5);
    if (p.get('view') === 'compact') state.compact = true;
  })();
  const save = () => store.set(STATE_KEY, { hero: state.hero, mates: state.mates, pick: state.pick, mode: state.mode, rank: state.rank, role: state.role, season: state.season, compact: state.compact, fxOpen: state.fxOpen });
  // Quick Play has no ranked matchmaking, so rank filters don't apply there.
  const rankKey = () => (state.mode === 'qp' ? 'all' : state.rank);

  // ---------- stats ----------
  let DATA = null, DATA_NOTE = '';
  const aggCache = new Map();
  function aggregate(season, mode, rk) {
    const key = season.id + '|' + mode + '|' + rk;
    if (aggCache.has(key)) return aggCache.get(key);
    const ranks = (season.modes && season.modes[mode]) || {};
    const want = RANKS[rk].keys;
    const h = new Map(); const t = new Map();
    for (const [r, v] of Object.entries(ranks)) {
      if (want && !want.includes(r)) continue;
      for (const [rawId, x] of Object.entries(v.h || {})) {
        const id = ALIAS[rawId] || Number(rawId);
        const cur = h.get(id) || [0, 0, 0];
        cur[0] += x[0] || 0; cur[1] += x[1] || 0; cur[2] += x[2] || 0;
        h.set(id, cur);
      }
      for (const [id, x] of Object.entries(v.t || {})) {
        const cur = t.get(Number(id)) || [0, 0];
        cur[0] += x[0] || 0; cur[1] += x[1] || 0;
        t.set(Number(id), cur);
      }
    }
    const out = { h, t, season };
    aggCache.set(key, out);
    return out;
  }
  const pairGames = (S, heroId) => (BY_ANCHOR.get(heroId) || []).slice(0, 2).reduce((n, tu) => n + ((S.t.get(tu.id) || [0])[0]), 0);

  function chooseSeason(heroId) {
    if (!DATA || !DATA.seasons || !DATA.seasons.length) return { S: null };
    const [cur, prev] = DATA.seasons;
    if (state.season === 'prev' && prev) return { S: aggregate(prev, state.mode, rankKey()) };
    const now = aggregate(cur, state.mode, rankKey());
    if (state.season === 'cur' || !prev) return { S: now };
    const curPairs = pairGames(now, heroId);
    if (curPairs >= MIN_PAIR) return { S: now };
    const old = aggregate(prev, state.mode, rankKey());
    if (pairGames(old, heroId) > curPairs) return { S: old, fellBack: true, curPairs };
    return { S: now, thin: true, curPairs };
  }

  function confidence(m) {
    if (m >= 1000) return { key: 'high', label: 'High confidence' };
    if (m >= 300) return { key: 'med', label: 'Medium confidence' };
    if (m >= 50) return { key: 'low', label: 'Low confidence' };
    return { key: 'vlow', label: m ? 'Very few games' : 'No games yet' };
  }

  // Stats for one team-up (anchor = the hero who runs it).
  function evalTu(tu, S) {
    const hs = S ? S.h.get(tu.anchor) : null;
    const heroWR = hs && hs[0] ? hs[1] / hs[0] : null;
    const heroGames = hs ? hs[2] : 0;
    const base = heroWR == null ? 0.5 : heroWR;
    const st = S ? (S.t.get(tu.id) || [0, 0]) : [0, 0];
    const m = st[0], w = st[1];
    const wr = m ? w / m : null;
    const adjLift = (w + K * base) / (m + K) - base;   // pulled toward the hero average when games are few
    const rawLift = wr == null || heroWR == null ? null : wr - heroWR;
    const pairRate = heroGames ? m / heroGames : null;
    const hasData = !!S && m > 0;
    // Ranking value: adjusted win-rate gain in points, plus up to +0.5 for popular pairings.
    const rank = hasData ? adjLift * 100 + Math.min(0.5, (pairRate || 0) * 5) : -999;
    return { tu, m, w, wr, heroWR, heroGames, adjLift, rawLift, pairRate, hasData, rank, conf: confidence(m) };
  }

  function evaluate(heroId, S) {
    const list = (BY_ANCHOR.get(heroId) || []).slice(0, 2).map((tu) => Object.assign(evalTu(tu, S), { active: state.mates.includes(tu.partner) }));
    const live = list.filter((o) => o.active);
    const pool = live.length ? live : list;
    let best = null;
    for (const o of pool) if (!best || o.rank > best.rank) best = o;
    if (best && !best.hasData && !best.active) best = null;
    const hs = S ? S.h.get(heroId) : null;
    return { list, best, liveCount: live.length, heroWR: hs && hs[0] ? hs[1] / hs[0] : null, heroGames: hs ? hs[2] : 0 };
  }

  // Who should a teammate swap to? Scores every hero not already in the lobby by how much
  // they'd add: your team-up with them, plus teammates' team-ups they'd enhance.
  function askFor(S) {
    if (!S) return [];
    const inLobby = new Set([state.hero, ...state.mates]);
    const cand = new Map();
    for (const anchor of [state.hero, ...state.mates]) {
      for (const tu of (BY_ANCHOR.get(anchor) || []).slice(0, 2)) {
        const p = tu.partner;
        if (p == null || inLobby.has(p) || !HEROES.has(p)) continue;
        const e = evalTu(tu, S);
        if (!e.hasData || e.adjLift <= 0) continue;
        const c = cand.get(p) || { id: p, per: new Map() };
        const prev = c.per.get(anchor);
        if (!prev || e.adjLift > prev.adjLift) c.per.set(anchor, e);   // a teammate runs one team-up, so keep their best
        cand.set(p, c);
      }
    }
    return [...cand.values()].map((c) => {
      const parts = [...c.per.values()].sort((a, b) => (b.tu.anchor === state.hero) - (a.tu.anchor === state.hero) || b.adjLift - a.adjLift);
      return { id: c.id, gain: parts.reduce((n, e) => n + e.adjLift, 0), parts };
    }).sort((a, b) => b.gain - a.gain).slice(0, 4);
  }

  // ---------- rendering helpers ----------
  const heroName = (id) => (HEROES.get(id) || { name: 'Hero ' + id }).name;
  const SHORT = { 'Doctor Strange': 'Strange', 'Captain America': 'Cap', 'Jeff the Land Shark': 'Jeff', 'Cloak & Dagger': 'C&D', 'Mister Fantastic': 'Mr. Fantastic', 'Devil Dinosaur': 'Devil Dino', 'Elsa Bloodstone': 'Elsa', 'Rocket Raccoon': 'Rocket', 'Peni Parker': 'Peni', 'Adam Warlock': 'Adam', 'Invisible Woman': 'Sue Storm', 'Scarlet Witch': 'Wanda', 'Winter Soldier': 'Bucky', 'Black Panther': 'Panther', 'Black Widow': 'Widow' };
  const short = (id) => { const n = heroName(id); if (SHORT[n]) return SHORT[n]; const m = n.replace(/^The /, ''); return m.length <= 13 ? m : m.split(' ')[0]; };
  function initials(h) { return h.name.replace(/^The /, '').split(/[\s&-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }
  function heroImg(id, cls, tall) {
    const h = HEROES.get(id);
    if (!h) return `<span class="ini r-Duelist ${cls || ''}" aria-hidden="true">?</span>`;
    const role = h.role === 'Flex' ? 'Flex' : h.role;
    if (h.slug) return `<img class="${cls || ''}" src="heroes/${h.slug}${tall ? '-tall' : ''}.webp" alt="" loading="lazy" data-ini="${esc(initials(h))}" data-role="${esc(role)}">`;
    return `<span class="ini r-${role} ${cls || ''}" aria-hidden="true">${esc(initials(h))}</span>`;
  }
  const confChip = (c) => `<span class="conf c-${c.key}">${esc(c.label)}</span>`;
  const liftCls = (x) => (x == null ? '' : x >= 0 ? 'up' : 'down');

  function segButtons(el, items, current, onPick) {
    el.innerHTML = items.map(([v, label, disabled, title]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${!disabled && v === current}" ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${esc(label)}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) onPick(b.dataset.v); };
  }
  function timeAgo(iso) {
    const t = Date.parse(iso); if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 2) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    return h < 48 ? h + 'h ago' : Math.round(h / 24) + ' days ago';
  }

  // ---------- render: header + roster ----------
  function renderControls() {
    segButtons($('modeSeg'), [['comp', 'Competitive'], ['qp', 'Quick Play']], state.mode, (v) => { state.mode = v; update(); });
    const qp = state.mode === 'qp';
    segButtons($('rankSeg'), Object.entries(RANKS).map(([k, r]) => [k, r.label, qp && k !== 'all', qp ? 'Quick Play isn’t ranked, so all ranks are combined' : '']), qp ? 'all' : state.rank, (v) => { state.rank = v; update(); });
    $('rankSeg').title = qp ? 'Quick Play isn’t ranked, so all ranks are combined' : '';
    const s = DATA && DATA.seasons ? DATA.seasons : [];
    const items = [['auto', 'Auto']];
    if (s[0]) items.push(['cur', s[0].label]);
    if (s[1]) items.push(['prev', s[1].label]);
    segButtons($('seasonSeg'), items, state.season, (v) => { state.season = v; update(); });
    const cb = $('compactBtn');
    cb.setAttribute('aria-pressed', String(state.compact));
    cb.textContent = state.compact ? 'Full view' : 'Compact view';
    document.body.classList.toggle('compact', state.compact);
    segButtons($('pickSeg'), [['me', 'I’m playing'], ['team', 'Add teammates']], state.pick, (v) => { state.pick = v; update(); });
    $('pickHint').textContent = state.pick === 'me' ? 'Tap the hero you locked in.' : 'Tap who your teammates picked (up to 5). Tap again to remove.';
    const rc = $('roleChips');
    rc.innerHTML = [['all', 'All'], ...ROLES.map((r) => [r, r])].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${state.role === v}">${l}</button>`).join('');
    rc.onclick = (e) => { const b = e.target.closest('button'); if (b) { state.role = b.dataset.v; update(); } };
  }

  function renderStatus(choice) {
    const st = $('status');
    if (!DATA) { st.textContent = DATA_NOTE || 'Loading stats…'; return; }
    const S = choice && choice.S;
    st.textContent = `${S ? S.season.label : ''} · ${state.mode === 'comp' ? 'Competitive · ' + RANKS[state.rank].label : 'Quick Play'} · refreshed ${timeAgo(DATA.updated)}${DATA_NOTE ? ' · ' + DATA_NOTE : ''}`;
    const b = $('banner');
    const msgs = [];
    if (DATA.stale) msgs.push('RivalsMeta couldn’t be reached on the last refresh, so these are the most recent saved numbers.');
    if (choice && choice.fellBack) {
      const cur = DATA.seasons[0];
      msgs.push(`${esc(cur.label)} only has ${fmtInt(choice.curPairs)} games with ${esc(heroName(state.hero))}’s team-up partners so far, so you’re seeing <strong>${esc(S.season.label)}</strong> numbers. Pick <strong>${esc(cur.label)}</strong> up top to see the new season anyway.`);
    }
    if (choice && choice.thin && state.season === 'auto') msgs.push(`${esc(S.season.label)} only has ${fmtInt(choice.curPairs)} games with ${esc(heroName(state.hero))}’s team-up partners so far, and last season has nothing to compare, so these early numbers will move a lot.`);
    b.hidden = !msgs.length; b.className = 'banner'; b.innerHTML = msgs.join('<br>');
  }

  function matchRank(h, q) {
    if (!q) return 0;
    const n = h.name.toLowerCase();
    if (n.startsWith(q) || n.replace(/^the /, '').startsWith(q)) return 0;
    if (n.split(/[\s&-]+/).some((w) => w.startsWith(q))) return 1;
    return 2;
  }
  function searchHeroes(q) {
    q = q.trim().toLowerCase();
    const seen = new Set(); const out = [];
    for (const r of ROLES) for (const id of roleList(r)) if (!seen.has(id)) { seen.add(id); out.push(HEROES.get(id)); }
    return out.filter((h) => h.name.toLowerCase().includes(q)).sort((a, b) => matchRank(a, q) - matchRank(b, q));
  }

  function tile(id, partners) {
    const h = HEROES.get(id);
    const isMe = id === state.hero, isMate = state.mates.includes(id);
    const tag = isMe ? 'YOU' : isMate ? 'TEAM' : partners.has(id) ? 'PARTNER' : '';
    return `<button type="button" class="tile ${isMe ? 'on' : isMate ? 'mate' : ''}" data-id="${id}" aria-label="${esc(h.name)}${tag ? ' (' + tag.toLowerCase() + ')' : ''}" aria-pressed="${state.pick === 'me' ? isMe : isMate}">${heroImg(id)}<span class="nm">${esc(h.name)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</button>`;
  }
  function renderRoster() {
    const q = state.q.trim().toLowerCase();
    const partners = new Set((BY_ANCHOR.get(state.hero) || []).map((t) => t.partner));
    let html = '';
    if (q) {
      const hits = searchHeroes(q).filter((h) => state.role === 'all' || h.role === state.role || (ROLE_ORDER[state.role] || []).includes(h.id));
      html = hits.length ? hits.map((h) => tile(h.id, partners)).join('') : '<div class="empty">No heroes match.</div>';
    } else {
      for (const r of (state.role === 'all' ? ROLES : [state.role])) {
        if (state.role === 'all') html += `<div class="role-head r-${r}-text">${r.toUpperCase()}S</div>`;
        html += roleList(r).map((id) => tile(id, partners)).join('');
      }
    }
    $('heroGrid').innerHTML = html;
  }

  // ---------- render: main ----------
  function teamSection() {
    const slots = Array.from({ length: Math.max(0, 5 - state.mates.length) }, () => '<div class="slot">empty</div>').join('');
    const squadChips = squads.map((s, i) => `<span class="squad"><button type="button" class="squad-load" data-squad="${i}" title="${esc(s.mates.map(heroName).join(', '))}">${esc(s.name)}</button><button type="button" class="squad-del" data-squad-del="${i}" aria-label="Delete squad ${esc(s.name)}">×</button></span>`).join('');
    const saver = state.savingSquad
      ? `<span class="squad-form"><label class="sr" for="squadName">Squad name</label><input id="squadName" maxlength="24" placeholder="Squad name" autocomplete="off"><button type="button" class="btn small" data-squad-save="1">Save</button><button type="button" class="linkish" data-squad-cancel="1">Cancel</button></span>`
      : (state.mates.length ? '<button type="button" class="linkish" data-squad-new="1">Save as squad</button>' : '');
    return `
      <section class="panel team" aria-label="Your team">
        <div class="team-row">
          <div class="eyebrow">On your team</div>
          ${state.mates.map((m) => `<button type="button" class="mate-chip" data-remove="${m}" aria-label="Remove ${esc(heroName(m))}">${heroImg(m)}${esc(heroName(m))}<span class="x" aria-hidden="true">×</span></button>`).join('')}
          ${slots}
          ${state.mates.length ? '<button type="button" class="linkish" data-clear="1">Clear team</button>' : ''}
        </div>
        ${squads.length || state.mates.length ? `<div class="team-row squads"><div class="eyebrow">Squads</div>${squadChips || '<span class="hint">Save your usual group to load it in one tap.</span>'}${saver}</div>` : ''}
      </section>`;
  }

  function card(o, i, best, hero) {
    const tu = o.tu, p = tu.partner, pn = heroName(p);
    const fx = tu.base || tu.enh ? `<details class="fx" ${state.fxOpen ? 'open' : ''}><summary>Effects</summary>${tu.base ? `<div><b>Base:</b> ${esc(tu.base)}</div>` : ''}${tu.enh ? `<div><b>Enhanced with ${esc(short(p))}:</b> ${esc(tu.enh)}</div>` : ''}</details>` : '';
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
        <div class="lift-row">
          <div class="lift ${liftCls(o.rawLift)} ${o.active || !o.hasData ? '' : 'dim'}">${o.hasData ? pts(o.rawLift) : '—'}</div>
          <div class="lift-lbl">win-rate points vs ${esc(short(hero.id))}’s average<br>when ${esc(short(p))} is on the team</div>
        </div>
        <div>${confChip(o.conf)}</div>
        <div class="stats">
          <div class="stat"><div class="k">Win w/ ${esc(short(p))}</div><div class="v">${pct(o.wr)}</div><div class="s">vs ${pct(o.heroWR)} avg</div></div>
          <div class="stat"><div class="k">Games together</div><div class="v">${fmtInt(o.m)}</div><div class="s">this filter</div></div>
          <div class="stat"><div class="k">Paired in</div><div class="v">${pct(o.pairRate)}</div><div class="s">of ${esc(short(hero.id))} games</div></div>
        </div>
        ${fx}
      </article>`;
  }

  function whyText(ev, h) {
    const b = ev.best;
    if (!DATA) return 'Stats aren’t loaded, so there’s no recommendation yet. You can still compare the two team-ups and their partners.';
    if (!b) return `There aren’t enough ${esc(h.name)} games with either partner yet to recommend one. Try ${state.mode === 'comp' ? 'All ranks or ' : ''}the previous season.`;
    const pn = esc(heroName(b.tu.partner));
    const other = ev.list.find((o) => o !== b);
    let s;
    if (ev.liveCount === 2) s = `Both partners are on your team, so both team-ups are enhanced. <strong>${esc(b.tu.name)}</strong> with ${pn} has the better record (${pct(b.wr)} over ${fmtInt(b.m)} games vs ${pct(other.wr)}).`;
    else if (ev.liveCount === 1) s = `${pn} is on your team, so <strong>${esc(b.tu.name)}</strong> gets its enhanced effect. Together they win ${pct(b.wr)}, ${b.rawLift >= 0 ? 'above' : 'below'} ${esc(h.name)}’s ${pct(ev.heroWR)} average.`;
    else s = `Neither partner is locked in, so both would run their base effect. The stats only count games where a partner was on the team, so they can’t compare base effects. <strong>${esc(b.tu.name)}</strong> pays off more if a teammate can swap to <strong>${pn}</strong>.`;
    if (other && other.hasData && ev.liveCount !== 1 && other.rawLift > b.rawLift && other.m < b.m) s += ` ${esc(other.tu.name)} shows a bigger number, but over only ${fmtInt(other.m)} games, so it counts for less.`;
    return s;
  }

  function askSection(S, compact) {
    const list = askFor(S);
    if (!list.length) return '';
    const rows = (compact ? list.slice(0, 1) : list).map((c) => {
      const parts = c.parts.map((e) => `${e.tu.anchor === state.hero ? 'your' : esc(short(e.tu.anchor)) + '’s'} ${esc(e.tu.name)} (${pts(e.adjLift)})`).join(', ');
      return `<button type="button" class="ask" data-add="${c.id}" title="Add ${esc(heroName(c.id))} to your team">${heroImg(c.id)}<div class="ask-txt"><div><strong>${esc(heroName(c.id))}</strong> <span class="up">${pts(c.gain)}</span></div><div class="sub">Enhances ${parts}</div></div></button>`;
    }).join('');
    return `<section class="panel asks"><div class="eyebrow">Best hero to ask a teammate to swap to</div><div class="ask-list">${rows}</div><div class="hint">Adjusted win-rate points added across your team. Tap one if they swap.</div></section>`;
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

  function renderFull(choice) {
    const id = state.hero;
    const h = HEROES.get(id) || { id, name: 'Hero', role: 'Duelist' };
    const S = choice ? choice.S : null;
    const ev = evaluate(id, S);
    const head = `
      <section class="hero-head">
        ${heroImg(id, 'hero-pic', true)}
        <div class="hero-meta">
          <div class="eyebrow">You are playing</div>
          <div class="hero-name">${esc(h.name)}</div>
          <div class="hero-sub">${esc(h.role === 'Flex' ? 'Vanguard / Duelist / Strategist' : h.role)}${ev.heroGames ? ` · ${pct(ev.heroWR)} win rate across ${fmtInt(ev.heroGames)} games` : DATA ? ' · no games recorded yet' : ''}</div>
        </div>
      </section>`;
    let body = '';
    if (!ev.list.length) body = `<section class="panel why">No team-ups found for ${esc(h.name)} this season.</section>`;
    else body = `<section class="options">${ev.list.map((o, i) => card(o, i, o === ev.best, h)).join('')}</section><section class="panel why"><strong>Why:</strong> ${whyText(ev, h)}</section>`;
    if (!DATA && !DATA_NOTE) body = '<div class="panel loading">Loading team-up stats…</div>';
    return head + teamSection() + body + askSection(S, false) + boostsSection(id);
  }

  function renderCompact(choice) {
    const id = state.hero;
    const h = HEROES.get(id) || { id, name: 'Hero', role: 'Duelist' };
    const S = choice ? choice.S : null;
    const ev = evaluate(id, S);
    const b = ev.best || ev.list[0];
    const other = ev.list.find((o) => o !== b);
    const top = `
      <section class="cmp-top">
        ${heroImg(id, 'cmp-pic')}
        <div class="cmp-meta"><div class="eyebrow">Playing</div><div class="cmp-hero">${esc(h.name)}</div></div>
        <div class="cmp-search"><label class="sr" for="cmpSearch">Switch hero</label><input id="cmpSearch" type="search" placeholder="Switch hero: type + Enter" autocomplete="off"><div class="cmp-hits" id="cmpHits"></div></div>
      </section>`;
    if (!b) return top + teamSection() + '<div class="panel loading">No team-ups found.</div>';
    const p = b.tu.partner;
    const pick = `
      <section class="cmp-pick ${ev.best ? 'best' : ''}">
        <div class="card-top">${ev.best ? '<div class="pick">PICK THIS</div>' : '<div class="eyebrow">No clear pick yet</div>'}</div>
        <div class="cmp-name">${esc(b.tu.name)}</div>
        <div class="partner">${heroImg(p)}<div class="state ${b.active ? 'on' : ''}">${b.active ? `✓ ${esc(heroName(p))} is on your team — ENHANCED` : `Ask for ${esc(heroName(p))} to enhance it`}</div></div>
        <div class="lift-row"><div class="lift big ${liftCls(b.rawLift)}">${b.hasData ? pts(b.rawLift) : '—'}</div><div class="lift-lbl">win-rate points vs avg ${b.hasData ? `· ${pct(b.wr)} over ${fmtInt(b.m)} games` : ''}<br>${confChip(b.conf)}</div></div>
      </section>`;
    const alt = other ? `<section class="panel cmp-alt">Option ${ev.list.indexOf(other) ? 'B' : 'A'}: <strong>${esc(other.tu.name)}</strong> · with ${esc(heroName(other.tu.partner))}${other.active ? ' (on team)' : ''} · <span class="${liftCls(other.rawLift)}">${other.hasData ? pts(other.rawLift) : '—'}</span> · ${esc(other.conf.label)}</section>` : '';
    return top + pick + alt + teamSection() + askSection(S, true);
  }

  function update() {
    save();
    const choice = DATA ? chooseSeason(state.hero) : null;
    renderControls();
    renderStatus(choice);
    if (!state.compact) renderRoster();
    $('main').innerHTML = state.compact ? renderCompact(choice) : renderFull(choice);
    if (state.savingSquad) { const i = $('squadName'); if (i) i.focus(); }
  }

  // ---------- actions ----------
  function setHero(id) { state.hero = id; state.mates = state.mates.filter((m) => m !== id); update(); }
  function toggleMate(id) {
    if (id === state.hero) return;
    if (state.mates.includes(id)) state.mates = state.mates.filter((m) => m !== id);
    else if (state.mates.length < 5) state.mates = state.mates.concat(id);
    else { toast('Your team is full: remove someone first'); return; }
    update();
  }
  function saveSquad() {
    const i = $('squadName');
    const name = (i && i.value.trim()) || 'Squad ' + (squads.length + 1);
    squads = squads.filter((s) => s.name !== name).concat({ name, mates: state.mates.slice() }).slice(-8);
    store.set(SQUADS_KEY, squads);
    state.savingSquad = false;
    toast('Saved ' + name);
    update();
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
  $('heroGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.tile'); if (!b) return;
    const id = Number(b.dataset.id);
    if (state.pick === 'me') setHero(id); else toggleMate(id);
  });
  $('main').addEventListener('click', (e) => {
    const t = (sel) => e.target.closest(sel);
    let el;
    if ((el = t('[data-remove]'))) return toggleMate(Number(el.dataset.remove));
    if ((el = t('[data-add]'))) { const pid = Number(el.dataset.add); if (!state.mates.includes(pid)) toggleMate(pid); return; }
    if (t('[data-clear]')) { state.mates = []; return update(); }
    if ((el = t('[data-squad]'))) { const s = squads[Number(el.dataset.squad)]; if (s) { state.mates = s.mates.filter((m) => m !== state.hero && HEROES.has(m)).slice(0, 5); toast('Loaded ' + s.name); update(); } return; }
    if ((el = t('[data-squad-del]'))) { squads.splice(Number(el.dataset.squadDel), 1); store.set(SQUADS_KEY, squads); return update(); }
    if (t('[data-squad-new]')) { state.savingSquad = true; return update(); }
    if (t('[data-squad-cancel]')) { state.savingSquad = false; return update(); }
    if (t('[data-squad-save]')) return saveSquad();
    if ((el = t('[data-hit]'))) return setHero(Number(el.dataset.hit));
  });
  $('main').addEventListener('toggle', (e) => {
    if (e.target.classList && e.target.classList.contains('fx')) {
      state.fxOpen = e.target.open; save();
      document.querySelectorAll('details.fx').forEach((d) => { if (d !== e.target) d.open = state.fxOpen; });
    }
  }, true);
  $('main').addEventListener('keydown', (e) => {
    if (e.target.id === 'squadName') { if (e.key === 'Enter') saveSquad(); if (e.key === 'Escape') { state.savingSquad = false; update(); } }
    if (e.target.id === 'cmpSearch') {
      const hits = searchHeroes(e.target.value);
      if (e.key === 'Enter' && e.target.value.trim() && hits[0]) setHero(hits[0].id);
      if (e.key === 'Escape') { e.target.value = ''; $('cmpHits').innerHTML = ''; }
    }
  });
  $('main').addEventListener('input', (e) => {
    if (e.target.id !== 'cmpSearch') return;
    const q = e.target.value.trim();
    $('cmpHits').innerHTML = q ? searchHeroes(q).slice(0, 6).map((h) => `<button type="button" data-hit="${h.id}">${heroImg(h.id)}${esc(h.name)}</button>`).join('') : '';
  });
  $('search').addEventListener('input', (e) => { state.q = e.target.value; renderRoster(); });
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = $('heroGrid').querySelector('.tile');
      if (first) { const id = Number(first.dataset.id); e.target.value = ''; state.q = ''; if (state.pick === 'me') setHero(id); else toggleMate(id); }
    }
    if (e.key === 'Escape') { e.target.value = ''; state.q = ''; renderRoster(); }
  });
  $('compactBtn').addEventListener('click', () => { state.compact = !state.compact; update(); });
  $('shareBtn').addEventListener('click', async () => {
    const hs = (id) => (HEROES.get(id) || {}).slug || slugify(heroName(id));
    const u = new URL(location.href.split('?')[0]);
    u.searchParams.set('hero', hs(state.hero));
    if (state.mates.length) u.searchParams.set('team', state.mates.map(hs).join(','));
    try { await navigator.clipboard.writeText(u.toString()); toast('Link copied'); }
    catch (err) { prompt('Copy this link:', u.toString()); }
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
