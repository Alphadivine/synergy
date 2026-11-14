/* Synergy — Marvel Rivals team-up picker
   Pick the hero you're playing, add teammates, and see which of your two team-ups
   to run. Stats: RivalsMeta's public team-up data via the Synergy Worker. */
(() => {
  'use strict';
  const APP_VERSION = '1.2.0';
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
  const SEEN_KEY = 'synergy.seen.v1';
  const CONTROLS = window.SYNERGY_CONTROLS || {};
  const GUIDES = window.SYNERGY_GUIDES || {};
  const KEY_FIX = window.SYNERGY_KEY_FIX || {};
  const PLATFORMS = [['pc', 'PC'], ['ps', 'PlayStation'], ['xbox', 'Xbox']];
  // Portraits from RivalsMeta, used when a hero has no art in heroes/ (e.g. a brand-new hero).
  const rmImg = (id, tall) => `https://rivalsmeta.com/_ipx/w_${tall ? 360 : 240}&q_80/images/heroes/OriginalSkin/img_heroportrait_${id}0010_portrait.png`;
  const WHATS_NEW = [
    { v: '1.2.0', items: [
      'Hero guides: a new Guide tab for every hero with a playstyle summary, tips & combos, team-up advice and the full ability list.',
      'PC, PlayStation or Xbox: pick your platform up top and the guide shows your buttons.',
      'Meta tab: every hero\u2019s win rate and pick rate for your filters, plus who rose and fell since last season.',
      'Star your mains: they get their own row at the top of the hero list.',
      'Heroes without art in the app now borrow a portrait automatically, so new heroes have a picture on day one.',
    ] },
    { v: '1.1.0', items: ['Compact view, squads, who-to-ask-for, heroes in game order, clearer win-rate numbers, Quick Play ignores rank, new logo.'] },
  ];

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
  const KITS = new Map();      // id -> {difficulty, attack, abilities:[[key,name,text,ult]], passives:[[name,text]]}
  function applyMeta(meta) {
    if (meta && Array.isArray(meta.heroes)) {
      for (const [rawId, name, role, difficulty, attack, abilities, passives] of meta.heroes) {
        const id = ALIAS[rawId] || rawId;
        if (Array.isArray(abilities) && !KITS.has(id)) KITS.set(id, { difficulty: difficulty || 0, attack: attack || '', abilities, passives: passives || [] });
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
  const state = Object.assign({ hero: 1023, mates: [], pick: 'me', mode: 'comp', rank: 'all', role: 'all', season: 'auto', compact: false, fxOpen: false, platform: 'pc', tab: 'teamups', view: 'pick', stars: [], metaSort: 'wr', metaRole: 'all' }, saved, { q: '', savingSquad: false });
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
  const save = () => store.set(STATE_KEY, { hero: state.hero, mates: state.mates, pick: state.pick, mode: state.mode, rank: state.rank, role: state.role, season: state.season, compact: state.compact, fxOpen: state.fxOpen, platform: state.platform, tab: state.tab, view: state.view, stars: state.stars, metaSort: state.metaSort, metaRole: state.metaRole });
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
    const remote = rmImg(id, tall);
    const src = h.slug ? `heroes/${h.slug}${tall ? '-tall' : ''}.webp` : remote;
    return `<img class="${cls || ''}" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" data-ini="${esc(initials(h))}" data-role="${esc(role)}"${h.slug ? ` data-alt="${esc(remote)}"` : ''}>`;
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
    segButtons($('platSeg'), PLATFORMS, state.platform, (v) => { state.platform = v; update(); });
    segButtons($('viewSeg'), [['pick', 'Team-up picker'], ['meta', 'Meta']], state.view, (v) => { state.view = v; update(); });
    document.body.classList.toggle('meta-view', state.view === 'meta');
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
    if (state.view === 'meta') {
      st.textContent = `${DATA.seasons[0].label} \u00b7 ${state.mode === 'comp' ? 'Competitive \u00b7 ' + RANKS[state.rank].label : 'Quick Play'} \u00b7 refreshed ${timeAgo(DATA.updated)}${DATA_NOTE ? ' \u00b7 ' + DATA_NOTE : ''}`;
      const bm = $('banner'); bm.hidden = !DATA.stale; bm.className = 'banner'; bm.textContent = DATA.stale ? 'RivalsMeta couldn\u2019t be reached on the last refresh, so these are the most recent saved numbers.' : '';
      return;
    }
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
      const starred = state.stars.filter((id) => HEROES.has(id) && (state.role === 'all' || HEROES.get(id).role === state.role || (ROLE_ORDER[state.role] || []).includes(id)));
      if (starred.length) html += '<div class="role-head star-head">\u2605 MY HEROES</div>' + starred.map((id) => tile(id, partners)).join('');
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
          <div class="hero-name-row"><div class="hero-name">${esc(h.name)}</div><button type="button" class="star ${state.stars.includes(id) ? 'on' : ''}" data-star="${id}" aria-pressed="${state.stars.includes(id)}" aria-label="${state.stars.includes(id) ? 'Unstar' : 'Star'} ${esc(h.name)}" title="Star to pin at the top of the hero list">${state.stars.includes(id) ? '\u2605' : '\u2606'}</button></div>
          <div class="hero-sub">${esc(h.role === 'Flex' ? 'Vanguard / Duelist / Strategist' : h.role)}${ev.heroGames ? ` · ${pct(ev.heroWR)} win rate across ${fmtInt(ev.heroGames)} games` : DATA ? ' · no games recorded yet' : ''}</div>
        </div>
      </section>`;
    const tabs = `<nav class="tabs" aria-label="Hero sections">${[['teamups', 'Team-ups'], ['guide', 'Guide']].map(([v, l]) => `<button type="button" data-tab="${v}" aria-pressed="${state.tab === v}">${l}</button>`).join('')}</nav>`;
    if (state.tab === 'guide') return head + tabs + guideView(id, S, ev);
    let body = '';
    if (!ev.list.length) body = `<section class="panel why">No team-ups found for ${esc(h.name)} this season.</section>`;
    else body = `<section class="options">${ev.list.map((o, i) => card(o, i, o === ev.best, h)).join('')}</section><section class="panel why"><strong>Why:</strong> ${whyText(ev, h)}</section>`;
    if (!DATA && !DATA_NOTE) body = '<div class="panel loading">Loading team-up stats\u2026</div>';
    return head + tabs + teamSection() + body + askSection(S, false) + boostsSection(id);
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

  // ---------- guide ----------
  const CTL = () => CONTROLS[state.platform] || CONTROLS.pc || {};
  const platName = () => (PLATFORMS.find((p) => p[0] === state.platform) || PLATFORMS[0])[1];
  // Swap key words in text ({SPACE} in our tips; "Hold SPACE", "press F" in RivalsMeta's) for this platform's buttons.
  function platformText(t) {
    const c = CTL();
    return String(t || '')
      .replace(/\{(\w+)\}/g, (m, k) => c[k] || k)
      .replace(/(PRESS|HOLD)\s*(LCLICK|SPACE)(?=[a-z])/g, (m, v, k) => `${v} ${c[k] || k} `)
      .replace(/\b(PRESS|HOLD|press|hold|pressing|Press|Hold)\s*(SPACE|LCLICK|RCLICK|SHIFT|CTRL)\b/g, (m, v, k) => `${v} ${c[k] || k}`)
      .replace(/\b(press|pressing|Press)\s+(E|F|Q|SHIFT)\b/g, (m, v, k) => `${v} ${c[k] || k}`)
      .replace(/\bthe (E|F) key\b/g, (m, k) => `${c[k] || k}`);
  }
  function kitFor(id) {
    const kit = KITS.get(id);
    if (!kit) return null;
    const fix = KEY_FIX[id] || {};
    const c = CTL();
    const abilities = [], passives = kit.passives.map(([n, t]) => ({ name: n, text: t }));
    for (const [key, name, text] of kit.abilities) {
      const k = fix[name] || key;
      if (k === 'PASSIVE') { passives.push({ name, text }); continue; }
      const ult = k === 'Q';
      abilities.push({ name, text, ult, label: k !== 'ABILITY' && c[k] != null ? c[k] : 'Ability' });
    }
    abilities.sort((a, b) => a.ult - b.ult);
    return { difficulty: kit.difficulty, attack: kit.attack, abilities, passives };
  }
  function guideView(id, S, ev) {
    const h = HEROES.get(id) || { name: 'Hero', role: 'Duelist' };
    const g = GUIDES[id];
    const kit = kitFor(id);
    const dots = kit && kit.difficulty ? '\u25CF'.repeat(kit.difficulty) + '\u25CB'.repeat(Math.max(0, 5 - kit.difficulty)) : '\u2014';
    const range = kit && kit.attack ? (kit.attack === 'Melee' ? 'Melee' : 'Ranged') : '\u2014';
    const play = `<section class="panel guide-top">
        <div class="guide-play"><div class="eyebrow">Playstyle</div><p>${g ? esc(platformText(g.p)) : 'A written guide for this hero is coming soon. The ability list and team-up advice below are live.'}</p></div>
        <div class="guide-facts">
          <div class="stat"><div class="k">Role</div><div class="v r-${h.role}-text">${esc(h.role === 'Flex' ? 'Any' : h.role)}</div></div>
          <div class="stat"><div class="k">Difficulty</div><div class="v gold">${dots}</div></div>
          <div class="stat"><div class="k">Range</div><div class="v">${range}</div></div>
        </div></section>`;
    const tips = g ? `<section class="panel guide-tips"><div class="sec-head"><div class="eyebrow">Tips &amp; combos</div><div class="hint">Season 11 kit \u00b7 ${esc(platName())} buttons</div></div><ol>${g.t.map((t) => `<li>${esc(platformText(t))}</li>`).join('')}</ol></section>` : '';
    const opts = ev.list.map((o) => `<div class="tu-row ${o === ev.best ? 'best' : ''}">${heroImg(o.tu.partner)}<div><div class="tu-row-name">${esc(o.tu.name)}</div><div class="sub">Run it with ${esc(heroName(o.tu.partner))}${o.hasData ? ` \u00b7 <span class="${liftCls(o.rawLift)}">${pts(o.rawLift)}</span> over ${fmtInt(o.m)} games` : ' \u00b7 no games yet'}</div></div></div>`).join('');
    const ranked = ev.list.filter((o) => o.hasData).sort((a, b) => b.rank - a.rank);
    let advice = '';
    if (ranked.length === 2) {
      const [a, b] = ranked;
      advice = Math.abs(a.adjLift - b.adjLift) < 0.01 ? 'They\u2019re about even, so take whichever partner your team already has.' : `If neither partner is on your team, ask for ${esc(heroName(a.tu.partner))} first: ${esc(a.tu.name)} adds more.`;
    } else if (ranked.length === 1) advice = `Only ${esc(ranked[0].tu.name)} has games recorded so far.`;
    const boostList = (BY_PARTNER.get(id) || []).filter((t) => t.anchor !== id);
    const boosts = boostList.length ? `<p class="hint">You power up: ${boostList.map((t) => `${esc(heroName(t.anchor))}\u2019s ${esc(t.name)}`).join(', ')}.</p>` : `<p class="hint">No other hero\u2019s team-up uses ${esc(h.name)} yet.</p>`;
    const adv = `<section class="panel guide-adv"><div class="eyebrow">Team-up advice</div>${opts || '<p class="hint">No team-ups found.</p>'}${advice ? `<p>${advice}</p>` : ''}${boosts}</section>`;
    let abil;
    if (kit) {
      const rows = kit.abilities.map((a) => `<div class="ab-row"><div><span class="key ${a.ult ? 'ult' : ''}">${esc(a.ult ? a.label + ' \u00b7 Ultimate' : a.label)}</span></div><div><div class="ab-name">${esc(a.name)}</div><div class="ab-text">${esc(platformText(a.text))}</div></div></div>`).join('');
      const pas = kit.passives.map((a) => `<div class="ab-row"><div><span class="key pas">Passive</span></div><div><div class="ab-name">${esc(a.name)}</div><div class="ab-text">${esc(platformText(a.text))}</div></div></div>`).join('');
      const dp = id === 1057 ? '<p class="hint">Deadpool\u2019s kit changes with his role; this list shows his Duelist abilities.</p>' : '';
      abil = `<section class="panel guide-ab"><div class="sec-head"><div class="eyebrow">Abilities</div><div class="hint">Default ${esc(platName())} controls \u00b7 updated daily from RivalsMeta</div></div>${dp}${rows}${pas}</section>`;
    } else {
      abil = `<section class="panel guide-ab"><div class="eyebrow">Abilities</div><p class="hint">${DATA ? 'The ability list will show up once the Synergy Worker is updated (see the setup guide).' : 'Loading abilities\u2026'}</p></section>`;
    }
    return play + `<div class="guide-cols">${tips}${adv}</div>` + abil;
  }

  // ---------- meta ----------
  function renderMeta() {
    if (!DATA || !DATA.seasons) return '<div class="panel loading">Loading stats\u2026</div>';
    const [cur, prev] = DATA.seasons;
    const S = aggregate(cur, state.mode, rankKey());
    const P = prev ? aggregate(prev, state.mode, rankKey()) : null;
    let total = 0; S.h.forEach((v) => { total += v[2]; });
    const matches = total / 12;
    const rows = [];
    S.h.forEach((v, id) => {
      const h = HEROES.get(id); if (!h || !v[0]) return;
      if (state.metaRole !== 'all' && h.role !== state.metaRole) return;
      const wr = v[1] / v[0];
      const pv = P ? P.h.get(id) : null;
      const delta = pv && pv[0] >= 300 && v[0] >= 300 ? wr - pv[1] / pv[0] : null;
      rows.push({ id, h, wr, pick: matches ? v[2] / matches : 0, games: v[2], delta });
    });
    const sorters = { wr: (a, b) => b.wr - a.wr, pick: (a, b) => b.pick - a.pick, delta: (a, b) => (b.delta ?? -9) - (a.delta ?? -9) };
    rows.sort(sorters[state.metaSort] || sorters.wr);
    const movers = rows.filter((r) => r.delta != null);
    const up = movers.filter((r) => r.delta >= 0.0005).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const down = movers.filter((r) => r.delta <= -0.0005).sort((a, b) => a.delta - b.delta).slice(0, 5);
    const mover = (r) => `<button type="button" class="mover" data-open="${r.id}">${heroImg(r.id)}<span>${esc(r.h.name)}</span><span class="${liftCls(r.delta)}">${pts(r.delta)}</span></button>`;
    const sortBtn = (k, l) => `<button type="button" data-msort="${k}" aria-pressed="${state.metaSort === k}">${l}</button>`;
    const roleBtn = (k, l) => `<button type="button" data-mrole="${k}" aria-pressed="${state.metaRole === k}">${l}</button>`;
    const thin = matches < 2000 ? `<p class="hint">${esc(cur.label)} only has about ${fmtInt(Math.round(matches))} matches so far with these filters, so expect these to move.</p>` : '';
    return `
      <section class="meta-head"><div class="eyebrow">Meta \u00b7 ${esc(cur.label)} \u00b7 ${state.mode === 'comp' ? 'Competitive \u00b7 ' + RANKS[state.rank].label : 'Quick Play'}</div><div class="hero-name">Hero win rates</div></section>
      ${thin}
      ${P ? `<div class="movers"><section class="panel"><div class="eyebrow">Rising since ${esc(prev.label)}</div><div class="mover-list">${up.map(mover).join('') || '<span class="hint">Not enough games yet.</span>'}</div></section><section class="panel"><div class="eyebrow">Falling since ${esc(prev.label)}</div><div class="mover-list">${down.map(mover).join('') || '<span class="hint">Not enough games yet.</span>'}</div></section></div>` : ''}
      <section class="panel meta-table">
        <div class="meta-tools"><div class="chips">${roleBtn('all', 'All')}${ROLES.map((r) => roleBtn(r, r)).join('')}</div><div class="chips">${sortBtn('wr', 'Win rate')}${sortBtn('pick', 'Pick rate')}${P ? sortBtn('delta', 'Change') : ''}</div></div>
        <div class="mt-row mt-headrow"><span>#</span><span>Hero</span><span>Win rate</span><span>Pick rate</span><span>${P ? 'vs ' + esc(prev.label) : ''}</span></div>
        ${rows.map((r, i) => `<button type="button" class="mt-row" data-open="${r.id}"><span class="mt-n">${i + 1}</span><span class="mt-hero">${heroImg(r.id)}<span>${esc(r.h.name)}${state.stars.includes(r.id) ? ' <span class="gold">\u2605</span>' : ''}</span></span><span>${pct(r.wr)}</span><span>${pct(r.pick)}</span><span class="${liftCls(r.delta)}">${r.delta == null ? '' : pts(r.delta)}</span></button>`).join('')}
        <p class="hint">Win rate leaves out mirror matches. Pick rate is the share of matches the hero appears in. Tap a hero to open them.</p>
      </section>`;
  }

  // ---------- how-to + what's new ----------
  function openModal(kind) {
    const how = `<h2>How to use Synergy</h2><ol class="how">
      <li><strong>Tap the hero you locked in.</strong> Star your mains (\u2606 next to the name) to pin them at the top of the list.</li>
      <li><strong>Switch to Add teammates</strong> and tap who\u2019s on your team. Save your usual group as a squad.</li>
      <li><strong>The gold card is your pick.</strong> The big number is how many win-rate points that pairing adds over your hero\u2019s average.</li>
      <li><strong>Guide tab:</strong> playstyle, tips, team-up advice and abilities. Set PC, PlayStation or Xbox up top to see your buttons.</li>
      <li><strong>Meta:</strong> every hero\u2019s win and pick rate, and who\u2019s rising or falling.</li>
      <li><strong>Compact view</strong> is made for a second monitor; <strong>Copy link</strong> shares your hero and team.</li></ol>`;
    const news = `<h2>What\u2019s new</h2>${WHATS_NEW.map((w) => `<h3>Version ${esc(w.v)}</h3><ul>${w.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}`;
    $('modalBody').innerHTML = kind === 'news' ? news : how;
    $('modalSwap').textContent = kind === 'news' ? 'How to use' : 'What\u2019s new';
    $('modalSwap').dataset.kind = kind === 'news' ? 'how' : 'news';
    $('modal').hidden = false; $('modalClose').focus();
    store.set(SEEN_KEY, APP_VERSION);
  }
  function closeModal() { $('modal').hidden = true; }

  function update() {
    save();
    const choice = DATA ? chooseSeason(state.hero) : null;
    renderControls();
    renderStatus(choice);
    if (!state.compact && state.view !== 'meta') renderRoster();
    $('main').innerHTML = state.view === 'meta' ? renderMeta() : state.compact ? renderCompact(choice) : renderFull(choice);
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
    if (img.dataset.alt) { const alt = img.dataset.alt; delete img.dataset.alt; img.src = alt; return; }
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
    if ((el = t('[data-tab]'))) { state.tab = el.dataset.tab; return update(); }
    if ((el = t('[data-star]'))) { const sid = Number(el.dataset.star); state.stars = state.stars.includes(sid) ? state.stars.filter((x) => x !== sid) : state.stars.concat(sid); return update(); }
    if ((el = t('[data-msort]'))) { state.metaSort = el.dataset.msort; return update(); }
    if ((el = t('[data-mrole]'))) { state.metaRole = el.dataset.mrole; return update(); }
    if ((el = t('[data-open]'))) { state.view = 'pick'; state.compact = false; return setHero(Number(el.dataset.open)); }
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
  $('compactBtn').addEventListener('click', () => { state.compact = !state.compact; if (state.compact) state.view = 'pick'; update(); });
  $('helpBtn').addEventListener('click', () => openModal('how'));
  $('modalClose').addEventListener('click', closeModal);
  $('modalSwap').addEventListener('click', (e) => openModal(e.target.dataset.kind));
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
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
  const seen = store.get(SEEN_KEY);
  if (!seen && !saved.hero) openModal('how');
  else if (seen !== APP_VERSION) openModal('news');
})();
