// AnchorBand: a token launch radar priced off its own snapshot.
//
// The idea in one paragraph. The snapshot already contains the market's own
// answer to "what is a protocol worth" for every protocol whose token trades:
// its market cap next to its TVL. AnchorBand learns the price of TVL from
// those traded protocols (the anchors), category by category, then carries
// that price across to the protocols that record no token yet. Each pre-token
// protocol is priced the way its traded peers are priced, tilted for its
// size, nudged for its seven-day growth, its survival time and its chain
// breadth, and published with an uncertainty band whose width is measured
// from the anchors' own residuals — never asserted. The fit is re-derived
// from the snapshot on every run, so the same program prices a future
// snapshot it has never seen. No protocol name is special-cased anywhere.
//
// The pipeline, exactly as fittedValue() runs it:
//   1. anchors    traded protocols (a market cap above zero, not an
//                 exchange's own token), one per ticker, largest cap kept.
//   2. multiples  each anchor's multiple is mcap / TVL; work in log10 so a
//                 400x outlier cannot drag a mean. The global price of TVL
//                 is the anchors' median log-multiple.
//   3. category   a category with at least MIN_CATEGORY_ANCHORS anchors gets
//                 its own median log-multiple, shrunk toward the global one
//                 with weight n / (n + SHRINK_K): thin categories borrow the
//                 global price instead of inventing their own.
//   4. size tilt  the slope of log-multiple against log-TVL across the
//                 anchors, clamped, pivoted on the anchors' median TVL:
//                 big protocols are priced at a lower multiple only as far
//                 as the anchors themselves say so.
//   5. price      base = TVL x fitted multiple (category, then size tilt).
//   6. tilts      growth (clamped, dampened: a week of TVL is weather, not
//                 climate), survival (a protocol that has run for years
//                 with no token has proved demand a young one has not), and
//                 breadth (each extra chain is distribution, capped).
//   7. band       the interquartile range of the anchors' own log residuals
//                 under this fit — the middle half of traded protocols
//                 landed within this band of their fitted price — becomes
//                 the low/high band printed beside every implied value.
//   8. proof      a leave-one-out test the program runs on itself: each
//                 anchor is priced by a fit that never saw it, and the
//                 median percentage error and median log error are reported
//                 next to the same test for a flat 0.25 x TVL rule. The
//                 dashboard prints all four numbers; the fitted price keeps
//                 its place only because it beats the flat one out of sample
//                 on both measures, as the Method view shows.
//
// Who gets ranked. A protocol is ranked when it records no token (no market
// cap, no CoinGecko id, no symbol on its record) and is not a product of a
// token that already trades: not an exchange, not a bridge or staking
// product category, not a versioned pool of another protocol, not a name
// carrying a whole word wrapped, staked or staking, and not a name beginning
// with an exchange's. Every watchlist slug is ranked whatever the filters
// say — the watchlist is the floor. Everything else in the snapshot is
// accounted for, not dropped: the dashboard counts the set-aside protocols
// by the reason each was set aside.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: every one is stated on the dashboard's Method view. */
export interface ModelConstants {
  shrink_k: number;
  min_category_anchors: number;
  size_slope_min: number;
  size_slope_max: number;
  size_adj_min: number;
  size_adj_max: number;
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  maturity_base: number;
  maturity_range: number;
  maturity_tau_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  flat_baseline_multiple: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 12,
  min_category_anchors: 5,
  size_slope_min: -0.3,
  size_slope_max: 0.1,
  size_adj_min: 0.75,
  size_adj_max: 1.35,
  growth_floor: -30,
  growth_cap: 50,
  growth_weight: 0.3,
  maturity_base: 0.88,
  maturity_range: 0.26,
  maturity_tau_days: 540,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_chains: 5,
  flat_baseline_multiple: 0.25,
};

/** The model's version label, printed on the dashboard and in board.json. */
export const MODEL_VERSION = 'anchorband-1';

/** How many traded anchors the Live view shows, by market cap. */
export const LIVE_ROWS = 36;

/** One board row: the gate's fields plus the model's own working. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  verdict: 'FARM' | 'WATCH' | 'THIN';
  model: {
    fitted_multiple: number;
    size_multiplier: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact row: the page rebuilds plans and verdicts from these figures. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  fitted_multiple: number;
  size_multiplier: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  verdict: 'FARM' | 'WATCH' | 'THIN';
  capital_usd: number;
  plan_cost_usd: number;
  plan_weeks: number;
  hold_days: number;
}

/** A traded anchor as the Live view shows it: the market's own figures, no model. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
  change_7d: number | null;
  symbol: string | null;
}

/** The fit itself: everything the dashboard's Method view states. */
export interface FitReport {
  anchors: number;
  global_multiple: number;
  size_slope: number;
  pivot_tvl_usd: number;
  band_low_factor: number;
  band_high_factor: number;
  categories_priced: number;
  validation: {
    tested: number;
    fitted_median_ape_pct: number;
    flat_median_ape_pct: number;
    fitted_median_log_error: number;
    flat_median_log_error: number;
  };
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: ModelConstants;
  fit: FitReport;
  protocols_total: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside: Record<string, number>;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from listed_at to as_of, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all on the snapshot's record. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Why a pre-token protocol is set aside instead of ranked, or null when it is
 * ranked. The watchlist's own taxonomy, applied to every candidate: a wrapped
 * or staked product of a traded token is not a launch that has not happened.
 */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.category === 'CEX') return 'exchange';
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return 'product of a traded token';
  if (VERSIONED.test(p.name)) return 'versioned pool';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  if (EXCHANGE_PREFIXES.some((x) => p.name === x || p.name.startsWith(`${x} `))) return 'exchange product';
  return null;
}

/** The traded anchors: a real market cap, not an exchange token, one row per ticker. */
export function anchorsOf(snapshot: Snapshot): SnapshotProtocol[] {
  const byTicker = new Map<string, SnapshotProtocol>();
  const untickered: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    if (p.symbol === null) {
      untickered.push(p);
      continue;
    }
    const kept = byTicker.get(p.symbol);
    if (kept === undefined || p.mcap_usd > kept.mcap_usd) byTicker.set(p.symbol, p);
  }
  return [...byTicker.values(), ...untickered].sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

/** A fitted price-of-TVL function plus the report the dashboard publishes. */
export interface Fit {
  multipleFor: (p: SnapshotProtocol) => { multiple: number; sizeMult: number };
  report: FitReport;
}

/** Fit the price of TVL on a set of anchors. Deterministic: sorted inputs, medians, one regression. */
export function fitAnchors(anchors: SnapshotProtocol[], model: ModelConstants): Fit {
  const logs = anchors.map((p) => ({
    p,
    logTvl: Math.log10(p.tvl_usd),
    logMult: Math.log10(p.mcap_usd! / p.tvl_usd),
  }));
  const globalLog = median(logs.map((l) => l.logMult));
  const pivotLog = median(logs.map((l) => l.logTvl));

  // Category medians, shrunk toward the global median by anchor count.
  const byCategory = new Map<string, number[]>();
  for (const l of logs) {
    const key = l.p.category ?? '';
    const list = byCategory.get(key) ?? [];
    list.push(l.logMult);
    byCategory.set(key, list);
  }
  const categoryLog = new Map<string, number>();
  for (const [key, list] of byCategory) {
    if (key === '' || list.length < model.min_category_anchors) continue;
    const w = list.length / (list.length + model.shrink_k);
    categoryLog.set(key, w * median(list) + (1 - w) * globalLog);
  }

  // The size slope: least squares of log-multiple on log-TVL, clamped.
  const meanX = logs.reduce((s, l) => s + l.logTvl, 0) / logs.length;
  const meanY = logs.reduce((s, l) => s + l.logMult, 0) / logs.length;
  let num = 0;
  let den = 0;
  for (const l of logs) {
    num += (l.logTvl - meanX) * (l.logMult - meanY);
    den += (l.logTvl - meanX) * (l.logTvl - meanX);
  }
  const slope = den > 0 ? clamp(num / den, model.size_slope_min, model.size_slope_max) : 0;

  const baseLogFor = (p: SnapshotProtocol): number => categoryLog.get(p.category ?? '') ?? globalLog;
  const sizeFor = (logTvl: number): number =>
    clamp(Math.pow(10, slope * (logTvl - pivotLog)), model.size_adj_min, model.size_adj_max);

  const multipleFor = (p: SnapshotProtocol): { multiple: number; sizeMult: number } => {
    const sizeMult = sizeFor(Math.log10(Math.max(1, p.tvl_usd)));
    return { multiple: Math.pow(10, baseLogFor(p)) * sizeMult, sizeMult };
  };

  // The band: where the middle half of the anchors themselves landed,
  // measured as log residuals of actual cap against this fit's price.
  const residuals = logs
    .map((l) => l.logMult - Math.log10(multipleFor(l.p).multiple))
    .sort((a, b) => a - b);
  const q = (f: number): number => residuals[Math.min(residuals.length - 1, Math.max(0, Math.floor(f * residuals.length)))]!;
  const bandLow = Math.pow(10, q(0.25));
  const bandHigh = Math.pow(10, q(0.75));

  // Leave-one-out proof: every anchor is priced by a fit that never saw it,
  // and the flat rule is scored on the same anchors the same way.
  const fittedApe: number[] = [];
  const flatApe: number[] = [];
  const fittedLog: number[] = [];
  const flatLog: number[] = [];
  if (anchors.length >= 20) {
    for (let i = 0; i < anchors.length; i++) {
      const held = anchors[i]!;
      const rest = anchors.filter((_, j) => j !== i);
      const predicted = held.tvl_usd * fitAnchorsShallow(rest, model)(held);
      const flat = held.tvl_usd * model.flat_baseline_multiple;
      fittedApe.push(Math.abs(predicted - held.mcap_usd!) / held.mcap_usd!);
      flatApe.push(Math.abs(flat - held.mcap_usd!) / held.mcap_usd!);
      fittedLog.push(Math.abs(Math.log10(predicted / held.mcap_usd!)));
      flatLog.push(Math.abs(Math.log10(flat / held.mcap_usd!)));
    }
  }
  const pct = (xs: number[]): number => (xs.length > 0 ? Math.round(median(xs) * 1000) / 10 : 0);
  const logErr = (xs: number[]): number => (xs.length > 0 ? Math.round(median(xs) * 1000) / 1000 : 0);

  return {
    multipleFor,
    report: {
      anchors: anchors.length,
      global_multiple: round4(Math.pow(10, globalLog)),
      size_slope: round4(slope),
      pivot_tvl_usd: Math.round(Math.pow(10, pivotLog)),
      band_low_factor: round4(bandLow),
      band_high_factor: round4(bandHigh),
      categories_priced: categoryLog.size,
      validation: {
        tested: fittedApe.length,
        fitted_median_ape_pct: pct(fittedApe),
        flat_median_ape_pct: pct(flatApe),
        fitted_median_log_error: logErr(fittedLog),
        flat_median_log_error: logErr(flatLog),
      },
    },
  };
}

/** The category-and-size price alone, refit on a subset: the split-half test's inner fit. */
function fitAnchorsShallow(anchors: SnapshotProtocol[], model: ModelConstants): (p: SnapshotProtocol) => number {
  const logs = anchors.map((p) => ({ p, logTvl: Math.log10(p.tvl_usd), logMult: Math.log10(p.mcap_usd! / p.tvl_usd) }));
  const globalLog = median(logs.map((l) => l.logMult));
  const pivotLog = median(logs.map((l) => l.logTvl));
  const byCategory = new Map<string, number[]>();
  for (const l of logs) {
    const list = byCategory.get(l.p.category ?? '') ?? [];
    list.push(l.logMult);
    byCategory.set(l.p.category ?? '', list);
  }
  const categoryLog = new Map<string, number>();
  for (const [key, list] of byCategory) {
    if (key === '' || list.length < model.min_category_anchors) continue;
    const w = list.length / (list.length + model.shrink_k);
    categoryLog.set(key, w * median(list) + (1 - w) * globalLog);
  }
  const meanX = logs.reduce((s, l) => s + l.logTvl, 0) / logs.length;
  const meanY = logs.reduce((s, l) => s + l.logMult, 0) / logs.length;
  let num = 0;
  let den = 0;
  for (const l of logs) {
    num += (l.logTvl - meanX) * (l.logMult - meanY);
    den += (l.logTvl - meanX) * (l.logTvl - meanX);
  }
  const slope = den > 0 ? clamp(num / den, model.size_slope_min, model.size_slope_max) : 0;
  return (p: SnapshotProtocol): number => {
    const base = categoryLog.get(p.category ?? '') ?? globalLog;
    const size = clamp(Math.pow(10, slope * (Math.log10(Math.max(1, p.tvl_usd)) - pivotLog)), model.size_adj_min, model.size_adj_max);
    return Math.pow(10, base) * size;
  };
}

/** One protocol's full valuation under the fit: the price and every tilt that moved it. */
export function valueOf(
  p: SnapshotProtocol,
  asOf: string,
  fit: Fit,
  model: ModelConstants,
): { implied: number; age: number | null; fittedMultiple: number; sizeMult: number; growthMult: number; maturityMult: number; breadthMult: number } {
  const age = ageDays(asOf, p.listed_at);
  const { multiple, sizeMult } = fit.multipleFor(p);
  const growthPct = clamp(p.change_7d ?? 0, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_base + model.maturity_range * (1 - Math.exp(-ageForModel / model.maturity_tau_days));
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
  return { implied, age, fittedMultiple: multiple / sizeMult, sizeMult, growthMult, maturityMult, breadthMult };
}

/** The farm verdict: a claim about attention, not value — is this row worth a farmer's weeks? */
export function verdictFor(implied: number, change7d: number | null): 'FARM' | 'WATCH' | 'THIN' {
  if (implied >= 25_000_000 && (change7d === null || change7d > -25)) return 'FARM';
  if (implied >= 6_000_000) return 'WATCH';
  return 'THIN';
}

/** Gas for one on-chain action, from the protocol's first chain: L1s cost, L2s and Solana do not. */
export function gasFor(p: SnapshotProtocol): number {
  const chain = (p.chains[0] ?? '').toLowerCase();
  if (chain === 'ethereum') return 6;
  if (chain === 'solana') return 0.3;
  if (['base', 'arbitrum', 'optimism', 'zksync era', 'linea', 'scroll', 'unichain'].includes(chain)) return 0.8;
  return 2;
}

/** Capital one farm position carries, from the protocol's own TVL: bigger pools absorb bigger positions. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 50;
}

/** How long a position must be held to count in more than one weekly snapshot, from the protocol's age. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 42;
  if (age < 180) return 56;
  if (age < 365) return 42;
  if (age < 730) return 35;
  return 28;
}

const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

/** The category's opening action, in words a farmer can follow without a second tab. */
function openingAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Supply ${money(capital)} of USDC as collateral in ${n} on ${chain}, then borrow ${money(Math.round(capital / 2))} against it and re-supply the borrow so both sides of the market see the wallet.`;
  if (c.includes('dex')) return `Swap ${money(capital)} into the main pair on ${n} on ${chain} and add it as liquidity in the deepest pool, keeping the LP position in the farming wallet.`;
  if (c.includes('deriv') || c.includes('perpetual')) return `Deposit ${money(capital)} of USDC margin on ${n} on ${chain} and open one small hedged position, half long and half short across two markets, so volume counts without directional risk.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit ${money(capital)} into the largest ${n} vault on ${chain} and keep the vault shares untouched in the farming wallet for the whole plan.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake ${money(capital)} of the chain's staking asset through ${n} on ${chain} and hold the receipt token in the farming wallet.`;
  if (c.includes('yield')) return `Deposit ${money(capital)} into the flagship ${n} vault on ${chain} and leave auto-compounding on so the balance grows on its own record.`;
  if (c.includes('rwa')) return `Mint ${money(capital)} of the ${n} yield asset on ${chain} through its own app and hold the minted asset in the farming wallet.`;
  if (c.includes('bridge')) return `Bridge ${money(capital)} of USDC to ${chain} through ${n}, then put the bridged funds to work in one app on the far side the same day.`;
  if (c.includes('insurance')) return `Buy ${money(capital)} of cover from ${n} on ${chain} for the longest term it sells and keep the policy NFT in the farming wallet.`;
  if (c.includes('prediction')) return `Fund the farming wallet with ${money(capital)} on ${n} and take one position in its most liquid market on ${chain}.`;
  if (c.includes('basis')) return `Open the ${n} basis position on ${chain} with ${money(capital)}: spot leg bought, hedge leg shorted, both from the farming wallet.`;
  return `Deposit ${money(capital)} of USDC into ${n} on ${chain} through its own app and keep the position open in the farming wallet.`;
}

/** The category's second, different qualifying action: breadth of use is what snapshots reward. */
function secondAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Repay half the borrow on ${n} and borrow again a week later, so the wallet shows a full lend-borrow-repay cycle rather than one parked deposit.`;
  if (c.includes('dex')) return `Make two swaps a week through ${n} on ${chain}, alternating direction, so the wallet's record is trading activity and not only liquidity.`;
  if (c.includes('deriv') || c.includes('perpetual')) return `Roll the hedge once a week on ${n}: close one leg and reopen it at the new price, keeping total margin inside the plan's capital.`;
  if (c.includes('curator') || c.includes('allocator')) return `Add a second, smaller deposit to a different ${n} vault on ${chain} in week two, so the wallet holds shares in more than one strategy.`;
  if (c.includes('restak') || c.includes('staking')) return `Claim and re-stake the rewards on ${n} once a week; the claim transactions are the activity record, so never let them pile up unclaimed.`;
  if (c.includes('yield')) return `Move ten percent of the position to a second ${n} vault on ${chain} in week two, then leave both vaults untouched.`;
  return `Repeat the opening action on ${n} once in week two at a tenth of the size, so the wallet's second week is on record as well as its first.`;
}

/**
 * A protocol's farm plan: seven steps, each carrying its cost and its time.
 * Everything in it is derived from the protocol's own record — category,
 * first chain, TVL and age — so the same code writes every plan and the
 * dashboard can rebuild any plan from the row alone.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const capital = capitalFor(p);
  const gas = gasFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(2, Math.ceil(hold / 7));
  const gasText = gas < 1 ? 'under $1 of gas' : `about $${gas} of gas`;
  const steps = [
    `Start with a fresh wallet funded only with the plan's capital plus gas, and store its seed phrase offline on paper. Cost: ${gasText} to fund and test. Time: 10 minutes.`,
    `${openingAction(p, capital, chain)} Cost: ${money(capital)} of capital and ${gasText}. Time: 20 minutes.`,
    `${secondAction(p, chain)} Cost: ${gasText} per action. Time: 10 minutes.`,
    `Return once a week for ${weeks} weeks and repeat one qualifying action on ${p.name}, so every weekly snapshot in the window holds an active wallet. Cost: ${gasText} a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days without withdrawing, so the activity spans more than one snapshot of ${p.name}'s record. Cost: the ${money(capital)} stays in the position. Time: ${hold} days.`,
    `Check the points or rewards page inside ${p.name}'s own app and follow only a claim link published there; a claim that asks for a fee or a signature on another site is not the protocol's. Cost: nothing to check, never pay to claim. Time: 10 minutes.`,
    `Log the wallet, the dates and every transaction hash in a farm log, then unwind the position in one session when the plan ends or the protocol announces its launch terms. Cost: ${gasText} to exit. Time: 15 minutes.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

/** The plan's cash cost (gas only; capital is held, not spent) and length, as the dashboard states them. */
export function planFigures(p: SnapshotProtocol, age: number | null): { capital: number; cost: number; weeks: number; hold: number } {
  const capital = capitalFor(p);
  const gas = gasFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(2, Math.ceil(hold / 7));
  const actions = 3 + weeks + 1;
  return { capital, cost: Math.max(1, Math.round(gas * actions * 10) / 10), weeks, hold };
}

/** The protocols the board ranks: every watchlist slug, plus every rankable pre-token protocol. */
export function rankedProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (!recordsNoToken(p)) continue;
    if (setAsideReason(p) !== null) continue;
    chosen.set(p.slug, p);
  }
  return [...chosen.values()];
}

/** Build the ranked board: ranks 1..N, implied value never rising as rank ascends. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = fitAnchors(anchorsOf(snapshot), model);
  const watch = new Set(snapshot.watchlist);
  const scored = rankedProtocols(snapshot).map((p) => ({ p, v: valueOf(p, snapshot.as_of, fit, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    on_watchlist: watch.has(s.p.slug),
    implied_value_usd: s.v.implied,
    band_low_usd: Math.max(1, Math.round(s.v.implied * fit.report.band_low_factor)),
    band_high_usd: Math.round(s.v.implied * fit.report.band_high_factor),
    verdict: verdictFor(s.v.implied, s.p.change_7d),
    model: {
      fitted_multiple: round4(s.v.fittedMultiple),
      size_multiplier: round4(s.v.sizeMult),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The traded anchors for the Live view, by market cap: the market's own values, unmodelled. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return anchorsOf(snapshot)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      multiple: round4(p.mcap_usd! / p.tvl_usd),
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** Count every snapshot protocol the board does not rank, by the reason it was set aside. */
export function setAsideCounts(snapshot: Snapshot): Record<string, number> {
  const ranked = new Set(rankedProtocols(snapshot).map((p) => p.slug));
  const counts: Record<string, number> = {};
  for (const p of snapshot.protocols) {
    if (ranked.has(p.slug)) continue;
    const reason = recordsNoToken(p) ? (setAsideReason(p) ?? 'set aside') : 'records a token';
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const anchors = anchorsOf(snapshot);
  const fit = fitAnchors(anchors, model);
  const board = buildBoard(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: model,
    fit: fit.report,
    protocols_total: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: anchors.length,
    set_aside: setAsideCounts(snapshot),
    rows: board.map((r) => {
      const p = index.get(r.slug)!;
      const figures = planFigures(p, r.age_days);
      // Full-precision tilts for the page: board.json carries them rounded to
      // four places for legibility, but the dashboard recomputes the implied
      // value from these figures and the two must agree to the dollar.
      const v = valueOf(p, snapshot.as_of, fit, model);
      return {
        rank: r.rank,
        slug: r.slug,
        name: r.name,
        category: r.category,
        chains: r.chains,
        tvl_usd: r.tvl_usd,
        change_7d: r.change_7d,
        listed_at: r.listed_at,
        age_days: r.age_days,
        on_watchlist: r.on_watchlist,
        implied_value_usd: r.implied_value_usd,
        band_low_usd: r.band_low_usd,
        band_high_usd: r.band_high_usd,
        fitted_multiple: v.fittedMultiple,
        size_multiplier: v.sizeMult,
        growth_multiplier: v.growthMult,
        maturity_multiplier: v.maturityMult,
        breadth_multiplier: v.breadthMult,
        verdict: r.verdict,
        capital_usd: figures.capital,
        plan_cost_usd: figures.cost,
        plan_weeks: figures.weeks,
        hold_days: figures.hold,
      };
    }),
    live: liveRows(snapshot),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, shared values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not a snapshot protocol`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return 'every row shares one implied value';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
