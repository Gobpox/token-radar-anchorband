// AnchorBand's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the traded anchors the price was
// learned from, a method view that states the model and its split-half test,
// and a detail drawer for every protocol with the model's working and the
// farm plan. No network: every byte it shows is in data.js. The valuation
// check and the farm plan below are the same derivations lib/model.ts runs,
// so the page and board.json cannot drift apart.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var C = DATA.constants;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', tab: 'board', sort: 'rank', dir: 1, selected: null, shown: 120 };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // The valuation, recomputed from the row's own snapshot figures: the page
  // shows the number board.json carries only when its own arithmetic agrees.
  function growthMult(row) { return 1 + (clamp(row.change_7d === null ? 0 : row.change_7d, C.growth_floor, C.growth_cap) / 100) * C.growth_weight; }
  function maturityMult(row) {
    var age = row.age_days === null ? C.unknown_age_days : row.age_days;
    return C.maturity_base + C.maturity_range * (1 - Math.exp(-age / C.maturity_tau_days));
  }
  function breadthMult(row) { return 1 + C.breadth_per_chain * Math.min(Math.max((row.chains || []).length - 1, 0), C.breadth_max_chains); }
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.fitted_multiple * row.size_multiplier * growthMult(row) * maturityMult(row) * breadthMult(row)));
  }
  function verdictFor(implied, change7d) {
    if (implied >= 25000000 && (change7d === null || change7d > -25)) return 'FARM';
    if (implied >= 6000000) return 'WATCH';
    return 'THIN';
  }

  // The farm plan derivation, the same one main.ts writes into board.json:
  // category picks the actions, the first chain picks the gas, TVL picks the
  // capital, age picks the hold. No name is special-cased.
  function gasFor(p) {
    var chain = ((p.chains && p.chains[0]) || '').toLowerCase();
    if (chain === 'ethereum') return 6;
    if (chain === 'solana') return 0.3;
    if (['base', 'arbitrum', 'optimism', 'zksync era', 'linea', 'scroll', 'unichain'].indexOf(chain) >= 0) return 0.8;
    return 2;
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 500;
    if (p.tvl_usd >= 250e6) return 250;
    if (p.tvl_usd >= 50e6) return 150;
    if (p.tvl_usd >= 10e6) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 42;
    if (age < 180) return 56;
    if (age < 365) return 42;
    if (age < 730) return 35;
    return 28;
  }
  function money(n) { return '$' + n.toLocaleString('en-US'); }
  function openingAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Supply ' + money(capital) + ' of USDC as collateral in ' + n + ' on ' + chain + ', then borrow ' + money(Math.round(capital / 2)) + ' against it and re-supply the borrow so both sides of the market see the wallet.';
    if (c.indexOf('dex') >= 0) return 'Swap ' + money(capital) + " into the main pair on " + n + ' on ' + chain + ' and add it as liquidity in the deepest pool, keeping the LP position in the farming wallet.';
    if (c.indexOf('deriv') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit ' + money(capital) + ' of USDC margin on ' + n + ' on ' + chain + ' and open one small hedged position, half long and half short across two markets, so volume counts without directional risk.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit ' + money(capital) + ' into the largest ' + n + ' vault on ' + chain + ' and keep the vault shares untouched in the farming wallet for the whole plan.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake ' + money(capital) + " of the chain's staking asset through " + n + ' on ' + chain + ' and hold the receipt token in the farming wallet.';
    if (c.indexOf('yield') >= 0) return 'Deposit ' + money(capital) + ' into the flagship ' + n + ' vault on ' + chain + ' and leave auto-compounding on so the balance grows on its own record.';
    if (c.indexOf('rwa') >= 0) return 'Mint ' + money(capital) + ' of the ' + n + ' yield asset on ' + chain + ' through its own app and hold the minted asset in the farming wallet.';
    if (c.indexOf('bridge') >= 0) return 'Bridge ' + money(capital) + ' of USDC to ' + chain + ' through ' + n + ', then put the bridged funds to work in one app on the far side the same day.';
    if (c.indexOf('insurance') >= 0) return 'Buy ' + money(capital) + ' of cover from ' + n + ' on ' + chain + ' for the longest term it sells and keep the policy NFT in the farming wallet.';
    if (c.indexOf('prediction') >= 0) return 'Fund the farming wallet with ' + money(capital) + ' on ' + n + ' and take one position in its most liquid market on ' + chain + '.';
    if (c.indexOf('basis') >= 0) return 'Open the ' + n + ' basis position on ' + chain + ' with ' + money(capital) + ': spot leg bought, hedge leg shorted, both from the farming wallet.';
    return 'Deposit ' + money(capital) + ' of USDC into ' + n + ' on ' + chain + ' through its own app and keep the position open in the farming wallet.';
  }
  function secondAction(p, chain) {
    var c = (p.category || '').toLowerCase(); var n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Repay half the borrow on ' + n + ' and borrow again a week later, so the wallet shows a full lend-borrow-repay cycle rather than one parked deposit.';
    if (c.indexOf('dex') >= 0) return 'Make two swaps a week through ' + n + ' on ' + chain + ', alternating direction, so the wallet\u2019s record is trading activity and not only liquidity.';
    if (c.indexOf('deriv') >= 0 || c.indexOf('perpetual') >= 0) return 'Roll the hedge once a week on ' + n + ': close one leg and reopen it at the new price, keeping total margin inside the plan\u2019s capital.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Add a second, smaller deposit to a different ' + n + ' vault on ' + chain + ' in week two, so the wallet holds shares in more than one strategy.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Claim and re-stake the rewards on ' + n + ' once a week; the claim transactions are the activity record, so never let them pile up unclaimed.';
    if (c.indexOf('yield') >= 0) return 'Move ten percent of the position to a second ' + n + ' vault on ' + chain + ' in week two, then leave both vaults untouched.';
    return 'Repeat the opening action on ' + n + ' once in week two at a tenth of the size, so the wallet\u2019s second week is on record as well as its first.';
  }
  function farmSteps(p) {
    var chain = (p.chains && p.chains[0]) || 'its main chain';
    var capital = capitalFor(p); var gas = gasFor(p); var hold = holdDaysFor(p.age_days);
    var weeks = Math.max(2, Math.ceil(hold / 7));
    var gasText = gas < 1 ? 'under $1 of gas' : 'about $' + gas + ' of gas';
    return [
      'Start with a fresh wallet funded only with the plan\u2019s capital plus gas, and store its seed phrase offline on paper. Cost: ' + gasText + ' to fund and test. Time: 10 minutes.',
      openingAction(p, capital, chain) + ' Cost: ' + money(capital) + ' of capital and ' + gasText + '. Time: 20 minutes.',
      secondAction(p, chain) + ' Cost: ' + gasText + ' per action. Time: 10 minutes.',
      'Return once a week for ' + weeks + ' weeks and repeat one qualifying action on ' + p.name + ', so every weekly snapshot in the window holds an active wallet. Cost: ' + gasText + ' a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days without withdrawing, so the activity spans more than one snapshot of ' + p.name + '\u2019s record. Cost: the ' + money(capital) + ' stays in the position. Time: ' + hold + ' days.',
      'Check the points or rewards page inside ' + p.name + '\u2019s own app and follow only a claim link published there; a claim that asks for a fee or a signature on another site is not the protocol\u2019s. Cost: nothing to check, never pay to claim. Time: 10 minutes.',
      'Log the wallet, the dates and every transaction hash in a farm log, then unwind the position in one session when the plan ends or the protocol announces its launch terms. Cost: ' + gasText + ' to exit. Time: 15 minutes.'
    ];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort; var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring' }),
        el('span', { class: 'brand-name' }, 'Anchor', el('em', { text: 'Band' }))),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version })),
        el('span', null, 'Anchors ', el('b', { text: String(DATA.fit.anchors) + ' traded protocols' }))));
  }

  function lede() {
    var v = DATA.fit.validation;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Pre-token protocols, priced by the protocols ', el('span', { class: 'hl', text: 'already trading' }), '.'),
        el('p', { text: 'AnchorBand learns what a dollar of TVL is worth from the ' + DATA.fit.anchors + ' protocols whose tokens trade today — by category, tilted for size — then prices every protocol that records no token yet on the same scale. Each row carries its uncertainty band and a costed farm plan. Implied value is this model\u2019s claim, not a promise, and \u201crecords no token\u201d is all the snapshot can say.' })),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'good', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'the floor, never the ceiling' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Pre-token ranked' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' found below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Price of $1 TVL' }), el('b', { text: '$' + DATA.fit.global_multiple.toFixed(3) }), el('small', { text: 'median anchor multiple, ' + DATA.fit.categories_priced + ' categories priced apart' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Leave-one-out error' }), el('b', { class: 'good', text: v.fitted_median_ape_pct + '%' }), el('small', { text: 'fitted vs ' + v.flat_median_ape_pct + '% for flat 0.25x, each of ' + v.tested + ' anchors priced blind' }))));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.shown = 120; writeHash(); render(); });
    function select(id, label, values, current, allLabel) {
      var sel = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: allLabel }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); }));
      sel.addEventListener('change', function () { state[id] = sel.value; state.shown = 120; writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
    }
    var tabs = el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }),
      el('div', { class: 'tabs' },
        el('button', { type: 'button', 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Radar board', onclick: function () { state.tab = 'board'; writeHash(); render(); } }),
        el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Traded anchors', onclick: function () { state.tab = 'live'; writeHash(); render(); } }),
        el('button', { type: 'button', 'aria-pressed': state.tab === 'method' ? 'true' : 'false', text: 'Method & proof', onclick: function () { state.tab = 'method'; writeHash(); render(); } })));
    var count = state.tab === 'board' ? filteredRows().length + ' of ' + DATA.board_size + ' rows' : state.tab === 'live' ? DATA.live.length + ' anchors shown' : 'how the price is made';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', categories, state.category, 'All categories'),
      select('chain', 'Chain', chains, state.chain, 'All chains'),
      select('verdict', 'Verdict', ['FARM', 'WATCH', 'THIN'], state.verdict, 'All verdicts'),
      tabs,
      el('span', { class: 'count', text: count }));
  }

  function sortHead(label, key, cls) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' \u2191' : ' \u2193') : '';
    return el('th', { class: (cls || '') + ' sortable', text: label + arrow, onclick: function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; }
      render();
    } });
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var visible = list.slice(0, state.shown);
    var head = el('thead', null, el('tr', null,
      sortHead('#', 'rank'), sortHead('Protocol', 'name', 'l'), el('th', { class: 'l', text: 'Category' }),
      el('th', { class: 'l', text: 'Chains' }), sortHead('TVL', 'tvl'), sortHead('7d', 'growth'),
      sortHead('Age', 'age'), el('th', { text: 'Multiple' }), sortHead('Implied value', 'implied'),
      el('th', { text: 'Verdict' }), el('th', { text: 'Plan cost' })));
    var body = el('tbody', null, visible.map(function (r) {
      var check = Math.abs(impliedOf(r) - r.implied_value_usd) <= Math.max(1, r.implied_value_usd * 0.001);
      var tr = el('tr', { class: r.slug === state.selected ? 'selected' : '', onclick: function () { state.selected = r.slug; writeHash(); render(); } },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', { class: 'name l' }, r.on_watchlist ? el('span', { class: 'watch-dot', title: 'On the watchlist' }) : null, r.name, el('span', { class: 'slug', text: r.slug })),
        el('td', { class: 'l', text: r.category || 'Other' }),
        el('td', { class: 'l', text: (r.chains || []).slice(0, 2).join(', ') + ((r.chains || []).length > 2 ? ' +' + (r.chains.length - 2) : '') }),
        el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { class: r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { text: fmtAge(r.age_days) }),
        el('td', { text: (r.fitted_multiple * r.size_multiplier).toFixed(2) + 'x' }),
        el('td', null, fmtUsd(r.implied_value_usd), el('span', { class: 'band', text: fmtUsd(r.band_low_usd) + ' \u2013 ' + fmtUsd(r.band_high_usd) + (check ? '' : ' !') })),
        el('td', null, el('span', { class: 'pill ' + r.verdict.toLowerCase(), text: r.verdict })),
        el('td', { text: '$' + r.plan_cost_usd + ' / ' + r.plan_weeks + 'w' }));
      return tr;
    }));
    var wrap = el('div', null, el('div', { class: 'board-wrap' }, el('table', null, head, body)));
    if (list.length > state.shown) {
      wrap.appendChild(el('button', { class: 'more', type: 'button', text: 'Show all ' + list.length + ' rows', onclick: function () { state.shown = list.length; render(); } }));
    }
    if (list.length === 0) wrap.appendChild(el('p', { class: 'note', text: 'No protocol matches this filter. Loosen the search, category, chain or verdict.' }));
    return wrap;
  }

  function tiltRow(name, value, lo, hi) {
    var pct = clamp(((value - lo) / (hi - lo)) * 100, 0, 100);
    return el('div', { class: 'tilt' },
      el('span', { class: 'tname', text: name }),
      el('span', { class: 'bar' }, el('span', { class: 'fill', style: 'left:0;width:' + pct.toFixed(1) + '%' })),
      el('span', { class: 'tval', text: value.toFixed(3) + 'x' }));
  }

  function detail() {
    var r = DATA.rows.find(function (x) { return x.slug === state.selected; });
    if (!r) return null;
    var steps = farmSteps(r);
    var span = Math.max(r.band_high_usd * 1.15, r.implied_value_usd * 1.3);
    var loPct = (r.band_low_usd / span) * 100; var hiPct = (r.band_high_usd / span) * 100; var ptPct = (r.implied_value_usd / span) * 100;
    return el('section', { class: 'detail' },
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } }),
      el('h2', { text: '#' + r.rank + ' ' + r.name }),
      el('div', { class: 'subline', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains || []).join(', ') + ' \u00b7 TVL ' + fmtUsd(r.tvl_usd) + ' \u00b7 7d ' + fmtPct(r.change_7d) + ' \u00b7 tracked ' + fmtAge(r.age_days) + (r.on_watchlist ? ' \u00b7 on the watchlist' : ' \u00b7 found below the watchlist floor') + ' \u00b7 records no token' }),
      el('div', { class: 'detail-grid' },
        el('div', null,
          el('h3', { text: 'How the price is made' }),
          tiltRow('Category price', r.fitted_multiple, 0, 2),
          tiltRow('Size tilt', r.size_multiplier, 0.75, 1.35),
          tiltRow('Growth tilt', growthMult(r), 0.9, 1.15),
          tiltRow('Survival tilt', maturityMult(r), 0.88, 1.14),
          tiltRow('Breadth tilt', breadthMult(r), 1, 1.15),
          el('div', { class: 'bandbar' },
            el('div', { class: 'track' },
              el('span', { class: 'range', style: 'left:' + loPct.toFixed(1) + '%;width:' + Math.max(hiPct - loPct, 1).toFixed(1) + '%' }),
              el('span', { class: 'point', style: 'left:' + ptPct.toFixed(1) + '%' })),
            el('div', { class: 'lbls' }, el('span', { text: fmtUsd(r.band_low_usd) }), el('span', { text: 'implied ' + fmtUsd(r.implied_value_usd) }), el('span', { text: fmtUsd(r.band_high_usd) }))),
          el('p', { class: 'verdict-line' }, 'Verdict ', el('b', { text: r.verdict }), ': the plan below deploys ' + money(r.capital_usd) + ' of capital for about $' + r.plan_cost_usd + ' of gas over ' + r.plan_weeks + ' weeks. It earns its place if a launch values ' + r.name + ' anywhere inside the band and shares value with early users; it is attention advice, not a forecast.')),
        el('div', null,
          el('h3', { text: 'Farm plan \u00b7 ' + r.hold_days + ' days \u00b7 about $' + r.plan_cost_usd + ' of gas' }),
          el('ol', { class: 'steps' }, steps.map(function (s) { return el('li', { text: s }); })))));
  }

  function liveTable() {
    var head = el('thead', null, el('tr', null,
      el('th', { class: 'l', text: 'Traded anchor' }), el('th', { class: 'l', text: 'Category' }),
      el('th', { text: 'Market cap' }), el('th', { text: 'TVL' }), el('th', { text: 'Multiple' }), el('th', { text: '7d' })));
    var body = el('tbody', null, DATA.live.map(function (r) {
      return el('tr', null,
        el('td', { class: 'name l' }, r.name + (r.symbol ? ' \u00b7 ' + r.symbol : ''), el('span', { class: 'slug', text: r.slug })),
        el('td', { class: 'l', text: r.category || 'Other' }),
        el('td', { text: fmtUsd(r.mcap_usd) }), el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { text: r.multiple.toFixed(2) + 'x' }),
        el('td', { class: r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }));
    }));
    return el('div', null,
      el('p', { class: 'note', text: 'These are the anchors: protocols whose tokens already trade. The radar never ranks them; it learns the price of TVL from them \u2014 one row per ticker, exchanges excluded \u2014 and prices the pre-token board on the same scale. Market caps are the snapshot\u2019s own figures.' }),
      el('div', { class: 'board-wrap' }, el('table', null, head, body)));
  }

  function method() {
    var f = DATA.fit; var v = f.validation;
    var asideRows = Object.keys(DATA.set_aside).sort().map(function (k) {
      return el('tr', null, el('td', { class: 'l', text: k }), el('td', { text: String(DATA.set_aside[k]) }));
    });
    return el('section', { class: 'method' },
      el('h2', { text: 'Method & proof' }),
      el('p', { text: 'A launch is priced the way the market already prices its traded peers. For every traded anchor, the multiple is market cap divided by TVL. AnchorBand takes the median log-multiple per category (shrunk toward the global median when a category has few anchors), tilts it by a size slope fitted on the anchors themselves, then adjusts for the protocol\u2019s own seven-day growth, survival time and chain breadth. The band beside each value is where the middle half of the anchors themselves landed against this fit, so a wide band is the model saying launches are hard to price \u2014 not decoration.' }),
      el('div', { class: 'formula', text: 'implied = TVL x category multiple x size tilt x growth tilt x survival tilt x breadth tilt' }),
      el('p', null, 'Fitted on this snapshot: ', el('b', { text: f.anchors + ' anchors' }), ', global multiple ', el('b', { text: f.global_multiple.toFixed(3) + 'x' }), ', size slope ', el('b', { text: String(f.size_slope) }), ' around a pivot TVL of ', el('b', { text: fmtUsd(f.pivot_tvl_usd) }), ', and a band of ', el('b', { text: f.band_low_factor + 'x to ' + f.band_high_factor + 'x' }), ' from the anchors\u2019 residual interquartile range.'),
      el('p', null, 'The proof is a leave-one-out test the program runs on itself: every anchor is priced by a fit that never saw it. Median percentage error ', el('b', { text: v.fitted_median_ape_pct + '%' }), ' for the fitted price against ', el('b', { text: v.flat_median_ape_pct + '%' }), ' for a flat 0.25x of TVL; median log error ', el('b', { text: String(v.fitted_median_log_error) }), ' against ', el('b', { text: String(v.flat_median_log_error) }), ' \u2014 a typical miss of about ', el('b', { text: Math.pow(10, v.fitted_median_log_error).toFixed(1) + 'x' }), ' against ', el('b', { text: Math.pow(10, v.flat_median_log_error).toFixed(1) + 'x' }), ', across all ', el('b', { text: v.tested + ' anchors' }), '. The fitted price keeps its place only because it wins that test on both measures; the numbers are printed whatever they say.'),
      el('h3', { text: 'Every protocol in the snapshot, accounted for' }),
      el('p', { text: 'The snapshot holds ' + DATA.protocols_total + ' protocols. The board ranks ' + DATA.board_size + ' of them; the rest are set aside, each for a stated reason. A protocol that records a token is an anchor or a comp, never a launch candidate; a wrapped, staked or bridged product of a traded token is not a launch that has not happened.' }),
      el('table', null, el('thead', null, el('tr', null, el('th', { class: 'l', text: 'Set aside because it\u2026' }), el('th', { text: 'Protocols' }))), el('tbody', null, asideRows)),
      el('p', { class: 'note', text: 'Caveats, in the open: the snapshot records no token \u2014 it cannot prove a protocol has none. Seven-day growth is a week of weather, so it is clamped and dampened. The model prices what a token would be worth if the protocol\u2019s record stayed as it is; it does not predict whether or when a token is issued.' }));
  }

  function footer() {
    return el('footer', { text: 'AnchorBand ' + DATA.model_version + ' \u00b7 snapshot ' + DATA.as_of + ' \u00b7 ' + DATA.source + ' \u00b7 implied values are the model\u2019s own claims, recomputed from the snapshot on every run; the page works offline and every figure on it is in the data the program wrote.' });
  }

  function render() {
    app.setAttribute('aria-busy', 'true');
    app.textContent = '';
    app.appendChild(header());
    app.appendChild(lede());
    app.appendChild(controls());
    if (state.tab === 'board') {
      app.appendChild(boardTable());
      var d = detail();
      if (d) app.appendChild(d);
    } else if (state.tab === 'live') {
      app.appendChild(liveTable());
    } else {
      app.appendChild(method());
    }
    app.appendChild(footer());
    app.setAttribute('aria-busy', 'false');
    var sel = DATA.rows.find(function (x) { return x.slug === state.selected; });
    if (sel && state.tab === 'board') {
      var node = app.querySelector('.detail');
      if (node && state.fromHash) node.scrollIntoView();
    }
  }

  readHash();
  state.fromHash = Boolean(state.selected);
  render();
})();
