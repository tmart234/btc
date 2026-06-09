/**
 * Polymarket Arbitrage Math
 * ----------------------------------------------------------------------------
 * A self-contained library implementing the core mathematics behind systematic
 * prediction-market arbitrage, distilled from:
 *
 *   - "Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets"
 *     (arXiv:2508.03474)
 *   - "Decision Markets ... Bregman divergence / market making" (arXiv:1606.02825)
 *
 * The article that motivated this module describes four reusable ideas. This
 * file implements each as a pure, testable function:
 *
 *   1. Single-condition arbitrage   -> YES + NO != $1 (Strategy 1 in the paper)
 *   2. Partition / rebalancing arb  -> a set of mutually-exclusive & exhaustive
 *                                      outcomes whose prices do not sum to $1
 *                                      (Strategy 2, the bigger bucket: ~$29M)
 *   3. No-arbitrage projection      -> project the quoted price vector onto the
 *                                      "marginal polytope" of logically valid
 *                                      outcomes under a Bregman (KL) divergence,
 *                                      solved with Frank-Wolfe + a linear-
 *                                      minimization oracle so you never have to
 *                                      enumerate 2^n outcomes.
 *   4. Sizing & execution           -> Kelly sizing capped by order-book depth,
 *                                      and a sequential CLOB fill simulator that
 *                                      shows why naive "buy both legs" loses.
 *
 * Everything here is model math, not trading advice. It does no networking.
 *
 * Dual-mode: attaches to window.BTC.polymarket in the browser (matching the
 * rest of this repo) and exports via module.exports under Node.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.BTC = window.BTC || {};
    window.BTC.polymarket = api;
  }
  // eslint-disable-next-line no-unused-expressions
  root;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-12;
  const clampProb = (p) => Math.min(1 - EPS, Math.max(EPS, p));

  // ==========================================================================
  // 1. SINGLE-CONDITION ARBITRAGE  (Strategy 1)
  // --------------------------------------------------------------------------
  // A binary market resolves so that exactly one of {YES, NO} pays $1. A
  // "complete set" (one YES + one NO) therefore always redeems for exactly $1.
  //   - If you can BUY the set for less than $1  -> guaranteed underpriced arb.
  //   - If you can SELL the set for more than $1 -> guaranteed overpriced arb
  //     (mint a complete set from $1 collateral, sell both legs).
  // feeRate is charged per leg on notional (Polymarket is fee-free today, but
  // the paper models it; keep it parametric so the threshold stays honest).
  // ==========================================================================

  function detectSingleConditionArbitrage(yesAsk, noAsk, opts = {}) {
    const feeRate = opts.feeRate ?? 0;
    const minProfit = opts.minProfit ?? 0.05; // paper's minimum profit threshold
    const yesBid = opts.yesBid; // needed to evaluate the overpriced (sell) side
    const noBid = opts.noBid;

    const out = {
      type: 'single-condition',
      hasArb: false,
      side: null,
      grossEdge: 0,
      netEdge: 0,
      action: null,
    };

    // Underpriced: buy YES @ ask + NO @ ask, redeem for $1.
    const buyCost = yesAsk + noAsk;
    const buyFees = feeRate * (yesAsk + noAsk);
    const buyEdge = 1 - buyCost - buyFees;

    // Overpriced: mint a set for $1, sell YES @ bid + NO @ bid.
    let sellEdge = -Infinity;
    if (Number.isFinite(yesBid) && Number.isFinite(noBid)) {
      const proceeds = yesBid + noBid;
      const sellFees = feeRate * proceeds;
      sellEdge = proceeds - 1 - sellFees;
    }

    if (buyEdge >= sellEdge) {
      out.grossEdge = 1 - buyCost;
      out.netEdge = buyEdge;
      if (buyEdge >= minProfit) {
        out.hasArb = true;
        out.side = 'underpriced';
        out.action = `BUY YES @ ${yesAsk} + BUY NO @ ${noAsk} -> redeem $1`;
      }
    } else {
      out.grossEdge = (yesBid + noBid) - 1;
      out.netEdge = sellEdge;
      if (sellEdge >= minProfit) {
        out.hasArb = true;
        out.side = 'overpriced';
        out.action = `MINT set for $1 -> SELL YES @ ${yesBid} + SELL NO @ ${noBid}`;
      }
    }
    return out;
  }

  // ==========================================================================
  // 2. PARTITION / MARKET-REBALANCING ARBITRAGE  (Strategy 2)
  // --------------------------------------------------------------------------
  // Given k outcomes that are mutually exclusive AND collectively exhaustive
  // (a partition of the event space, e.g. "who wins the election"), exactly one
  // YES pays $1. So a basket of one YES per outcome redeems for exactly $1.
  //   - sum(YES) < 1 -> BUY every YES, redeem $1: profit = 1 - sum(YES).
  //   - sum(YES) > 1 -> BUY every NO. With k outcomes a full NO basket pays
  //     (k-1) (every loser's NO pays), and costs sum(1 - YES) = k - sum(YES),
  //     so profit = (k-1) - (k - sum(YES)) = sum(YES) - 1.
  // Net: guaranteed profit per basket = |1 - sum(YES)|, sign picks the side.
  // ==========================================================================

  function detectPartitionArbitrage(yesPrices, opts = {}) {
    const feeRate = opts.feeRate ?? 0;
    const minProfit = opts.minProfit ?? 0.05;
    const k = yesPrices.length;
    const sum = yesPrices.reduce((a, b) => a + b, 0);

    const out = {
      type: 'partition',
      k,
      sumYes: sum,
      hasArb: false,
      side: null,
      grossEdge: Math.abs(1 - sum),
      netEdge: 0,
      action: null,
    };

    if (sum < 1) {
      const fees = feeRate * sum;
      out.netEdge = (1 - sum) - fees;
      out.side = 'buy-all-yes';
      out.action = `BUY all ${k} YES legs (cost ${sum.toFixed(4)}) -> redeem $1`;
    } else {
      const noBasketCost = k - sum; // sum(1 - p_i)
      const fees = feeRate * noBasketCost;
      out.netEdge = (sum - 1) - fees;
      out.side = 'buy-all-no';
      out.action = `BUY all ${k} NO legs (cost ${noBasketCost.toFixed(4)}) -> redeem $${k - 1}`;
    }
    out.hasArb = out.netEdge >= minProfit;
    return out;
  }

  // ==========================================================================
  // 3. NO-ARBITRAGE PROJECTION VIA FRANK-WOLFE  (the "probabilistic forest")
  // --------------------------------------------------------------------------
  // The general case: n logically-linked binary conditions. A price vector
  // q in [0,1]^n is arbitrage-free iff it lies in the MARGINAL POLYTOPE
  //   M = conv{ x_v : v is a logically valid joint outcome },
  // where x_v in {0,1}^n marks which conditions are TRUE in outcome v. q outside
  // M means some basket of YES/NO shares is a guaranteed money-maker.
  //
  // The minimum-cost trade that removes the arbitrage projects q onto M under
  // the Bregman divergence generated by the market maker's cost function. LMSR
  // uses (negative) entropy, whose Bregman divergence is the generalized KL:
  //   D(p, q) = sum_i [ p_i ln(p_i/q_i) - p_i + q_i ].
  // The DOLLAR value of the guaranteed arbitrage equals this divergence at the
  // projection p* = argmin_{p in M} D(p, q)   (the paper's headline result).
  //
  // M has exponentially many vertices, so we never enumerate it. Frank-Wolfe
  // only needs a LINEAR-MINIMIZATION ORACLE: given a gradient g, return the
  // single best vertex argmin_{v in M} <g, v>. Because vertices are 0/1
  // outcome indicators, that oracle is "find the highest-value valid outcome"
  // -- an integer program (Gurobi in production; brute force / partition-aware
  // here). Each iteration grows the active set by one vertex, so after 100
  // iterations you track 100 vertices instead of 2^n.
  // ==========================================================================

  // Generalized-KL Bregman divergence (LMSR / log-cost geometry).
  function bregmanKL(p, q) {
    let d = 0;
    for (let i = 0; i < p.length; i++) {
      const pi = Math.max(EPS, p[i]);
      const qi = Math.max(EPS, q[i]);
      d += pi * Math.log(pi / qi) - pi + qi;
    }
    return d;
  }

  // Gradient of f(p) = D(p, q) w.r.t. p:  grad_i = ln(p_i / q_i).
  function gradKL(p, q) {
    return p.map((pi, i) => Math.log(Math.max(EPS, pi) / Math.max(EPS, q[i])));
  }

  /**
   * Project q onto the marginal polytope M with Frank-Wolfe.
   *
   * @param {number[]} q             quoted YES prices, one per condition.
   * @param {function} lmo           linear-minimization oracle:
   *                                 (gradient:number[]) => vertex:number[] in {0,1}^n,
   *                                 the valid outcome minimizing <gradient, vertex>.
   * @param {object}   [opts]
   * @param {number}   [opts.maxIter=200]
   * @param {number}   [opts.tol=1e-7]   stop when the Frank-Wolfe duality gap < tol.
   * @param {boolean}  [opts.lineSearch=true] exact-ish line search vs 2/(t+2) step.
   * @returns {{ projection, divergence, gap, iterations, activeSet, converged }}
   */
  function frankWolfeProject(q, lmo, opts = {}) {
    const maxIter = opts.maxIter ?? 200;
    const tol = opts.tol ?? 1e-7;
    const useLineSearch = opts.lineSearch ?? true;
    const n = q.length;

    // Start at a vertex: the best valid outcome under the gradient at q itself.
    let p = lmo(gradKL(q.map(clampProb), q)).slice();
    const activeSet = new Set([p.join(',')]);
    let gap = Infinity;
    let t = 0;

    for (t = 0; t < maxIter; t++) {
      const g = gradKL(p, q);
      const s = lmo(g); // new candidate vertex
      activeSet.add(s.join(','));

      // Frank-Wolfe duality gap: <g, p - s> >= 0, upper-bounds f(p) - f(p*).
      let dir = 0;
      for (let i = 0; i < n; i++) dir += g[i] * (p[i] - s[i]);
      gap = dir;
      if (gap < tol) break;

      let gamma;
      if (useLineSearch) {
        gamma = lineSearchKL(p, s, q);
      } else {
        gamma = 2 / (t + 2);
      }
      for (let i = 0; i < n; i++) p[i] = p[i] + gamma * (s[i] - p[i]);
    }

    return {
      projection: p,
      divergence: bregmanKL(p, q), // guaranteed-arbitrage dollar value
      gap,
      iterations: t,
      activeSet: activeSet.size,
      converged: gap < tol,
    };
  }

  // Backtracking line search for gamma in [0,1] minimizing f((1-g)p + g s).
  function lineSearchKL(p, s, q) {
    const f = (g) => {
      const x = p.map((pi, i) => pi + g * (s[i] - pi));
      return bregmanKL(x, q);
    };
    let lo = 0;
    let hi = 1;
    // Golden-section search; convex objective so this is safe and fast.
    const phi = (Math.sqrt(5) - 1) / 2;
    let a = hi - phi * (hi - lo);
    let b = lo + phi * (hi - lo);
    let fa = f(a);
    let fb = f(b);
    for (let i = 0; i < 40; i++) {
      if (fa < fb) {
        hi = b; b = a; fb = fa;
        a = hi - phi * (hi - lo); fa = f(a);
      } else {
        lo = a; a = b; fa = fb;
        b = lo + phi * (hi - lo); fb = f(b);
      }
    }
    return (lo + hi) / 2;
  }

  // --------------------------------------------------------------------------
  // Linear-minimization oracle builders.
  // --------------------------------------------------------------------------

  /**
   * Brute-force LMO over an explicit list of valid outcomes. Each outcome is a
   * 0/1 vector of length n. Fine for small n or a pre-filtered candidate set
   * (the "AI dependency detection" step emits exactly this list).
   */
  function makeEnumeratedLMO(validOutcomes) {
    if (!validOutcomes.length) throw new Error('LMO needs >=1 valid outcome');
    return function lmo(grad) {
      let best = null;
      let bestVal = Infinity;
      for (const v of validOutcomes) {
        let val = 0;
        for (let i = 0; i < grad.length; i++) val += grad[i] * v[i];
        if (val < bestVal) { bestVal = val; best = v; }
      }
      return best;
    };
  }

  /**
   * Enumerate all logically valid outcomes of n binary conditions subject to a
   * predicate. Use only for modest n (<= ~22); above that you want a structured
   * IP oracle. This is the brute-force baseline the paper replaces.
   */
  function enumerateValidOutcomes(n, isValid) {
    const out = [];
    const total = 1 << n;
    for (let mask = 0; mask < total; mask++) {
      const v = new Array(n);
      for (let i = 0; i < n; i++) v[i] = (mask >> i) & 1;
      if (!isValid || isValid(v)) out.push(v);
    }
    return out;
  }

  /**
   * Partition-structured LMO: the conditions form groups, and within each group
   * exactly one condition is TRUE (a one-hot partition, e.g. "exactly one team
   * wins"). The oracle is then separable -- in each group pick the index with
   * the smallest gradient -- so it is O(n) with NO enumeration. This is the
   * canonical structured integer program the paper exploits.
   *
   * @param {number[][]} groups  arrays of condition indices; each group is
   *                             exactly-one-hot. Indices not in any group are
   *                             free (chosen 0 since prices/gradients >= entry).
   */
  function makePartitionLMO(n, groups) {
    return function lmo(grad) {
      const v = new Array(n).fill(0);
      for (const group of groups) {
        let best = group[0];
        for (const idx of group) if (grad[idx] < grad[best]) best = idx;
        v[best] = 1;
      }
      // Free conditions: turn on only if it strictly lowers <grad, v>.
      const inGroup = new Set(groups.flat());
      for (let i = 0; i < n; i++) {
        if (!inGroup.has(i) && grad[i] < 0) v[i] = 1;
      }
      return v;
    };
  }

  // ==========================================================================
  // 4. POSITION SIZING & EXECUTION
  // --------------------------------------------------------------------------

  /**
   * Modified Kelly sizing for an arbitrage leg with execution risk.
   *
   * Pure arbitrage is "infinite edge" so vanilla Kelly says bet everything --
   * which ignores that a leg can fail to fill, turning the trade into a
   * directional loss. We model the trade as a bet that wins fraction `gain`
   * with probability `pSuccess` and loses fraction `loss` with prob (1-pSuccess).
   * Kelly fraction for an asymmetric bet:  f* = p/lossFrac - (1-p)/gainFrac,
   * expressed as a fraction of bankroll, then floored at 0.
   *
   * The result is capped two ways the paper insists on:
   *   - bankrollCap: never exceed `kellyFraction` of portfolio value.
   *   - depthCap: never take more than `depthFraction` (default 50%) of the
   *     visible book, so you don't move the market against yourself.
   */
  function kellySize(params) {
    const {
      bankroll,
      gain,             // fractional profit if the arb completes (e.g. 0.05)
      loss = 1,         // fractional loss if a leg fails (worst case ~ full leg)
      pSuccess = 0.87,  // paper's single-condition fill rate
      kellyFraction = 0.5, // half-Kelly is standard for safety
      bookDepthShares,  // shares available at/near the target price
      legPrice,         // $ per share, to convert depth cap into dollars
      depthFraction = 0.5,
    } = params;

    const g = Math.max(EPS, gain);
    const l = Math.max(EPS, loss);
    const rawKelly = pSuccess / l - (1 - pSuccess) / g;
    const fStar = Math.max(0, rawKelly) * kellyFraction;

    let dollars = fStar * bankroll;
    const bankrollCapDollars = kellyFraction * bankroll;
    dollars = Math.min(dollars, bankrollCapDollars);

    // Depth cap: at most depthFraction of the book, valued at legPrice.
    if (Number.isFinite(bookDepthShares) && Number.isFinite(legPrice)) {
      const depthCapDollars = depthFraction * bookDepthShares * legPrice;
      dollars = Math.min(dollars, depthCapDollars);
    }

    return {
      kellyFractionRaw: rawKelly,
      fractionUsed: fStar,
      dollars: Math.max(0, dollars),
      shares: Number.isFinite(legPrice) && legPrice > 0 ? dollars / legPrice : null,
    };
  }

  /**
   * Sequential CLOB fill simulator. Polymarket fills legs one at a time against
   * a live book, not atomically -- so the price you see is not the price you
   * get. Walk each leg's book levels for the requested size and return the
   * realized average price (with slippage). This is how you discover that
   * "buy YES @ 0.30, buy NO @ 0.30" becomes "0.30 then 0.78" and the edge dies.
   *
   * @param {Array<{shares:number, book:Array<[price:number, size:number]>}>} legs
   * @returns {{ legs:[], totalCost:number, filledAll:boolean }}
   */
  function simulateSequentialFill(legs) {
    const results = [];
    let totalCost = 0;
    let filledAll = true;

    for (const leg of legs) {
      let remaining = leg.shares;
      let cost = 0;
      let filled = 0;
      for (const [price, size] of leg.book) {
        if (remaining <= EPS) break;
        const take = Math.min(remaining, size);
        cost += take * price;
        filled += take;
        remaining -= take;
      }
      if (remaining > EPS) filledAll = false;
      const avgPrice = filled > 0 ? cost / filled : null;
      results.push({ requested: leg.shares, filled, avgPrice, cost });
      totalCost += cost;
    }
    return { legs: results, totalCost, filledAll };
  }

  // ==========================================================================
  // CONVENIENCE: end-to-end scan of one market group
  // ==========================================================================

  /**
   * Given a list of {label, yesAsk, noAsk, yesBid, noBid} legs that form a
   * partition, return the best detectable arbitrage plus its KL-projection
   * value. Combines Strategy 1/2 detection with the Frank-Wolfe value so a
   * caller sees both the model-free dollar edge and the information-geometry
   * optimum in one shot.
   */
  function scanPartitionGroup(legs, opts = {}) {
    const yesPrices = legs.map((l) => clampProb(l.yesAsk));
    const partition = detectPartitionArbitrage(yesPrices, opts);

    // No-arb projection: single one-hot group over all k legs.
    const n = legs.length;
    const lmo = makePartitionLMO(n, [Array.from({ length: n }, (_, i) => i)]);
    const proj = frankWolfeProject(yesPrices, lmo, opts);

    return {
      partition,
      projection: proj.projection,
      bregmanValue: proj.divergence,
      frankWolfeIters: proj.iterations,
      activeSetSize: proj.activeSet,
    };
  }

  return {
    // detection
    detectSingleConditionArbitrage,
    detectPartitionArbitrage,
    scanPartitionGroup,
    // projection / Bregman
    bregmanKL,
    gradKL,
    frankWolfeProject,
    makeEnumeratedLMO,
    makePartitionLMO,
    enumerateValidOutcomes,
    // sizing & execution
    kellySize,
    simulateSequentialFill,
    // constants
    EPS,
  };
});
