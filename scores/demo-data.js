/* Sample games in the same shape as ESPN's scoreboard JSON.
 * Used when you open the app with ?demo, or tap "Show sample games"
 * when ESPN can't be reached. These are made-up results, not real scores.
 */
(() => {
  'use strict';

  const TEAMS = {
    nfl: [['1', 'NYG', 'Giants', 'New York Giants', '0b2265'], ['2', 'DAL', 'Cowboys', 'Dallas Cowboys', '002a5c'],
      ['3', 'PHI', 'Eagles', 'Philadelphia Eagles', '004c54'], ['4', 'KC', 'Chiefs', 'Kansas City Chiefs', 'e31837'],
      ['5', 'BUF', 'Bills', 'Buffalo Bills', '00338d'], ['6', 'SF', '49ers', 'San Francisco 49ers', 'aa0000'],
      ['7', 'DET', 'Lions', 'Detroit Lions', '0076b6'], ['8', 'GB', 'Packers', 'Green Bay Packers', '203731']],
    nba: [['1', 'NY', 'Knicks', 'New York Knicks', '1d428a'], ['2', 'BOS', 'Celtics', 'Boston Celtics', '007a33'],
      ['3', 'LAL', 'Lakers', 'Los Angeles Lakers', '552583'], ['4', 'GS', 'Warriors', 'Golden State Warriors', '1d428a'],
      ['5', 'DEN', 'Nuggets', 'Denver Nuggets', '0e2240'], ['6', 'MIL', 'Bucks', 'Milwaukee Bucks', '00471b'],
      ['7', 'OKC', 'Thunder', 'Oklahoma City Thunder', '007ac1'], ['8', 'MIA', 'Heat', 'Miami Heat', '98002e']],
    mlb: [['1', 'NYY', 'Yankees', 'New York Yankees', '0c2340'], ['2', 'BOS', 'Red Sox', 'Boston Red Sox', 'bd3039'],
      ['3', 'LAD', 'Dodgers', 'Los Angeles Dodgers', '005a9c'], ['4', 'HOU', 'Astros', 'Houston Astros', 'eb6e1f'],
      ['5', 'ATL', 'Braves', 'Atlanta Braves', '13274f'], ['6', 'CHC', 'Cubs', 'Chicago Cubs', '0e3386'],
      ['7', 'SEA', 'Mariners', 'Seattle Mariners', '005c5c'], ['8', 'TOR', 'Blue Jays', 'Toronto Blue Jays', '134a8e']],
    nhl: [['1', 'NYR', 'Rangers', 'New York Rangers', '0038a8'], ['2', 'NJ', 'Devils', 'New Jersey Devils', 'ce1126'],
      ['3', 'TOR', 'Maple Leafs', 'Toronto Maple Leafs', '00205b'], ['4', 'BOS', 'Bruins', 'Boston Bruins', 'fcb514'],
      ['5', 'EDM', 'Oilers', 'Edmonton Oilers', '041e42'], ['6', 'COL', 'Avalanche', 'Colorado Avalanche', '6f263d']],
    cfb: [['1', 'OSU', 'Ohio State', 'Ohio State Buckeyes', 'ba0c2f'], ['2', 'MICH', 'Michigan', 'Michigan Wolverines', '00274c'],
      ['3', 'UGA', 'Georgia', 'Georgia Bulldogs', 'ba0c2f'], ['4', 'TEX', 'Texas', 'Texas Longhorns', 'bf5700'],
      ['5', 'ORE', 'Oregon', 'Oregon Ducks', '154733'], ['6', 'PSU', 'Penn State', 'Penn State Nittany Lions', '041e42']],
    cbb: [['1', 'DUKE', 'Duke', 'Duke Blue Devils', '003087'], ['2', 'UNC', 'North Carolina', 'North Carolina Tar Heels', '4b9cd3'],
      ['3', 'UK', 'Kentucky', 'Kentucky Wildcats', '0033a0'], ['4', 'KU', 'Kansas', 'Kansas Jayhawks', '0051ba']],
    wnba: [['1', 'NY', 'Liberty', 'New York Liberty', '6eceb2'], ['2', 'LV', 'Aces', 'Las Vegas Aces', 'a7a8a9'],
      ['3', 'MIN', 'Lynx', 'Minnesota Lynx', '266092'], ['4', 'IND', 'Fever', 'Indiana Fever', '002d62']],
    mls: [['1', 'NYC', 'NYCFC', 'New York City FC', '6cace4'], ['2', 'RBNY', 'Red Bulls', 'New York Red Bulls', 'ba0c2f'],
      ['3', 'LAFC', 'LAFC', 'LAFC', '000000'], ['4', 'MIA', 'Inter Miami', 'Inter Miami CF', 'f7b5cd']],
    epl: [['1', 'ARS', 'Arsenal', 'Arsenal', 'ef0107'], ['2', 'MCI', 'Man City', 'Manchester City', '6cabdd'],
      ['3', 'LIV', 'Liverpool', 'Liverpool', 'c8102e'], ['4', 'CHE', 'Chelsea', 'Chelsea', '034694']],
  };

  // Per sport: number of regulation periods, how a live status reads, typical scores per period.
  const SPORT = {
    nfl: { periods: 4, live: 'Q3 8:42', per: [0, 3, 7, 7, 10, 14] },
    cfb: { periods: 4, live: 'Q2 2:15', per: [0, 3, 7, 7, 10, 14] },
    nba: { periods: 4, live: 'Q4 5:31', per: [22, 25, 28, 31, 34] },
    wnba: { periods: 4, live: 'Q3 3:10', per: [18, 20, 22, 25] },
    cbb: { periods: 2, live: '2nd 11:04', per: [30, 34, 38, 41] },
    mlb: { periods: 9, live: 'Top 7th', per: [0, 0, 0, 1, 1, 2, 3] },
    nhl: { periods: 3, live: '2nd 6:18', per: [0, 0, 1, 1, 2] },
    mls: { periods: 2, live: "67'", per: [0, 0, 1, 1, 2] },
    epl: { periods: 2, live: "54'", per: [0, 0, 1, 1, 2] },
  };

  const VENUES = ['MetLife Stadium', 'Yankee Stadium', 'Madison Square Garden', 'Ohio Stadium', 'Lambeau Field', 'Crypto.com Arena'];
  const NETWORKS = ['ESPN', 'FOX', 'CBS', 'NBC', 'TNT', 'Prime Video'];

  // Small deterministic random generator so a given day always shows the same games.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }
  function seedFor(league, date) {
    let h = date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();
    for (const c of league) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  }

  function team(t) {
    return { id: t[0], abbreviation: t[1], shortDisplayName: t[2], displayName: t[3], color: t[4] };
  }

  function lines(r, n, per) {
    return Array.from({ length: n }, () => per[Math.floor(r() * per.length)]);
  }

  function scoreboard(league, date) {
    const r = rng(seedFor(league, date));
    const teams = [...TEAMS[league]];
    const sport = SPORT[league];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(date); day.setHours(0, 0, 0, 0);
    const events = [];

    // Pair teams up in list order.
    for (let i = 0; i + 1 < teams.length; i += 2) {
      const [away, home] = r() < 0.5 ? [teams[i], teams[i + 1]] : [teams[i + 1], teams[i]];
      let state;
      if (day < today) state = 'post';
      else if (day > today) state = 'pre';
      else state = ['in', 'post', 'pre', 'in'][(i / 2) % 4];

      const start = new Date(day);
      start.setHours(state === 'pre' ? 19 + (i % 3) : 13 + (i % 4), i % 2 ? 30 : 0);

      const played = state === 'pre' ? 0 : state === 'in' ? Math.max(1, sport.periods - 1) : sport.periods;
      const aLines = lines(r, played, sport.per);
      const hLines = lines(r, played, sport.per);
      let aScore = aLines.reduce((a, b) => a + b, 0);
      let hScore = hLines.reduce((a, b) => a + b, 0);
      if (state === 'post' && aScore === hScore && !league.match(/mls|epl/)) { hLines[hLines.length - 1] += 1; hScore += 1; }

      const rec = () => `${Math.floor(r() * 10) + 1}-${Math.floor(r() * 8)}`;
      const competitor = (t, homeAway, ls, score, won) => ({
        homeAway,
        team: team(t),
        score: state === 'pre' ? '' : String(score),
        winner: state === 'post' ? won : undefined,
        records: [{ summary: rec() }],
        linescores: ls.map(v => ({ value: v })),
        curatedRank: league === 'cfb' || league === 'cbb' ? { current: Math.floor(r() * 25) + 1 } : undefined,
        leaders: league === 'nfl' || league === 'cfb' ? undefined : [
          { shortDisplayName: league.match(/mls|epl/) ? 'Shots' : league === 'mlb' ? 'Hits' : league === 'nhl' ? 'Points' : 'Points',
            leaders: [{ displayValue: String(Math.floor(r() * 25) + 2), athlete: { shortName: `${String.fromCharCode(65 + Math.floor(r() * 26))}. Player` } }] },
        ],
      });

      const detail = state === 'pre' ? '' : state === 'in' ? sport.live : 'Final';
      events.push({
        id: `${league}-${ymd(day)}-${i}`,
        date: start.toISOString(),
        status: { type: { state, completed: state === 'post', shortDetail: detail, detail: state === 'in' ? sport.live : detail } },
        competitions: [{
          competitors: [
            competitor(home, 'home', hLines, hScore, hScore > aScore),
            competitor(away, 'away', aLines, aScore, aScore > hScore),
          ],
          venue: { fullName: VENUES[Math.floor(r() * VENUES.length)] },
          broadcasts: [{ names: [NETWORKS[Math.floor(r() * NETWORKS.length)]] }],
          odds: state === 'pre' ? [{ details: `${home[1]} -${(Math.floor(r() * 7) + 1) + 0.5}` }] : undefined,
          situation: state === 'in' && (league === 'nfl' || league === 'cfb')
            ? { downDistanceText: `2nd & 7 at ${away[1]} 34`, lastPlay: { text: 'Pass complete to the right for 12 yards.' } }
            : undefined,
          leaders: (league === 'nfl' || league === 'cfb') && state !== 'pre' ? [
            { shortDisplayName: 'Passing', leaders: [{ displayValue: '18/26, 214 YDS, 2 TD', athlete: { shortName: 'J. Quarterback' }, team: { id: home[0] } }] },
            { shortDisplayName: 'Rushing', leaders: [{ displayValue: '15 CAR, 88 YDS', athlete: { shortName: 'R. Runner' }, team: { id: away[0] } }] },
            { shortDisplayName: 'Receiving', leaders: [{ displayValue: '6 REC, 97 YDS, 1 TD', athlete: { shortName: 'W. Receiver' }, team: { id: home[0] } }] },
          ] : undefined,
        }],
      });
    }
    return { events };
  }

  function summary(league, id) {
    if (league !== 'nfl' && league !== 'cfb') return { plays: [] };
    return {
      scoringPlays: [
        { period: { number: 1 }, clock: { displayValue: '9:12' }, text: 'Field goal from 41 yards.', team: {} },
        { period: { number: 2 }, clock: { displayValue: '4:03' }, text: 'Touchdown pass of 23 yards (kick good).', team: {} },
        { period: { number: 3 }, clock: { displayValue: '11:40' }, text: 'Touchdown run of 6 yards (kick good).', team: {} },
      ],
    };
  }

  function ymd(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  window.DEMO_DATA = { scoreboard, summary };
})();
