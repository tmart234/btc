#!/usr/bin/env node
/**
 * Demo / self-test for js/polymarket.js, driven by the exact examples from the
 * article ("Las matematicas exactas que sacaron $40,000,000 de Polymarket").
 *
 * Run:  node scripts/polymarket_arb_demo.js
 * Exits non-zero if any sanity assertion fails, so it doubles as a smoke test.
 */
'use strict';

const pm = require('../js/polymarket.js');

let failures = 0;
function check(name, cond) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
function hr(title) {
  console.log('\n' + '='.repeat(72) + '\n' + title + '\n' + '-'.repeat(72));
}

// ---------------------------------------------------------------------------
hr('1. Single-condition arbitrage  (article: YES 0.62 + NO 0.33 = 0.95)');
{
  const r = pm.detectSingleConditionArbitrage(0.62, 0.33, { minProfit: 0.01 });
  console.log(r);
  check('detects underpriced arb', r.hasArb && r.side === 'underpriced');
  check('edge ~ 0.05', Math.abs(r.netEdge - 0.05) < 1e-9);

  // A fair market: YES 0.48 + NO 0.52 = 1.00 -> no arb.
  const fair = pm.detectSingleConditionArbitrage(0.48, 0.52, { minProfit: 0.01 });
  check('fair 0.48/0.52 has no arb', !fair.hasArb);

  // Overpriced (sell) side: bids sum > 1.
  const over = pm.detectSingleConditionArbitrage(0.7, 0.7, {
    minProfit: 0.05, yesBid: 0.6, noBid: 0.55,
  });
  check('detects overpriced/mint-and-sell arb', over.hasArb && over.side === 'overpriced');
}

// ---------------------------------------------------------------------------
hr('2. Partition arbitrage  (mutually exclusive + exhaustive outcomes)');
{
  // Election with 4 candidates whose YES prices sum to 0.92 < 1.
  const r = pm.detectPartitionArbitrage([0.45, 0.30, 0.12, 0.05], { minProfit: 0.01 });
  console.log(r);
  check('buy-all-yes when sum < 1', r.hasArb && r.side === 'buy-all-yes');
  check('edge = 1 - 0.92 = 0.08', Math.abs(r.netEdge - 0.08) < 1e-9);

  // Overpriced partition sums to 1.10 -> buy all NO.
  const over = pm.detectPartitionArbitrage([0.5, 0.35, 0.25], { minProfit: 0.01 });
  check('buy-all-no when sum > 1', over.hasArb && over.side === 'buy-all-no');
  check('edge = 1.10 - 1 = 0.10', Math.abs(over.netEdge - 0.10) < 1e-9);
}

// ---------------------------------------------------------------------------
hr('3. Logical dependency  (article: Trump PA vs "GOP wins PA by 5+")');
{
  // Conditions: c0 = "Trump wins PA", c1 = "GOP wins PA by 5+".
  // Dependency: c1 => c0 (you cannot win by 5+ without winning). So the outcome
  // (c0=0, c1=1) is INVALID. Quoted YES: Trump 0.48, GOP+5 0.32.
  const valid = pm.enumerateValidOutcomes(2, (v) => !(v[0] === 0 && v[1] === 1));
  console.log('  valid outcomes:', JSON.stringify(valid));
  const lmo = pm.makeEnumeratedLMO(valid);

  // (a) The article's exact marginals are already consistent (0.32 <= 0.48):
  // inside the polytope, so the projection does not move and Bregman value ~ 0.
  const consistent = pm.frankWolfeProject([0.48, 0.32], lmo, { maxIter: 200 });
  console.log('  (a) 0.48/0.32 -> proj',
    consistent.projection.map((x) => x.toFixed(4)),
    '| bregman $', consistent.divergence.toFixed(6));
  check('(a) consistent quote: ~zero arbitrage value', consistent.divergence < 1e-4);

  // (b) Now violate the dependency: GOP-by-5+ quoted ABOVE Trump-wins (0.55 >
  // 0.48) is impossible, so the quote sits OUTSIDE the polytope. The projection
  // pulls it back onto the c1 <= c0 face and the Bregman divergence is the
  // dollar value of the guaranteed trade.
  const q = [0.48, 0.55];
  const res = pm.frankWolfeProject(q, lmo, { maxIter: 200 });
  console.log('  (b) 0.48/0.55 -> proj', res.projection.map((x) => x.toFixed(4)),
    '| bregman $', res.divergence.toFixed(6),
    '| gap', res.gap.toExponential(2), '| iters', res.iterations);
  check('(b) projection respects c1 <= c0', res.projection[1] <= res.projection[0] + 1e-6);
  check('(b) arbitrage has positive dollar value', res.divergence > 1e-3);
  check('(b) converged', res.converged);
}

// ---------------------------------------------------------------------------
hr('4. Frank-Wolfe scales: marginal polytope without enumerating 2^n');
{
  // Duke vs Cornell style: two teams, each a one-hot "number of wins" bracket
  // of 7 outcomes => 14 conditions, but only the one-hot-per-team vertices are
  // valid. Partition-aware LMO is O(n), no 2^14 enumeration.
  const n = 14;
  const groups = [
    [0, 1, 2, 3, 4, 5, 6],      // team A win-count buckets
    [7, 8, 9, 10, 11, 12, 13],  // team B win-count buckets
  ];
  // Mispriced quote: each group's YES prices sum to 1.18 (overpriced).
  const groupPrices = [0.30, 0.25, 0.20, 0.15, 0.13, 0.10, 0.05]; // sums 1.18
  const q = [...groupPrices, ...groupPrices];
  const lmo = pm.makePartitionLMO(n, groups);
  const res = pm.frankWolfeProject(q, lmo, { maxIter: 300 });
  console.log('  conditions :', n, '(brute force would be 2^14 =', (1 << n) + ')');
  console.log('  active set :', res.activeSet, 'vertices tracked');
  console.log('  bregman $  :', res.divergence.toFixed(6),
    '| iters', res.iterations, '| converged', res.converged);
  // Each group should project back onto the simplex (sum ~ 1).
  const sumA = res.projection.slice(0, 7).reduce((a, b) => a + b, 0);
  const sumB = res.projection.slice(7).reduce((a, b) => a + b, 0);
  console.log('  group sums :', sumA.toFixed(4), sumB.toFixed(4));
  check('group A projects onto simplex (sum ~ 1)', Math.abs(sumA - 1) < 1e-3);
  check('group B projects onto simplex (sum ~ 1)', Math.abs(sumB - 1) < 1e-3);
  check('active set << 2^n', res.activeSet < 50);
}

// ---------------------------------------------------------------------------
hr('5. Kelly sizing capped by order-book depth');
{
  const size = pm.kellySize({
    bankroll: 100000,
    gain: 0.05,            // 5 cents of guaranteed edge
    loss: 0.30,            // worst case if a leg fails
    pSuccess: 0.87,
    kellyFraction: 0.5,
    bookDepthShares: 2000, // only 2000 shares on the book
    legPrice: 0.30,
    depthFraction: 0.5,    // never take >50% of the book
  });
  console.log(size);
  // Depth cap = 0.5 * 2000 * 0.30 = $300, which binds before bankroll.
  check('depth cap binds at $300', Math.abs(size.dollars - 300) < 1e-6);
  check('shares respect depth cap (<= 1000)', size.shares <= 1000 + 1e-6);
}

// ---------------------------------------------------------------------------
hr('6. Why naive execution loses  (article: 0.30 then 0.78 sequential fill)');
{
  // Plan: buy 1000 YES @ 0.30 and 1000 NO @ 0.30 -> "guaranteed" $0.40 edge.
  // Reality: only 50 shares sit at 0.30 on the NO book; the rest is at 0.85
  // because the first leg moved the market before the second leg landed.
  const sim = pm.simulateSequentialFill([
    { shares: 1000, book: [[0.30, 1000]] },                 // YES fills clean
    { shares: 1000, book: [[0.30, 50], [0.85, 5000]] },     // NO slips badly
  ]);
  console.log('  YES avg:', sim.legs[0].avgPrice.toFixed(4),
    '| NO avg:', sim.legs[1].avgPrice.toFixed(4));
  console.log('  total cost for the set:', sim.totalCost.toFixed(2),
    '| redeems for:', 1000);
  const pnl = 1000 - sim.totalCost; // each YES+NO set redeems $1 -> 1000 sets
  console.log('  realized PnL:', pnl.toFixed(2), '(planned was +400)');
  check('naive sequential fill turns the "arb" into a loss', pnl < 0);
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
