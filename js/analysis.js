/**
 * Bitcoin AI Analyst - Technical Analysis Module
 * Indicators, pattern detection, and trade setup calculations
 */
(function() {
  'use strict';

  window.BTC = window.BTC || {};
  const { config, utils } = window.BTC;

  // ============================================
  // TECHNICAL INDICATORS
  // ============================================

  const calculateRSI = (prices, period = 14) => {
    if (prices.length <= period) return new Array(prices.length).fill(50);
    let gains = 0, losses = 0;
    const rsi = new Array(prices.length).fill(50);

    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff; 
      else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? -diff : 0;
      avgGain = ((avgGain * (period - 1)) + currentGain) / period;
      avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
      if (avgLoss === 0) rsi[i] = 100;
      else {
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    }
    return rsi;
  };

  const calculateATRSeries = (data, period = 14) => {
    const n = data.length;
    const atrs = new Array(n).fill(0);
    let trSum = 0;
    
    for (let i = 1; i <= period && i < n; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      trSum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }
    
    let atr = trSum / period;
    atrs[period] = atr;
    
    for (let i = period + 1; i < n; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      atrs[i] = ((atrs[i - 1] * (period - 1)) + tr) / period;
    }
    return atrs;
  };

  const calculateEMA = (data, period) => {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    const res = new Array(data.length).fill(null);
    let sum = 0;
    
    for (let i = 0; i < period; i++) sum += data[i];
    res[period - 1] = sum / period;
    
    for (let i = period; i < data.length; i++) {
      res[i] = data[i] * k + res[i - 1] * (1 - k);
    }
    return res;
  };

  const calculateSMA = (data, period) => {
    if (data.length < period) return new Array(data.length).fill(null);
    const res = new Array(data.length).fill(null);
    let sum = 0;
    
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      if (i >= period) sum -= data[i - period];
      if (i >= period - 1) res[i] = sum / period;
    }
    
    for (let i = 1; i < res.length; i++) {
      if (res[i] === null && res[i - 1] !== null && i > data.length - period) {
        res[i] = res[i - 1];
      }
    }
    return res;
  };

  const calculateMACD = (prices, fast = 12, slow = 26, signal = 9) => {
    const fastEMA = calculateEMA(prices, fast);
    const slowEMA = calculateEMA(prices, slow);
    const macdLine = prices.map((_, i) =>
      (fastEMA[i] !== null && slowEMA[i] !== null) ? fastEMA[i] - slowEMA[i] : 0
    );
    
    const validMacdStart = slow - 1;
    const validMacdValues = macdLine.slice(validMacdStart);
    const validSignalValues = calculateEMA(validMacdValues, signal);
    const signalLine = new Array(prices.length).fill(0);
    
    for (let i = 0; i < validSignalValues.length; i++) {
      signalLine[i + validMacdStart] = validSignalValues[i] || 0;
    }
    
    return macdLine.map((m, i) => ({ 
      macd: m, 
      signal: signalLine[i], 
      histogram: m - signalLine[i] 
    }));
  };

  const calculateADX = (data, period = 14) => {
    if (data.length < period * 2) {
      return { adx: 0, diPlus: 0, diMinus: 0, adxSeries: [], slope: 0 };
    }
    
    let tr = [], dmPlus = [], dmMinus = [];
    
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
      
      const upMove = data[i].high - data[i - 1].high;
      const downMove = data[i - 1].low - data[i].low;
      dmPlus.push((upMove > downMove && upMove > 0) ? upMove : 0);
      dmMinus.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }
    
    const smooth = (arr, per) => {
      let res = [];
      let sum = 0;
      for (let i = 0; i < per; i++) sum += arr[i];
      res.push(sum);
      for (let i = per; i < arr.length; i++) {
        res.push(res[res.length - 1] - (res[res.length - 1] / per) + arr[i]);
      }
      return res;
    };
    
    const str = smooth(tr, period);
    const spdm = smooth(dmPlus, period);
    const smdm = smooth(dmMinus, period);
    let dx = [];
    
    for (let i = 0; i < str.length; i++) {
      const sum = spdm[i] + smdm[i];
      dx.push(sum === 0 ? 0 : 100 * Math.abs((spdm[i] - smdm[i]) / sum));
    }
    
    let adx = [];
    let adxSum = 0;
    for (let i = 0; i < period; i++) adxSum += dx[i];
    adx.push(adxSum / period);
    
    for (let i = period; i < dx.length; i++) {
      adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
    }

    const offset = data.length - adx.length;
    const adxSeries = new Array(offset).fill(0).concat(adx);
    const slope = adx.length > 5 ? adx[adx.length - 1] - adx[adx.length - 5] : 0;
    const last = str.length - 1;
    const denom = str[last] || 1e-9;
    
    return {
      adx: adx[adx.length - 1],
      diPlus: 100 * (spdm[last] / denom),
      diMinus: 100 * (smdm[last] / denom),
      adxSeries,
      slope
    };
  };

  // ============================================
  // VOLUME PROFILE
  // ============================================

  const calculateVolumeProfile = (data, buckets = 24) => {
    if (!data || data.length === 0) return [];
    const minPrice = Math.min(...data.map(d => d.low));
    const maxPrice = Math.max(...data.map(d => d.high));
    const step = (maxPrice - minPrice) / buckets || 1;
    
    const profile = Array.from({ length: buckets }, (_, i) => ({
      priceStart: minPrice + i * step,
      priceEnd: minPrice + (i + 1) * step,
      volume: 0,
      mid: (minPrice + i * step + minPrice + (i + 1) * step) / 2
    }));
    
    data.forEach(d => {
      const price = (d.close + d.high + d.low) / 3;
      const bucketIndex = Math.min(Math.floor((price - minPrice) / step), buckets - 1);
      if (bucketIndex >= 0) profile[bucketIndex].volume += d.volume;
    });
    
    return profile;
  };

  const getVolumeStrength = (price, profile) => {
    if (!profile || !profile.length) return 1;
    const bucket = profile.find(p => price >= p.priceStart && price <= p.priceEnd);
    if (!bucket) return 1;
    const maxVol = Math.max(...profile.map(p => p.volume));
    return maxVol > 0 ? bucket.volume / maxVol : 1;
  };

  const findLiquidityLevel = (vp, price, type) => {
    if (!Array.isArray(vp) || vp.length === 0) return null;
    const sortedVp = [...vp].sort((a, b) => b.volume - a.volume);
    const threshold = sortedVp[Math.floor(sortedVp.length * 0.3)]?.volume || 0;
    
    if (type === 'below') {
      const supports = sortedVp
        .filter(n => n.volume >= threshold && n.priceEnd < price)
        .sort((a, b) => b.priceEnd - a.priceEnd);
      return supports.length ? supports[0].mid : null;
    } else {
      const res = sortedVp
        .filter(n => n.volume >= threshold && n.priceStart > price)
        .sort((a, b) => a.priceStart - b.priceStart);
      return res.length ? res[0].mid : null;
    }
  };

  // ============================================
  // PATTERN DETECTION
  // ============================================

  const findPatterns = (data, windowSize) => {
    const len = data.length;
    const highs = [], lows = [];
    
    for (let i = windowSize; i < len - windowSize; i++) {
      const current = data[i];
      let isHigh = true, isLow = true;
      
      for (let j = 1; j <= windowSize; j++) {
        if (!data[i - j] || !data[i + j]) continue;
        if (data[i - j].high > current.high || data[i + j].high > current.high) isHigh = false;
        if (data[i - j].low < current.low || data[i + j].low < current.low) isLow = false;
      }
      
      if (isHigh) highs.push({ ...current, type: 'resistance', localIndex: i });
      if (isLow) lows.push({ ...current, type: 'support', localIndex: i });
    }

    const clusterPivots = (pivots, tolerance, type) => {
      if (pivots.length === 0) return [];
      const sorted = [...pivots].sort((a, b) => 
        type === 'high' ? a.high - b.high : a.low - b.low
      );
      
      const clusters = [];
      let curr = [sorted[0]];
      
      for (let i = 1; i < sorted.length; i++) {
        const val = type === 'high' ? sorted[i].high : sorted[i].low;
        const prevVal = type === 'high' ? curr[curr.length - 1].high : curr[curr.length - 1].low;
        if ((val - prevVal) / prevVal < tolerance) {
          curr.push(sorted[i]);
        } else { 
          clusters.push(curr); 
          curr = [sorted[i]]; 
        }
      }
      clusters.push(curr);
      
      return clusters.map(c => {
        const avgPrice = Math.round(c.reduce((s, x) => s + (type === 'high' ? x.high : x.low), 0) / c.length);
        let score = 0;
        c.forEach(p => { score += (len - p.localIndex) < (len * 0.15) ? 3 : 1; });
        return { 
          price: avgPrice, 
          strength: score + c.length, 
          type, 
          minIndex: Math.min(...c.map(p => p.localIndex)) 
        };
      }).sort((a, b) => b.strength - a.strength);
    };

    let resLine = null, supLine = null;
    
    const majorHighs = highs.filter((h, idx) => {
      const prev = highs[idx - 1];
      const next = highs[idx + 1];
      if (!prev || !next) return false;
      return h.high >= prev.high && h.high >= next.high;
    });
    
    const majorLows = lows.filter((l, idx) => {
      const prev = lows[idx - 1];
      const next = lows[idx + 1];
      if (!prev || !next) return false;
      return l.low <= prev.low && l.low <= next.low;
    });

    // Robust multi-pivot lines
    const atrSeries = calculateATRSeries(data, 14);
    const lastAtr = atrSeries[atrSeries.length - 1] || (data[len - 1]?.close * 0.01) || 0;
    const baseTolerance = Math.max(lastAtr, (data[len - 1]?.close || 0) * 0.005);
    const breakTolerance = baseTolerance * 1.5;
    const maxSlopePerBar = baseTolerance * 3;

    const weightedRegression = (pts, priceKey) => {
      let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
      pts.forEach(p => {
        const w = 1 + (p.localIndex / len);
        const x = p.localIndex;
        const y = p[priceKey];
        sumW += w;
        sumWX += w * x;
        sumWY += w * y;
        sumWXX += w * x * x;
        sumWXY += w * x * y;
      });
      const denom = (sumW * sumWXX) - (sumWX * sumWX);
      if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return null;
      const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
      const intercept = (sumWY - slope * sumWX) / sumW;
      return { slope, intercept };
    };

    const buildRobustLine = (pivots, priceKey) => {
      if (pivots.length < 3) return null;
      const sample = pivots.slice(-6);
      let fit = weightedRegression(sample, priceKey);
      if (!fit) return null;

      const residuals = sample.map(p => {
        const pred = fit.slope * p.localIndex + fit.intercept;
        return (p[priceKey] || 0) - pred;
      });
      const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
      const maxDist = Math.max(baseTolerance, rms * 1.5);
      const filtered = sample.filter((p, idx) => Math.abs(residuals[idx]) <= maxDist);
      if (filtered.length < 3) return null;

      fit = weightedRegression(filtered, priceKey);
      if (!fit) return null;

      let slope = fit.slope;
      if (Math.abs(slope) > maxSlopePerBar) slope = Math.sign(slope) * maxSlopePerBar;

      const anchor = filtered[0];
      const anchorBase = fit.intercept + slope * anchor.localIndex;
      const last = filtered[filtered.length - 1];

      return {
        p1: { ...anchor, base: anchorBase },
        p2: last,
        slope,
        intercept: fit.intercept,
        touches: filtered.length
      };
    };

    const validateLine = (line, priceKey, type) => {
      if (!line || line.touches < 3) return null;
      const lastIdx = len - 1;
      const lastClose = data[lastIdx]?.close;
      if (!Number.isFinite(lastClose)) return null;

      const anchorVal = line.p1.base ?? line.p1[priceKey];
      const projected = anchorVal + line.slope * (lastIdx - line.p1.localIndex);

      if (type === 'res' && lastClose > projected + breakTolerance) return null;
      if (type === 'sup' && lastClose < projected - breakTolerance) return null;
      return line;
    };

    const slopeTolerance = 5000;
    resLine = validateLine(buildRobustLine(majorHighs, 'high'), 'high', 'res');
    supLine = validateLine(buildRobustLine(majorLows, 'low'), 'low', 'sup');

    // Fallback to 2-point lines
    if (!resLine && majorHighs.length >= 2) {
      const p2 = majorHighs[majorHighs.length - 1];
      const p1 = majorHighs[majorHighs.length - 2];
      if (p2.localIndex !== p1.localIndex) {
        const slope = (p2.high - p1.high) / (p2.localIndex - p1.localIndex);
        if (Math.abs(slope) < slopeTolerance) {
          resLine = { p1: { ...p1, base: p1.high }, p2, slope, touches: 2 };
        }
      }
    }
    
    if (!supLine && majorLows.length >= 2) {
      const p2 = majorLows[majorLows.length - 1];
      const p1 = majorLows[majorLows.length - 2];
      if (p2.localIndex !== p1.localIndex) {
        const slope = (p2.low - p1.low) / (p2.localIndex - p1.localIndex);
        if (Math.abs(slope) < slopeTolerance) {
          supLine = { p1: { ...p1, base: p1.low }, p2, slope, touches: 2 };
        }
      }
    }

    return {
      majorHighs,
      majorLows,
      signals: [],
      resLevels: clusterPivots(highs, 0.03, 'high'),
      supLevels: clusterPivots(lows, 0.03, 'low'),
      resLine,
      supLine
    };
  };

  // ============================================
  // FIBONACCI ANALYSIS
  // ============================================

  const findFibSwing = (data, patterns, trend) => {
    const len = data.length;
    if (!len) return { dir: 'none' };

    const slope = trend && typeof trend.slope === 'number' ? trend.slope : 0;
    const dir = slope > 0.0001 ? 'up' : slope < -0.0001 ? 'down' : 'sideways';

    const highs = (patterns && patterns.majorHighs) || [];
    const lows = (patterns && patterns.majorLows) || [];

    // Pivot-based swing
    if (dir === 'up' && highs.length && lows.length) {
      const lastHigh = highs[highs.length - 1];
      let anchorLow = null;
      for (let i = lows.length - 1; i >= 0; i--) {
        if (lows[i].localIndex < lastHigh.localIndex) {
          anchorLow = lows[i];
          break;
        }
      }
      if (anchorLow) {
        return {
          dir: 'up',
          swingHigh: lastHigh.high,
          swingLow: anchorLow.low,
          startIndex: anchorLow.localIndex,
          endIndex: lastHigh.localIndex,
        };
      }
    }

    if (dir === 'down' && highs.length && lows.length) {
      const lastLow = lows[lows.length - 1];
      let anchorHigh = null;
      for (let i = highs.length - 1; i >= 0; i--) {
        if (highs[i].localIndex < lastLow.localIndex) {
          anchorHigh = highs[i];
          break;
        }
      }
      if (anchorHigh) {
        return {
          dir: 'down',
          swingHigh: anchorHigh.high,
          swingLow: lastLow.low,
          startIndex: anchorHigh.localIndex,
          endIndex: lastLow.localIndex,
        };
      }
    }

    // Fallback: last ~120 bars
    const lookback = Math.min(120, len);
    let start = len - lookback;
    let maxIdx = start;
    let minIdx = start;

    for (let i = start; i < len; i++) {
      if (data[i].high > data[maxIdx].high) maxIdx = i;
      if (data[i].low < data[minIdx].low) minIdx = i;
    }

    if (maxIdx === minIdx) return { dir: 'none' };
    
    if (maxIdx > minIdx) {
      return {
        dir: 'up',
        swingHigh: data[maxIdx].high,
        swingLow: data[minIdx].low,
        startIndex: minIdx,
        endIndex: maxIdx,
      };
    } else {
      return {
        dir: 'down',
        swingHigh: data[maxIdx].high,
        swingLow: data[minIdx].low,
        startIndex: maxIdx,
        endIndex: minIdx,
      };
    }
  };

  const calculateFibLevels = (swing) => {
    if (!swing || swing.dir === 'none') return [];
    const diff = swing.swingHigh - swing.swingLow;
    if (diff <= 0) return [];
    
    return config.FIB_LEVELS.map((ratio) => ({
      ratio,
      price: swing.dir === 'up'
        ? swing.swingHigh - diff * ratio
        : swing.swingLow + diff * ratio,
    }));
  };

  // ============================================
  // TRADE SETUP CALCULATION
  // ============================================

  const calculateTradeSetups = (
    data, currentPrice, supports, resistances, atr, score,
    macdData, regime, vp, derivatives, timeframe, fundingRealTime,
    trendLines, trendFilter
  ) => {
    // Get timeframe-specific ATR cap
    const tfConfig = config.TIMEFRAMES[timeframe] || config.TIMEFRAMES.medium;
    const atrCap = tfConfig.atrCap || 0.05;
    const effectiveAtr = Math.min(atr, currentPrice * atrCap);
    
    const liqSupport = findLiquidityLevel(vp, currentPrice, 'below');
    const liqRes = findLiquidityLevel(vp, currentPrice, 'above');

    let formationSup = null;
    if (trendLines && trendLines.supLine) {
      const idx = data.length - 1;
      const anchor = trendLines.supLine.p1.base ?? trendLines.supLine.p1.low;
      formationSup = anchor + trendLines.supLine.slope * (idx - trendLines.supLine.p1.localIndex);
    }

    // Regime-based ATR multipliers
    let stopMult, targetMult;
    if (regime === 'STRONG_TREND') {
      // Wider stops, bigger targets in strong trends
      stopMult = 2.5;
      targetMult = 4.0;
    } else if (regime === 'TRENDING') {
      // Standard
      stopMult = 2.0;
      targetMult = 3.0;
    } else {
      // Ranging - tighter stops, smaller targets (mean reversion)
      stopMult = 1.5;
      targetMult = 2.0;
    }

    // LONG setup
    let lStop = liqSupport && (currentPrice - liqSupport) < 3.0 * effectiveAtr
      ? liqSupport * 0.985
      : currentPrice - stopMult * effectiveAtr;

    if (formationSup && formationSup < currentPrice && (currentPrice - formationSup) < 3.0 * effectiveAtr) {
      lStop = formationSup * 0.99;
    }
    if (currentPrice - lStop < 1.2 * effectiveAtr) lStop = currentPrice - 1.2 * effectiveAtr;

    let lTarget = liqRes && (liqRes - currentPrice) > 2.0 * effectiveAtr
      ? liqRes * 0.99
      : currentPrice + targetMult * effectiveAtr;

    const riskLong = currentPrice - lStop;
    const rewardLong = lTarget - currentPrice;

    const bestLong = {
      entry: currentPrice,
      stop: utils.smartRound(lStop),
      target: utils.smartRound(lTarget),
      rr: riskLong > 0 ? rewardLong / riskLong : 0,
      note: formationSup ? "Trend Line Support" : (liqSupport ? "Liquidity Zone" : "Vol Stop")
    };

    // SHORT setup
    let sStop = liqRes && (liqRes - currentPrice) < 3.0 * effectiveAtr
      ? liqRes * 1.015
      : currentPrice + stopMult * effectiveAtr;
    if (sStop - currentPrice < 1.2 * effectiveAtr) sStop = currentPrice + 1.2 * effectiveAtr;

    let sTarget = liqSupport && (currentPrice - liqSupport) > 2.0 * effectiveAtr
      ? liqSupport * 1.01
      : currentPrice - targetMult * effectiveAtr;

    const riskShort = sStop - currentPrice;
    const rewardShort = currentPrice - sTarget;
    const rrShort = riskShort > 0 ? rewardShort / riskShort : 0;

    const bestShort = {
      entry: currentPrice,
      stop: utils.smartRound(sStop),
      target: utils.smartRound(sTarget),
      rr: rrShort,
      note: liqRes ? "Liquidity Zone" : "Vol Stop"
    };

    let recommendation = "WAIT";
    const isBullish = trendFilter !== null ? currentPrice > trendFilter : score > 0;
    
    // Timeframe-specific score thresholds
    const tfThreshold = timeframe === 'short' ? 15 : timeframe === 'long' ? 25 : 20;

    if (isBullish) {
      if (score > tfThreshold) recommendation = "LONG";
      else if (score > 0) recommendation = "WAIT (Weak Bull)";
      else recommendation = "WAIT";
    } else {
      if (score < -tfThreshold) recommendation = "SHORT";
      else if (score < 0) recommendation = "WAIT (Weak Bear)";
      else recommendation = "WAIT";
    }

    if (formationSup && currentPrice < formationSup) {
      if (recommendation === "LONG") recommendation = "WAIT (Trend Broken)";
      else if (score < 0) recommendation = "SHORT (Breakdown)";
    }

    // Derivatives-based adjustments
    if (derivatives && derivatives.binanceTop && derivatives.binanceGlobal) {
      const smartMoneyDelta = (derivatives.binanceTop.positions.longPct || 0) -
                               (derivatives.binanceGlobal.longPct || 0);
      if (smartMoneyDelta < -0.05 && recommendation.includes("LONG")) {
        recommendation = "WAIT (Whales Shorting)";
      }
      if (smartMoneyDelta > 0.05 && recommendation.includes("SHORT")) {
        recommendation = "WAIT (Whales Longing)";
      }
    }

    // Funding-based adjustments
    if (fundingRealTime && fundingRealTime.rate) {
      if (fundingRealTime.rate > 0.0005 && recommendation.includes("LONG")) {
        recommendation = "WAIT (High Funding)";
      }
    }

    // R:R filter
    if (recommendation === "LONG" && bestLong.rr < 1.5) recommendation = "WAIT (Bad R:R)";
    else if (recommendation === "SHORT" && bestShort.rr < 1.5) recommendation = "WAIT (Bad R:R)";

    return {
      long: bestLong,
      short: bestShort,
      recommendation,
      nearestSup: liqSupport,
      nearestRes: liqRes
    };
  };

  // ============================================
  // BACKTESTING
  // ============================================

  const runBacktest = (data, signals, atrArray, days, regime) => {
    let wins = 0, losses = 0;
    let grossWinR = 0;
    let grossLossR = 0;

    // Regime-based multipliers (should match calculateTradeSetups)
    let stopMult, targetMult;
    if (regime === 'STRONG_TREND') {
      stopMult = 2.5;
      targetMult = 4.0;
    } else if (regime === 'TRENDING') {
      stopMult = 2.0;
      targetMult = 3.0;
    } else {
      stopMult = 1.5;
      targetMult = 2.0;
    }

    const equityCurve = [{ trade: 0, equity: 100 }];
    const uniqueSignals = signals
      .filter((v, i, a) => a.findIndex(t => (t.localIndex === v.localIndex && t.type === v.type)) === i)
      .sort((a, b) => a.localIndex - b.localIndex);

    uniqueSignals.forEach((sig, idx) => {
      const atr = Math.max(atrArray[sig.localIndex] || (sig.price * 0.05), sig.price * 0.01);
      const effectiveAtr = Math.min(atr, sig.price * 0.05);

      let stop = sig.type === 'buy'
        ? sig.price - stopMult * effectiveAtr
        : sig.price + stopMult * effectiveAtr;
      let target = sig.type === 'buy'
        ? sig.price + targetMult * effectiveAtr
        : sig.price - targetMult * effectiveAtr;

      let result = 'timeout';
      const lookAhead = days <= 90 ? 15 : days >= 1000 ? 90 : 45;
      const endIdx = Math.min(data.length, sig.localIndex + lookAhead);

      for (let i = sig.localIndex + 1; i < endIdx; i++) {
        const day = data[i];
        if (sig.type === 'buy') {
          if (day.low <= stop) { result = 'loss'; break; }
          if (day.high >= target) { result = 'win'; break; }
        } else {
          if (day.high >= stop) { result = 'loss'; break; }
          if (day.low <= target) { result = 'win'; break; }
        }
      }

      // Calculate actual R based on regime
      const actualRR = targetMult / stopMult;
      const prevEquity = equityCurve[equityCurve.length - 1].equity;
      const riskPct = 0.02; // 2% risk per trade
      
      if (result === 'win') {
        wins++;
        grossWinR += actualRR;
        equityCurve.push({ trade: idx + 1, equity: prevEquity * (1 + riskPct * actualRR) });
      } else if (result === 'loss') {
        losses++;
        grossLossR += 1.0;
        equityCurve.push({ trade: idx + 1, equity: prevEquity * (1 - riskPct) });
      } else {
        equityCurve.push({ trade: idx + 1, equity: prevEquity });
      }
    });

    const total = uniqueSignals.length;
    const winRate = total > 0 ? wins / total : 0;
    const avgRR = grossWinR / (wins || 1);
    const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : (grossWinR > 0 ? 100 : 0);
    
    // Proper Kelly: f = (p * b - q) / b where p=winRate, q=1-p, b=avgRR
    const kelly = avgRR > 0 ? (winRate * avgRR - (1 - winRate)) / avgRR : 0;

    let reliability = 'LOW';
    if (total >= 30 && profitFactor > 1.3 && winRate > 0.45) reliability = 'HIGH';
    else if (total >= 15 && profitFactor > 1.1) reliability = 'MED';

    return {
      wins,
      losses,
      total: uniqueSignals.length,
      winRate: winRate * 100,
      profitFactor,
      kelly: Math.max(0, kelly * 100),
      equityCurve,
      reliability
    };
  };

  // Export to namespace
  window.BTC.analysis = {
    calculateRSI,
    calculateATRSeries,
    calculateEMA,
    calculateSMA,
    calculateMACD,
    calculateADX,
    calculateVolumeProfile,
    getVolumeStrength,
    findLiquidityLevel,
    findPatterns,
    findFibSwing,
    calculateFibLevels,
    calculateTradeSetups,
    runBacktest
  };

})();