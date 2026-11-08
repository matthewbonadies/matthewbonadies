/* Scores: a live sports scoreboard for the foldable iPhone.
 *
 * Folded (phone-width) screen: a list of games; tapping one slides in the details.
 * Unfolded (tablet-width) screen: the list and the details sit side by side.
 *
 * Data comes from ESPN's public scoreboard JSON (unofficial, no key needed).
 */
(() => {
  'use strict';

  const API = 'https://site.api.espn.com/apis/site/v2/sports/';

  const LEAGUES = [
    { id: 'nfl', name: 'NFL', path: 'football/nfl', periods: 4, prefix: 'Q' },
    { id: 'nba', name: 'NBA', path: 'basketball/nba', periods: 4, prefix: 'Q' },
    { id: 'mlb', name: 'MLB', path: 'baseball/mlb', periods: 9, prefix: '' },
    { id: 'nhl', name: 'NHL', path: 'hockey/nhl', periods: 3, prefix: 'P' },
    { id: 'cfb', name: 'NCAAF', path: 'football/college-football', periods: 4, prefix: 'Q' },
    { id: 'cbb', name: 'NCAAM', path: 'basketball/mens-college-basketball', periods: 2, prefix: 'H' },
    { id: 'wnba', name: 'WNBA', path: 'basketball/wnba', periods: 4, prefix: 'Q' },
    { id: 'mls', name: 'MLS', path: 'soccer/usa.1', periods: 2, prefix: 'H' },
    { id: 'epl', name: 'Premier League', path: 'soccer/eng.1', periods: 2, prefix: 'H' },
  ];

  const LIVE_REFRESH_MS = 20_000;
  const IDLE_REFRESH_MS = 120_000;

  const params = new URLSearchParams(location.search);
  const wideQuery = matchMedia('(min-width: 700px)');

  const state = {
    league: load('league', 'nfl'),
    date: startOfDay(new Date()),
    games: [],
    selectedId: null,
    favorites: new Set(load('favorites', [])),
    demo: params.has('demo'),
    loading: false,
    error: null,
    updatedAt: null,
    summary: null, // { id, data }
  };
  if (!LEAGUES.some(l => l.id === state.league)) state.league = 'nfl';

  const $ = id => document.getElementById(id);
  const els = {
    leagues: $('leagues'),
    games: $('games'),
    detail: $('detail'),
    dateLabel: $('date-label'),
    banner: $('banner'),
    updated: $('updated'),
    refresh: $('refresh'),
  };

  let refreshTimer = null;
  let requestSeq = 0;

  // ---------- Storage (best effort; private mode can throw) ----------

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem('scores:' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('scores:' + key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  // ---------- Helpers ----------

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function ymd(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  function league() { return LEAGUES.find(l => l.id === state.league); }
  function favKey(teamId) { return `${state.league}:${teamId}`; }
  function isFav(team) { return team.id != null && state.favorites.has(favKey(team.id)); }

  function dateLabel(d) {
    const today = startOfDay(new Date());
    const diff = Math.round((d - today) / 86_400_000);
    const nice = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (diff === 0) return `Today · ${nice}`;
    if (diff === -1) return `Yesterday · ${nice}`;
    if (diff === 1) return `Tomorrow · ${nice}`;
    return nice;
  }
  function timeOf(d) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  // ---------- ESPN data → app model ----------

  function scoreText(s) {
    if (s == null) return '';
    if (typeof s === 'object') return s.displayValue ?? String(s.value ?? '');
    return String(s);
  }

  function normalizeTeam(c) {
    const t = c?.team ?? {};
    const rank = c?.curatedRank?.current;
    return {
      id: t.id ?? null,
      abbr: t.abbreviation ?? (t.shortDisplayName ?? '?').slice(0, 3).toUpperCase(),
      name: t.shortDisplayName ?? t.displayName ?? t.name ?? 'TBD',
      full: t.displayName ?? t.shortDisplayName ?? 'TBD',
      logo: t.logo ?? t.logos?.[0]?.href ?? null,
      color: t.color ? '#' + t.color.replace('#', '') : null,
      score: scoreText(c?.score),
      record: c?.records?.[0]?.summary ?? '',
      winner: c?.winner === true,
      rank: rank && rank <= 25 ? rank : null,
      lines: (c?.linescores ?? []).map(l => l.displayValue ?? String(l.value ?? '')),
      leaders: c?.leaders ?? [],
    };
  }

  function normalizeLeaders(comp, home, away) {
    const out = [];
    const pick = (cat, teamAbbr) => {
      const top = cat?.leaders?.[0];
      if (!top) return;
      out.push({
        cat: cat.shortDisplayName ?? cat.displayName ?? cat.name ?? '',
        who: top.athlete?.shortName ?? top.athlete?.displayName ?? '',
        team: teamAbbr ?? top.team?.abbreviation ?? '',
        val: top.displayValue ?? '',
      });
    };
    // Football puts game leaders on the competition; other sports put them on each team.
    if (comp.leaders?.length) {
      for (const cat of comp.leaders) {
        const teamId = cat?.leaders?.[0]?.team?.id;
        pick(cat, teamId === home.id ? home.abbr : teamId === away.id ? away.abbr : undefined);
      }
    } else {
      for (const t of [away, home]) for (const cat of t.leaders.slice(0, 3)) pick(cat, t.abbr);
    }
    return out.slice(0, 8);
  }

  function normalizeEvent(ev) {
    const comp = ev.competitions?.[0] ?? {};
    const st = (ev.status ?? comp.status ?? {}).type ?? {};
    const cs = comp.competitors ?? [];
    const home = normalizeTeam(cs.find(c => c.homeAway === 'home') ?? cs[0]);
    const away = normalizeTeam(cs.find(c => c.homeAway === 'away') ?? cs[1]);
    const sit = comp.situation ?? {};
    const broadcasts = (comp.broadcasts ?? []).flatMap(b => b.names ?? []);
    return {
      id: String(ev.id),
      date: new Date(ev.date),
      state: st.state ?? 'pre', // pre | in | post
      status: st.shortDetail ?? st.detail ?? st.description ?? '',
      detailStatus: st.detail ?? st.shortDetail ?? '',
      home, away,
      venue: [comp.venue?.fullName, comp.venue?.address?.city, comp.venue?.address?.state].filter(Boolean).join(', '),
      broadcast: [...new Set(broadcasts)].join(', '),
      note: comp.notes?.[0]?.headline ?? '',
      odds: comp.odds?.[0]?.details ?? '',
      situation: sit.downDistanceText ?? sit.shortDownDistanceText ?? '',
      lastPlay: sit.lastPlay?.text ?? '',
      possession: sit.possession ?? null,
      leaders: normalizeLeaders(comp, home, away),
    };
  }

  function normalizePlays(summary, game) {
    if (!summary) return [];
    const teamAbbr = id => (id === game.home.id ? game.home.abbr : id === game.away.id ? game.away.abbr : '');
    const fromPlay = p => ({
      when: [p.period?.number ? `${league().prefix}${p.period.number}` : '', p.clock?.displayValue ?? ''].filter(Boolean).join(' '),
      text: p.text ?? p.type?.text ?? '',
      team: teamAbbr(p.team?.id),
    });
    if (summary.scoringPlays?.length) return summary.scoringPlays.map(fromPlay).reverse().slice(0, 12);
    if (summary.keyEvents?.length) return summary.keyEvents.map(fromPlay).reverse().slice(0, 12);
    if (summary.plays?.length) return summary.plays.slice(-10).map(fromPlay).reverse();
    return [];
  }

  // ---------- Fetching ----------

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadScoreboard({ quiet = false } = {}) {
    const seq = ++requestSeq;
    state.loading = true;
    state.error = null;
    if (!quiet) { state.games = []; render(); }
    els.refresh.classList.add('spinning');

    try {
      const data = state.demo
        ? window.DEMO_DATA.scoreboard(state.league, state.date)
        : await fetchJSON(`${API}${league().path}/scoreboard?dates=${ymd(state.date)}`);
      if (seq !== requestSeq) return; // a newer request won
      state.games = (data.events ?? []).map(normalizeEvent);
      state.updatedAt = new Date();
    } catch (err) {
      if (seq !== requestSeq) return;
      state.error = err;
    } finally {
      if (seq === requestSeq) {
        state.loading = false;
        els.refresh.classList.remove('spinning');
      }
    }

    // On the unfolded screen, always have something in the detail pane.
    if (wideQuery.matches && !state.games.some(g => g.id === state.selectedId)) {
      state.selectedId = sortGames(state.games)[0]?.id ?? null;
    }
    render();
    if (state.selectedId) loadSummary(state.selectedId);
    scheduleRefresh();
  }

  async function loadSummary(id) {
    try {
      const data = state.demo
        ? window.DEMO_DATA.summary(state.league, id)
        : await fetchJSON(`${API}${league().path}/summary?event=${encodeURIComponent(id)}`);
      state.summary = { id, data };
    } catch {
      state.summary = { id, data: null };
    }
    if (state.selectedId === id) renderDetail();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (document.hidden) return;
    const anyLive = state.games.some(g => g.state === 'in');
    refreshTimer = setTimeout(() => loadScoreboard({ quiet: true }), anyLive ? LIVE_REFRESH_MS : IDLE_REFRESH_MS);
  }

  // ---------- Rendering ----------

  function sortGames(games) {
    const rank = { in: 0, pre: 1, post: 2 };
    const fav = g => (isFav(g.home) || isFav(g.away) ? 0 : 1);
    return [...games].sort((a, b) =>
      rank[a.state] - rank[b.state] || fav(a) - fav(b) || a.date - b.date);
  }

  function logoHTML(team) {
    const fallback = `<span class="logo-fallback" style="--team-color:${esc(team.color ?? '#556')}">${esc(team.abbr)}</span>`;
    if (!team.logo) return fallback;
    // If the image fails to load, swap in the colored initials.
    return `<img class="logo" src="${esc(team.logo)}" alt="" loading="lazy" onerror="this.outerHTML=this.nextElementSibling.innerHTML"><template>${fallback}</template>`;
  }

  function statusHTML(g) {
    if (g.state === 'pre') return `<span class="num">${esc(timeOf(g.date))}</span>`;
    if (g.state === 'in') return `<span class="live-dot"></span>${esc(g.status)}`;
    return esc(g.status || 'Final');
  }

  function teamRowHTML(g, t, other) {
    const loser = g.state === 'post' && (t.winner === false && other.winner === true);
    return `
      <div class="team-row${loser ? ' loser' : ''}">
        ${logoHTML(t)}
        <div class="team-name">${t.rank ? `<span class="rank">${t.rank}</span>` : ''}${esc(t.name)}${t.record ? `<span class="record">${esc(t.record)}</span>` : ''}${isFav(t) ? '<span class="fav" aria-label="Favorite">★</span>' : ''}</div>
        <div class="team-score num">${g.state === 'pre' ? '' : esc(t.score)}</div>
      </div>`;
  }

  function gameHTML(g) {
    const sub = g.state === 'in' ? (g.situation || g.lastPlay) : g.state === 'pre' ? (g.broadcast || g.odds || g.note) : g.note;
    return `
      <button class="game ${g.state}" data-id="${esc(g.id)}" ${g.id === state.selectedId ? 'aria-current="true"' : ''}>
        <div class="teams">
          ${teamRowHTML(g, g.away, g.home)}
          ${teamRowHTML(g, g.home, g.away)}
        </div>
        <div class="game-status">${statusHTML(g)}</div>
        ${sub ? `<div class="game-sub">${esc(sub)}</div>` : ''}
      </button>`;
  }

  function renderLeagues() {
    els.leagues.innerHTML = LEAGUES.map(l =>
      `<button class="chip" data-league="${l.id}" aria-pressed="${l.id === state.league}">${esc(l.name)}</button>`
    ).join('');
    els.leagues.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function renderList() {
    els.dateLabel.textContent = dateLabel(state.date);

    if (state.demo) {
      els.banner.hidden = false;
      els.banner.innerHTML = `Showing sample games, not real scores.<button data-action="live">Use live scores</button>`;
    } else if (state.error) {
      els.banner.hidden = false;
      els.banner.innerHTML = `Couldn't reach ESPN (${esc(state.error.message)}).<button data-action="retry">Try again</button><button data-action="demo">Show sample games</button>`;
    } else {
      els.banner.hidden = true;
    }

    if (state.loading && !state.games.length) {
      els.games.innerHTML = '<div class="skeleton"></div>'.repeat(5);
    } else if (!state.games.length) {
      els.games.innerHTML = state.error ? '' : `<div class="empty">No ${esc(league().name)} games on this day.</div>`;
    } else {
      const sorted = sortGames(state.games);
      const groups = [['in', 'Live'], ['pre', 'Upcoming'], ['post', 'Final']];
      els.games.innerHTML = groups.map(([key, title]) => {
        const list = sorted.filter(g => g.state === key);
        return list.length ? `<h2 class="section-title">${title}</h2>${list.map(gameHTML).join('')}` : '';
      }).join('');
    }

    els.updated.textContent = state.updatedAt
      ? `Updated ${timeOf(state.updatedAt)}${state.games.some(g => g.state === 'in') ? ' · refreshing every 20s' : ''}`
      : '';
  }

  function linescoreHTML(g) {
    const n = Math.max(g.home.lines.length, g.away.lines.length);
    if (!n || g.state === 'pre') return '';
    const L = league();
    const label = i => (i < L.periods ? `${L.prefix}${i + 1}` : L.id === 'mlb' ? String(i + 1) : i === L.periods ? 'OT' : `${i - L.periods + 1}OT`);
    const head = Array.from({ length: n }, (_, i) => `<th>${esc(label(i))}</th>`).join('');
    const row = t => `<tr><td><b>${esc(t.abbr)}</b></td>${Array.from({ length: n }, (_, i) => `<td class="num">${esc(t.lines[i] ?? '')}</td>`).join('')}<td class="num">${esc(t.score)}</td></tr>`;
    return `
      <div class="card wide">
        <h2>Score by period</h2>
        <div class="linescore-wrap">
          <table class="linescore"><thead><tr><th></th>${head}<th>T</th></tr></thead>
          <tbody>${row(g.away)}${row(g.home)}</tbody></table>
        </div>
      </div>`;
  }

  function heroTeamHTML(t) {
    const fav = isFav(t);
    return `
      <div class="hero-team">
        ${logoHTML(t)}
        <div class="name">${t.rank ? `#${t.rank} ` : ''}${esc(t.name)}</div>
        ${t.record ? `<div class="record">${esc(t.record)}</div>` : ''}
        ${t.id != null ? `<button class="star-btn" data-fav="${esc(t.id)}" aria-pressed="${fav}">${fav ? '★ Favorite' : '☆ Favorite'}</button>` : ''}
      </div>`;
  }

  function renderDetail() {
    const g = state.games.find(x => x.id === state.selectedId);
    if (!g) {
      els.detail.innerHTML = `<div class="detail-empty">${state.loading ? '' : 'Pick a game to see the details.'}</div>`;
      return;
    }

    const awayLost = g.state === 'post' && g.home.winner;
    const homeLost = g.state === 'post' && g.away.winner;
    const mid = g.state === 'pre'
      ? `<div class="hero-time num">${esc(timeOf(g.date))}</div><div class="hero-status">${esc(g.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}</div>`
      : `<div class="hero-score num"><span class="${awayLost ? 'loser' : ''}">${esc(g.away.score)}</span><span class="dash">–</span><span class="${homeLost ? 'loser' : ''}">${esc(g.home.score)}</span></div>
         <div class="hero-status">${g.state === 'in' ? '<span class="live-dot"></span>' : ''}${esc(g.detailStatus || g.status)}</div>`;

    const plays = state.summary?.id === g.id ? normalizePlays(state.summary.data, g) : [];
    const playsTitle = state.summary?.data?.scoringPlays?.length ? 'Scoring plays' : state.summary?.data?.keyEvents?.length ? 'Key moments' : 'Recent plays';

    const facts = [
      ['Matchup', g.note],
      ['Venue', g.venue],
      ['TV', g.broadcast],
      ['Line', g.odds],
    ].filter(([, v]) => v);

    els.detail.innerHTML = `
      <div class="detail ${g.state}">
        <div class="detail-bar">
          <button class="back-btn" data-action="back">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Games
          </button>
          <span class="detail-league">${esc(league().name)}</span>
        </div>

        <div class="hero">
          ${heroTeamHTML(g.away)}
          <div class="hero-mid">${mid}</div>
          ${heroTeamHTML(g.home)}
        </div>

        <div class="detail-grid">
          ${g.state === 'in' && (g.situation || g.lastPlay) ? `
            <div class="card wide">
              <h2>Right now</h2>
              ${g.situation ? `<div class="situation">${esc(g.situation)}</div>` : ''}
              ${g.lastPlay ? `<div>${esc(g.lastPlay)}</div>` : ''}
            </div>` : ''}

          ${linescoreHTML(g)}

          ${g.leaders.length ? `
            <div class="card">
              <h2>Leaders</h2>
              <div class="leaders">
                ${g.leaders.map(l => `
                  <div class="leader">
                    <div class="cat">${esc(l.cat)}</div>
                    <div class="who"><div><b>${esc(l.who)}</b> ${l.team ? `<span class="val">${esc(l.team)}</span>` : ''}</div><div class="val">${esc(l.val)}</div></div>
                  </div>`).join('')}
              </div>
            </div>` : ''}

          ${plays.length ? `
            <div class="card">
              <h2>${playsTitle}</h2>
              <ul class="plays">
                ${plays.map(p => `<li><span class="when num">${esc(p.when)}${p.team ? `<br>${esc(p.team)}` : ''}</span><span>${esc(p.text)}</span></li>`).join('')}
              </ul>
            </div>` : ''}

          ${facts.length ? `
            <div class="card">
              <h2>Game info</h2>
              <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
            </div>` : ''}
        </div>
      </div>`;
  }

  function render() {
    renderList();
    renderDetail();
  }

  // ---------- Navigation ----------

  function openGame(id) {
    const changed = state.selectedId !== id;
    state.selectedId = id;
    if (changed) state.summary = null;
    els.games.querySelectorAll('.game').forEach(b =>
      b.toggleAttribute('aria-current', b.dataset.id === id));
    renderDetail();
    els.detail.scrollTop = 0;
    if (!wideQuery.matches) {
      document.body.classList.add('detail-open');
      history.pushState({ game: id }, '');
    }
    loadSummary(id);
  }

  function closeGame() {
    document.body.classList.remove('detail-open');
  }

  function setLeague(id) {
    if (id === state.league) return;
    state.league = id;
    state.selectedId = null;
    state.summary = null;
    save('league', id);
    renderLeagues();
    loadScoreboard();
  }

  function setDate(d) {
    state.date = startOfDay(d);
    state.selectedId = null;
    state.summary = null;
    loadScoreboard();
  }

  function setDemo(on) {
    state.demo = on;
    const url = new URL(location.href);
    on ? url.searchParams.set('demo', '') : url.searchParams.delete('demo');
    history.replaceState(history.state, '', url);
    loadScoreboard();
  }

  // ---------- Events ----------

  els.leagues.addEventListener('click', e => {
    const b = e.target.closest('[data-league]');
    if (b) setLeague(b.dataset.league);
  });

  els.games.addEventListener('click', e => {
    const b = e.target.closest('.game');
    if (b) openGame(b.dataset.id);
  });

  els.banner.addEventListener('click', e => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'retry') loadScoreboard();
    if (a === 'demo') setDemo(true);
    if (a === 'live') setDemo(false);
  });

  els.detail.addEventListener('click', e => {
    if (e.target.closest('[data-action="back"]')) {
      history.state?.game ? history.back() : closeGame();
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const key = favKey(fav.dataset.fav);
      state.favorites.has(key) ? state.favorites.delete(key) : state.favorites.add(key);
      save('favorites', [...state.favorites]);
      render();
    }
  });

  $('prev-day').addEventListener('click', () => setDate(addDays(state.date, -1)));
  $('next-day').addEventListener('click', () => setDate(addDays(state.date, 1)));
  els.dateLabel.addEventListener('click', () => setDate(new Date()));
  els.refresh.addEventListener('click', () => loadScoreboard({ quiet: true }));

  // The system back gesture closes the detail view on the folded screen.
  addEventListener('popstate', () => closeGame());

  // Folding or unfolding the phone changes the width; keep the panes consistent.
  wideQuery.addEventListener('change', e => {
    if (e.matches) {
      document.body.classList.remove('detail-open');
      if (!state.selectedId && state.games.length) {
        state.selectedId = sortGames(state.games)[0].id;
        loadSummary(state.selectedId);
      }
      render();
    } else if (state.selectedId && history.state?.game) {
      document.body.classList.add('detail-open');
    }
  });

  // Stop polling in the background; catch up immediately on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(refreshTimer);
    else loadScoreboard({ quiet: true });
  });

  // Swipe right from the left edge to go back on the folded screen.
  let touchX = null;
  els.detail.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX < 30 ? e.touches[0].clientX : null;
  }, { passive: true });
  els.detail.addEventListener('touchend', e => {
    if (touchX != null && e.changedTouches[0].clientX - touchX > 80 && !wideQuery.matches) {
      history.state?.game ? history.back() : closeGame();
    }
    touchX = null;
  }, { passive: true });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  history.replaceState(null, '');
  renderLeagues();
  loadScoreboard();
})();
