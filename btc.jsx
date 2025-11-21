// use React + Recharts from globals loaded in index.html
const { useState, useEffect } = React;
const { 
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ReferenceLine, ReferenceArea, ComposedChart, Bar, BarChart, Label, Cell
} = Recharts;

// minimal icon stubs so we don't need lucide-react at all
const Activity      = ({ className, ...rest }) => <span className={className} {...rest}>⚡</span>;
const ArrowUp       = ({ className, ...rest }) => <span className={className} {...rest}>▲</span>;
const ArrowDown     = ({ className, ...rest }) => <span className={className} {...rest}>▼</span>;
const RefreshCw     = ({ className, ...rest }) => <span className={className} {...rest}>⟳</span>;
const AlignLeft     = ({ className, ...rest }) => <span className={className} {...rest}>☰</span>;
const BarChart2     = ({ className, ...rest }) => <span className={className} {...rest}>📊</span>;
const TrendingUp    = ({ className, ...rest }) => <span className={className} {...rest}>📈</span>;
const TrendingDown  = ({ className, ...rest }) => <span className={className} {...rest}>📉</span>;
const Filter        = ({ className, ...rest }) => <span className={className} {...rest}>⚙</span>;
const History       = ({ className, ...rest }) => <span className={className} {...rest}>🕒</span>;
const Layers        = ({ className, ...rest }) => <span className={className} {...rest}>🧱</span>;
const Zap           = ({ className, ...rest }) => <span className={className} {...rest}>⚡</span>;
const Gauge         = ({ className, ...rest }) => <span className={className} {...rest}>⏱</span>;
const BrainCircuit  = ({ className, ...rest }) => <span className={className} {...rest}>🧠</span>;
const AlertTriangle = ({ className, ...rest }) => <span className={className} {...rest}>⚠</span>;

// --- 1. DATA FETCHING ---
const fetchMarketData = async () => {
  try {
    const response = await fetch(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000`);
    const json = await response.json();
    if (json.Response !== 'Success') throw new Error(json.Message);
    
    const cleanData = [];
    json.Data.Data.forEach((d, i) => {
      if (Number.isFinite(d.close) && Number.isFinite(d.volumeto) && d.close > 0) {
        cleanData.push({
          date: new Date(d.time * 1000).toISOString().split('T')[0],
          index: i,
          open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volumeto 
        });
      }
    });
    return cleanData;
  } catch (err) {
    console.error("Fetch failed", err);
    return null;
  }
};

// --- 2. MATH UTILS ---
const linearRegression = (x, y) => {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  const avgY = sumY / n;
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - avgY, 2), 0);
  const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
  const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

  return { slope, intercept, rSquared };
};

const calculateSigma = (x, y, slope, intercept) => {
  if (x.length === 0) return 0;
  const residuals = y.map((yi, i) => yi - (slope * x[i] + intercept));
  const sumSq = residuals.reduce((sum, r) => sum + r * r, 0);
  return Math.sqrt(sumSq / x.length);
};

const calculateRobustTrend = (indices, logPrices) => {
  const p1 = linearRegression(indices, logPrices);
  const s1 = calculateSigma(indices, logPrices, p1.slope, p1.intercept);
  
  const fX = [], fY = [];
  for(let i=0; i<indices.length; i++) {
    const pred = p1.slope * indices[i] + p1.intercept;
    if (Math.abs(logPrices[i] - pred) < 1.5 * s1) {
      fX.push(indices[i]); fY.push(logPrices[i]);
    }
  }
  
  if (fX.length < indices.length * 0.5) {
      return { slope: p1.slope, intercept: p1.intercept, sigma: s1, rSquared: p1.rSquared };
  }

  const p2 = linearRegression(fX, fY);
  const s2 = calculateSigma(fX, fY, p2.slope, p2.intercept);
  
  return { slope: p2.slope, intercept: p2.intercept, sigma: s2, rSquared: p2.rSquared };
};

const calculateRSI = (prices, period = 14) => {
  if (prices.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = diff < 0 ? -diff : 0;
    avgGain = ((avgGain * (period - 1)) + currentGain) / period;
    avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

// Unified ATR Calculation (Series)
const calculateATRSeries = (data, period = 14) => {
  const n = data.length;
  const atrs = new Array(n).fill(0);
  if (n <= period) return atrs;

  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trSum += tr;
  }

  let atr = trSum / period;
  atrs[period] = atr;

  for (let i = period + 1; i < n; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    atr = ((atr * (period - 1)) + tr) / period;
    atrs[i] = atr;
  }

  return atrs;
};

// MACD Calculation
const calculateEMA = (data, period) => {
  const k = 2 / (period + 1);
  let ema = data[0];
  const res = [ema];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    res.push(ema);
  }
  return res;
};

const calculateMACD = (prices, fast = 12, slow = 26, signal = 9) => {
  if (prices.length < slow) return new Array(prices.length).fill({ macd: 0, signal: 0, histogram: 0 });
  
  const fastEMA = calculateEMA(prices, fast);
  const slowEMA = calculateEMA(prices, slow);
  
  const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
  const signalLine = calculateEMA(macdLine, signal);
  
  return macdLine.map((m, i) => ({
    macd: m,
    signal: signalLine[i],
    histogram: m - signalLine[i]
  }));
};

// --- ADX Calculation with Directional Movement ---
const calculateADX = (data, period = 14) => {
    if (data.length < period * 2) return { adx: 0, diPlus: 0, diMinus: 0, adxSeries: [] };

    let tr = [], dmPlus = [], dmMinus = [];
    
    for(let i=1; i<data.length; i++) {
        const high = data[i].high;
        const low = data[i].low;
        const prevClose = data[i-1].close;
        
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        
        const upMove = data[i].high - data[i-1].high;
        const downMove = data[i-1].low - data[i].low;
        
        dmPlus.push((upMove > downMove && upMove > 0) ? upMove : 0);
        dmMinus.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }

    const smooth = (arr, per) => {
        let res = [];
        let sum = 0;
        for(let i=0; i<per; i++) sum += arr[i];
        res.push(sum); 
        for(let i=per; i<arr.length; i++) {
            res.push(res[res.length-1] - (res[res.length-1]/per) + arr[i]);
        }
        return res;
    };

    const str = smooth(tr, period);
    const spdm = smooth(dmPlus, period);
    const smdm = smooth(dmMinus, period);

    let dx = [];
    for(let i=0; i<str.length; i++) {
        const diPlus = 100 * (spdm[i] / str[i]);
        const diMinus = 100 * (smdm[i] / str[i]);
        const sum = diPlus + diMinus;
        if (sum === 0) dx.push(0);
        else dx.push(100 * Math.abs(diPlus - diMinus) / sum);
    }

    let adx = [];
    let adxSum = 0;
    for(let i=0; i<period; i++) adxSum += dx[i];
    adx.push(adxSum / period);
    
    for(let i=period; i<dx.length; i++) {
        adx.push((adx[adx.length-1] * (period-1) + dx[i]) / period);
    }
    
    // Pad ADX series to match data length (approx)
    const offset = data.length - adx.length;
    const adxSeries = new Array(offset).fill(0).concat(adx);

    const last = str.length - 1;
    const diPlusLast = 100 * (spdm[last] / str[last]);
    const diMinusLast = 100 * (smdm[last] / str[last]);

    return {
      adx: adx[adx.length-1],
      diPlus: diPlusLast,
      diMinus: diMinusLast,
      adxSeries
    };
};


// --- 3. VOLUME PROFILE & PATTERNS ---
const calculateVolumeProfile = (data, buckets = 24) => {
  if (!data || data.length === 0) return [];
  const minPrice = Math.min(...data.map(d => d.low));
  const maxPrice = Math.max(...data.map(d => d.high));
  const range = maxPrice - minPrice;
  const step = range / buckets || 1;
  
  const profile = Array.from({ length: buckets }, (_, i) => ({
    priceStart: minPrice + i * step,
    priceEnd: minPrice + (i + 1) * step,
    volume: 0
  }));

  data.forEach(d => {
    const price = (d.close + d.high + d.low) / 3;
    const bucketIndex = Math.min(Math.floor((price - minPrice) / step), buckets - 1);
    if (bucketIndex >= 0) profile[bucketIndex].volume += d.volume;
  });
  return profile;
};

const getVolumeStrength = (price, profile) => {
    if (!profile.length) return 1;
    const bucket = profile.find(p => price >= p.priceStart && price <= p.priceEnd);
    if (!bucket) return 1;
    const maxVol = Math.max(...profile.map(p => p.volume));
    return maxVol > 0 ? bucket.volume / maxVol : 1;
};

const findPatterns = (data, windowSize) => {
  const len = data.length;
  const highs = [], lows = [];

  for (let i = windowSize; i < len - windowSize; i++) {
    const current = data[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= windowSize; j++) {
      if (data[i - j].high > current.high || data[i + j].high > current.high) isHigh = false;
      if (data[i - j].low < current.low || data[i + j].low < current.low) isLow = false;
    }
    if (isHigh) highs.push({ ...current, type: 'resistance', localIndex: i });
    if (isLow) lows.push({ ...current, type: 'support', localIndex: i });
  }

  const majorHighs = highs.filter((h, idx) => {
      const prev = highs[idx-1], next = highs[idx+1];
      if (!prev && !next) return true;
      if (!prev) return h.high >= next.high;
      if (!next) return h.high >= prev.high;
      return h.high >= prev.high && h.high >= next.high;
  });
  
  const majorLows = lows.filter((l, idx) => {
      const prev = lows[idx-1], next = lows[idx+1];
      if (!prev && !next) return true;
      if (!prev) return l.low <= next.low;
      if (!next) return l.low <= prev.low;
      return l.low <= prev.low && l.low <= next.low;
  });

  const avgRecentVol = data.slice(-50).reduce((s, x) => s + x.volume, 0) / Math.max(1, Math.min(50, data.length));

  let resLine = null, supLine = null;
  const signals = [];

  // --- PRIMARY SIGNAL ENGINE: BREAKOUTS ---
  if (majorHighs.length >= 2) {
    const p2 = majorHighs[majorHighs.length - 1];
    const p1 = majorHighs[majorHighs.length - 2];
    if (p2.localIndex !== p1.localIndex) {
        const slope = (p2.high - p1.high) / (p2.localIndex - p1.localIndex);
        // Looser slope tolerance for finding "Roughly Horizontal" resistance
        if (slope <= 0.002 * p2.high / 100) {
            resLine = { p1, p2, slope };
            const startScan = p2.localIndex + 1;
            for (let i = startScan; i < len; i++) {
                const d = data[i];
                const proj = p2.high + slope * (i - p2.localIndex);
                // Looser Breakout: 0.5% break, 0.8x Volume
                if (d.close > proj * 1.005 && d.volume > 0.8 * avgRecentVol) {
                    if (!signals.some(s => Math.abs(s.localIndex - i) < 10 && s.type === 'buy')) {
                        signals.push({ type: 'buy', price: d.close, localIndex: i, label: 'BO', volRatio: d.volume/avgRecentVol });
                    }
                }
            }
        }
    }
  }
  
  if (majorLows.length >= 2) {
    const p2 = majorLows[majorLows.length - 1];
    const p1 = majorLows[majorLows.length - 2];
    if (p2.localIndex !== p1.localIndex) {
        const slope = (p2.low - p1.low) / (p2.localIndex - p1.localIndex);
        if (slope >= -0.002 * p2.low / 100) {
            supLine = { p1, p2, slope };
            const startScan = p2.localIndex + 1;
            for (let i = startScan; i < len; i++) {
                const d = data[i];
                const proj = p2.low + slope * (i - p2.localIndex);
                if (d.close < proj * 0.995 && d.volume > 0.8 * avgRecentVol) {
                    if (!signals.some(s => Math.abs(s.localIndex - i) < 10 && s.type === 'sell')) {
                        signals.push({ type: 'sell', price: d.close, localIndex: i, label: 'BD', volRatio: d.volume/avgRecentVol });
                    }
                }
            }
        }
    }
  }

  let avgPivotVol = 0.025; 
  const allPivots = [...highs, ...lows];
  if (allPivots.length > 0) {
    const volSum = allPivots.reduce((sum, p) => sum + ((p.high - p.low) / p.close), 0);
    const rawVol = volSum / allPivots.length;
    avgPivotVol = Math.max(0.01, Math.min(0.05, rawVol * 2)); 
  }

  const clusterPivots = (pivots, tolerance, type) => {
      if (pivots.length === 0) return [];
      const sorted = [...pivots].sort((a,b) => type === 'high' ? a.high - b.high : a.low - b.low);
      const clusters = [];
      let curr = [sorted[0]];
      
      for(let i=1; i<sorted.length; i++) {
          const val = type === 'high' ? sorted[i].high : sorted[i].low;
          const prevVal = type === 'high' ? curr[curr.length-1].high : curr[curr.length-1].low;
          const pctDiff = (val - prevVal) / prevVal;
          
          if (pctDiff < tolerance) {
              curr.push(sorted[i]);
          } else {
              clusters.push(curr);
              curr = [sorted[i]];
          }
      }
      clusters.push(curr);
      
      return clusters.map(c => {
          const avgPrice = Math.round(c.reduce((s,x)=> s + (type === 'high' ? x.high : x.low), 0) / c.length);
          let score = 0;
          c.forEach(p => {
              const recency = (len - p.localIndex) < (len * 0.15) ? 3 : 1;
              score += recency;
          });
          score += c.length;
          const minIndex = Math.min(...c.map(p => p.localIndex));
          return { price: avgPrice, strength: score, type, minIndex };
      }).sort((a,b) => b.strength - a.strength);
  };

  const resLevels = clusterPivots(highs, avgPivotVol, 'high');
  const supLevels = clusterPivots(lows, avgPivotVol, 'low');

  return { majorHighs, majorLows, resLine, supLine, signals, resLevels, supLevels };
};

// --- FIBONACCI ENGINE ---
const FIB_LEVELS = [0.382, 0.5, 0.618];

const findFibSwing = (data, patterns) => {
  const lastHigh = patterns.majorHighs[patterns.majorHighs.length - 1];
  const lastLow = patterns.majorLows[patterns.majorLows.length - 1];

  if (lastHigh && lastLow) {
    if (lastHigh.localIndex > lastLow.localIndex) {
      return {
        dir: 'up',
        swingHigh: lastHigh.high,
        swingLow: lastLow.low,
        startIndex: lastLow.localIndex,
        endIndex: lastHigh.localIndex
      };
    } else if (lastLow.localIndex > lastHigh.localIndex) {
      return {
        dir: 'down',
        swingHigh: lastHigh.high,
        swingLow: lastLow.low,
        startIndex: lastHigh.localIndex,
        endIndex: lastLow.localIndex
      };
    }
  }

  if (data.length === 0) return { dir: 'none' };

  let maxIdx = 0, minIdx = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].high > data[maxIdx].high) maxIdx = i;
    if (data[i].low < data[minIdx].low) minIdx = i;
  }

  if (maxIdx > minIdx) {
    return {
      dir: 'up',
      swingHigh: data[maxIdx].high,
      swingLow: data[minIdx].low,
      startIndex: minIdx,
      endIndex: maxIdx
    };
  } else if (minIdx > maxIdx) {
    return {
      dir: 'down',
      swingHigh: data[maxIdx].high,
      swingLow: data[minIdx].low,
      startIndex: maxIdx,
      endIndex: minIdx
    };
  }

  return { dir: 'none' };
};

const calculateFibLevels = (swing) => {
  if (!swing || swing.dir === 'none') return [];
  const { swingHigh, swingLow, dir } = swing;
  const diff = swingHigh - swingLow;
  if (diff <= 0) return [];

  return FIB_LEVELS.map(ratio => {
    let price;
    if (dir === 'up') price = swingHigh - diff * ratio;
    else price = swingLow + diff * ratio;
    return { ratio, price };
  });
};

// --- 4. TRADE & BACKTEST ENGINE ---

const calculateTradeSetups = (
  currentPrice, 
  supports, 
  resistances, 
  atr, 
  score = 0, 
  macdData = null,
  regime = 'RANGING' 
) => {
    const sortedSupports = supports
        .filter(l => l.price < currentPrice)
        .sort((a, b) => b.price - a.price)
        .slice(0,3);

    const sortedResistances = resistances
        .filter(l => l.price > currentPrice)
        .sort((a, b) => a.price - b.price)
        .slice(0,3);

    // SANITY CHECK: Ignore structural levels if they are > 10% away
    const MAX_STOP_DIST_PCT = 0.10;

    let nearestSup = sortedSupports[0]?.price;
    if (nearestSup && (currentPrice - nearestSup) / currentPrice > MAX_STOP_DIST_PCT) {
        nearestSup = null; 
    }

    let nearestRes = sortedResistances[0]?.price;
    if (nearestRes && (nearestRes - currentPrice) / currentPrice > MAX_STOP_DIST_PCT) {
        nearestRes = null; 
    }

    // --- SMART VOLATILITY DAMPING ---
    // If ATR is > 5% of price, cap it.
    const effectiveAtr = Math.min(atr, currentPrice * 0.05);

    // --- DYNAMIC R:R LOGIC ---
    // Check if a structural level exists between price and ATR target. 
    // If so, use structure. If not, use ATR.

    // 1. LONG SCENARIOS
    let longSetupStruct = null;
    let longSetupFallback = null;

    // Structural Long
    if (nearestSup) {
        const stop = nearestSup - (1.5 * effectiveAtr);
        let target;
        let note;
        if (regime === 'TRENDING' && score > 0) {
             target = currentPrice + (currentPrice - stop) * 2.0; 
             note = "Target: Trend Extension";
        } else if (nearestRes) {
            target = nearestRes * 0.995; 
            note = "Target: Resistance (Range)";
        } else {
            target = currentPrice + (currentPrice - stop) * 1.5; 
            note = "Target: Extension";
        }
        const risk = currentPrice - stop;
        const reward = target - currentPrice;
        const rr = risk > 0 ? reward / risk : 0;
        longSetupStruct = { entry: currentPrice, stop, target, rr, note };
    }

    // Fallback Long (Volatility Based + Dynamic Structure Check)
    {
        const stop = currentPrice - (1.2 * effectiveAtr); 
        let target = currentPrice + (2.2 * effectiveAtr); // Base 1.8:1 RR
        let note = "Scalp (Vol Stop)";

        // Check if resistance blocks the ATR target
        if (nearestRes && nearestRes < target && nearestRes > currentPrice) {
             target = nearestRes * 0.99; // Front run resistance
             note = "Target: Resistance (Dynamic)";
        }

        const risk = currentPrice - stop;
        const reward = target - currentPrice;
        const rr = risk > 0 ? reward / risk : 0;
        longSetupFallback = { entry: currentPrice, stop, target, rr, note };
    }

    // Pick Best Long
    let bestLong = longSetupFallback;
    if (longSetupStruct && longSetupStruct.rr > 1.5) {
        bestLong = longSetupStruct; 
    } else if (longSetupStruct && longSetupStruct.rr > longSetupFallback.rr) {
        bestLong = longSetupStruct; 
    }

    // 2. SHORT SCENARIOS
    let shortSetupStruct = null;
    let shortSetupFallback = null;

    // Structural Short
    if (nearestRes) {
        const stop = nearestRes + (1.5 * effectiveAtr);
        let target;
        let note;
        if (regime === 'TRENDING' && score < 0) {
            target = currentPrice - (stop - currentPrice) * 2.0;
            note = "Target: Trend Extension";
        } else if (nearestSup) {
            target = nearestSup * 1.005;
            note = "Target: Support (Range)";
        } else {
            target = currentPrice - (3 * effectiveAtr);
            note = "Target: Volatility Extension";
        }
        const risk = stop - currentPrice;
        const reward = currentPrice - target;
        const rr = risk > 0 ? reward / risk : 0;
        shortSetupStruct = { entry: currentPrice, stop, target, rr, note };
    }

    // Fallback Short (Volatility Based + Dynamic Structure Check)
    {
        const stop = currentPrice + (1.2 * effectiveAtr);
        let target = currentPrice - (2.2 * effectiveAtr); // Base 1.8:1 RR
        let note = "Scalp (Vol Stop)";

        // Check if support blocks the ATR target
        if (nearestSup && nearestSup > target && nearestSup < currentPrice) {
             target = nearestSup * 1.01; // Front run support
             note = "Target: Support (Dynamic)";
        }

        const risk = stop - currentPrice;
        const reward = currentPrice - target;
        const rr = risk > 0 ? reward / risk : 0;
        shortSetupFallback = { entry: currentPrice, stop, target, rr, note };
    }

    // Pick Best Short
    let bestShort = shortSetupFallback;
    if (shortSetupStruct && shortSetupStruct.rr > 1.5) {
        bestShort = shortSetupStruct; 
    } else if (shortSetupStruct && shortSetupStruct.rr > shortSetupFallback.rr) {
        bestShort = shortSetupStruct; 
    }

    let recommendation = "WAIT";
    if (score <= -20) recommendation = "SHORT";
    else if (score >= 20) recommendation = "LONG";
    
    if (macdData) {
        const { hist, prevHist } = macdData;
        if (recommendation === "LONG") {
            if (hist < 0 && hist < prevHist) recommendation = "WAIT (Momentum Down)";
        } else if (recommendation === "SHORT") {
            if (hist > 0 && hist > prevHist) recommendation = "WAIT (Momentum Up)";
        }
    }

    if (recommendation === "LONG" && bestLong.rr < 1.2) recommendation = "WAIT (Bad R:R)";
    else if (recommendation === "SHORT" && bestShort.rr < 1.2) recommendation = "WAIT (Bad R:R)";

    if (recommendation.includes("WAIT") && !recommendation.includes("Momentum")) {
        if (bestLong.rr > 3 && score > -10) recommendation = "LONG (Speculative)";
        else if (bestShort.rr > 3 && score < 10) recommendation = "SHORT (Speculative)";
    }

    return {
        long: bestLong,
        short: bestShort,
        recommendation,
        nearestSup,
        nearestRes
    };
};

const generateReport = (timeframe, trend, rsi, volBal, support, resistance, score, currentPrice, regime) => {
  const term = timeframe === 'short' ? 'short' : timeframe === 'medium' ? 'medium' : 'long';
  let trendText = "";
  if (trend.dir === 'rising') {
    trendText = trend.status === 'break_down' 
      ? `Bitcoin has **broken down** from the rising trend.` 
      : `Bitcoin lies in a **rising trend channel**.`;
  } else if (trend.dir === 'falling') {
    trendText = trend.status === 'break_up' 
      ? `Bitcoin has **broken up** from the falling trend.` 
      : `Bitcoin lies in a **falling trend channel**.`;
  } else {
    trendText = `Bitcoin moves **sideways**.`;
  }

  const regimeText = regime === 'TRENDING' 
    ? "The market is currently in a **strong trend phase**, favoring breakouts."
    : "The market is currently **ranging/choppy**, favoring support/resistance bounces.";

  let biasWord = 'neutral';
  if (score > 10) biasWord = 'positive';
  if (score < -10) biasWord = 'negative';

  return {
    paragraph: `${trendText} ${regimeText} The currency is overall assessed as technically ${biasWord} for the ${term} term.`,
    recommendation: score > 0 ? "Positive" : "Negative",
    score: score, 
    horizon: term === 'short' ? '1-6 weeks' : term === 'medium' ? '1-6 months' : '1-6 quarters'
  };
};

const runBacktest = (data, signals, atrArray, resLevels, supLevels, macdArray, adxSeries, timeframeDays) => {
    let wins = 0, losses = 0;
    let grossProfit = 0, grossLoss = 0; // Track PnL %
    const history = [];

    // DYNAMIC TIMEOUT: 
    let lookAhead = 30;
    if (timeframeDays <= 90) lookAhead = 10;
    else if (timeframeDays >= 1000) lookAhead = 60;

    signals.forEach(sig => {
        const knownRes = resLevels.filter(l => l.minIndex < sig.localIndex);
        const knownSup = supLevels.filter(l => l.minIndex < sig.localIndex);
        // Ensure ATR is never 0 to avoid divide by zero errors
        const atr = Math.max(atrArray[sig.localIndex] || (sig.price * 0.05), sig.price * 0.01);
        
        const hist = macdArray[sig.localIndex]?.histogram || 0;
        const prevHist = macdArray[sig.localIndex - 1]?.histogram || 0;
        
        const histAdx = adxSeries[sig.localIndex] || 0;
        const histRegime = histAdx > 25 ? 'TRENDING' : 'RANGING';

        const impliedScore = sig.type === 'buy' ? 100 : -100;

        const setup = calculateTradeSetups(sig.price, knownSup, knownRes, atr, impliedScore, { hist, prevHist }, histRegime);
        
        let entry, stop, target;
        let valid = false;
        
        if (sig.type === 'buy') {
            if (setup.long.entry > 0 && setup.long.target > setup.long.entry && setup.long.stop < setup.long.entry) {
                 valid = true;
                 entry = setup.long.entry;
                 stop = setup.long.stop;
                 target = setup.long.target;
            }
        } else {
            if (setup.short.entry > 0 && setup.short.target < setup.short.entry && setup.short.stop > setup.short.entry) {
                 valid = true;
                 entry = setup.short.entry;
                 stop = setup.short.stop;
                 target = setup.short.target;
            }
        }

        if (!valid) return;

        let result = 'timeout'; // Default to timeout/market close
        let exitPrice = entry; // Default exit at entry if something breaks, but overwritten below
        
        const endIndex = Math.min(data.length, sig.localIndex + lookAhead + 1);
        
        for (let i = sig.localIndex + 1; i < endIndex; i++) {
            const day = data[i];
            
            if (sig.type === 'buy') {
                if (day.low <= stop) { result = 'loss'; exitPrice = stop; break; }
                if (day.high >= target) { result = 'win'; exitPrice = target; break; }
            } else {
                if (day.high >= stop) { result = 'loss'; exitPrice = stop; break; }
                if (day.low <= target) { result = 'win'; exitPrice = target; break; }
            }

            // If we reach the end of the loop without hitting stop/target, close at current price
            if (i === endIndex - 1) {
                exitPrice = day.close; 
                // Result remains 'timeout' but we calculate PnL below
            }
        }

        let pctChange = 0;
        if (sig.type === 'buy') {
            pctChange = (exitPrice - entry) / entry;
        } else {
            pctChange = (entry - exitPrice) / entry;
        }

        // UPDATE STATS BASED ON REALIZED PNL
        if (result === 'win') {
            wins++;
            grossProfit += pctChange;
        } else if (result === 'loss') {
            losses++;
            grossLoss += Math.abs(pctChange);
        } else if (result === 'timeout') {
            // Mark-to-market: If profit > 0, count as win; else loss
            if (pctChange > 0) {
                wins++;
                grossProfit += pctChange;
            } else {
                losses++;
                grossLoss += Math.abs(pctChange);
            }
        }

        history.push({ date: sig.date, type: sig.type, result, rr: sig.type === 'buy' ? setup.long.rr : setup.short.rr });
    });

    const total = signals.length; 
    const winRate = total > 0 ? wins / total : 0;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 100 : 0);
    
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 1.5;
    let kelly = 0;
    if (payoffRatio > 0) {
        kelly = winRate - ((1 - winRate) / payoffRatio);
    }
    const conservativeKelly = Math.max(0, kelly * 0.5); 
    const cappedKelly = Math.min(conservativeKelly * 100, 5);

    let reliability = 'LOW';
    if (total >= 100 && winRate * 100 > 55 && profitFactor > 1.3) reliability = 'HIGH';
    else if (total >= 30 && profitFactor > 1.1) reliability = 'MEDIUM';

    return {
        wins, losses, total,
        winRate: winRate * 100,
        profitFactor,
        kelly: cappedKelly,
        reliability
    };
};

// --- 5. MAIN ANALYZER FUNCTION ---
const analyzeData = (data, config) => {
    const slice = data.slice(-config.days);
    
    if (!slice.length) {
        return {
            data: [], vp: [],
            patterns: { majorHighs: [], majorLows: [], resLine: null, supLine: null, signals: [], resLevels: [], supLevels: [] },
            signalsWithDate: [], smartSupports: [], smartResistances: [],
            current: 0, score: 0,
            trend: { dir: 'sideways', status: 'inside', rSquared: 0 },
            rsi: 50, volBal: 0,
            tradeSetups: { long: {}, short: {}, recommendation: 'WAIT' },
            backtestStats: { wins: 0, losses: 0, total: 0, winRate: 0, profitFactor: 0, kelly: 0, reliability: 'LOW' },
            atr: 0,
            fib: { swing: { dir: 'none' }, levels: [], goldenPocket: null, confluence: { support: null, resistance: null } },
            regime: 'RANGING',
            adx: 0,
            atrPct: 0,
            environment: 'NORMAL'
        };
    }

    const indices = slice.map((_,i) => i);
    const logP = slice.map(d => Math.log(d.close));
    const trend = calculateRobustTrend(indices, logP);
    
    const patterns = findPatterns(slice, config.pivotWin);
    const vp = calculateVolumeProfile(slice, 30); 
    const rsi = calculateRSI(slice.map(d => d.close), config.rsi);
    
    const atrArray = calculateATRSeries(slice, 14);
    const atr = atrArray[atrArray.length - 1];
    
    const macd = calculateMACD(slice.map(d => d.close));
    const ema20 = calculateEMA(slice.map(d => d.close), 20);
    
    const { adx: adxValue, diPlus, diMinus, adxSeries } = calculateADX(slice, 14);
    const regime = adxValue > 25 ? 'TRENDING' : 'RANGING';

    const trendLower = (i) => Math.exp(trend.slope * i + trend.intercept - 2.0 * trend.sigma);
    const trendUpper = (i) => Math.exp(trend.slope * i + trend.intercept + 2.0 * trend.sigma);

    // --- FIX 2: FALLBACK SIGNAL GENERATOR ---
    if (patterns.signals.length < 5) {
      console.log(`[${config.days}d] Few chart patterns found (${patterns.signals.length}). Engaging Smart Fallback Engine.`);
      for (let i = 50; i < slice.length - 1; i++) {
        const curr = macd[i];
        const prev = macd[i-1];
        const rsiVal = calculateRSI(slice.slice(0, i+1).map(d=>d.close));
        const emaVal = ema20[i];
        const adxVal = adxSeries[i];

        if (!curr || !prev || !emaVal) continue;

        // Fallback Buy: 
        // 1. MACD Cross Up
        // 2. Price > EMA 20 (Trend is Up)
        // 3. RSI < 70 (Not Overbought)
        // 4. ADX > 20 (Trend Strength)
        if (curr.histogram > 0 && prev.histogram <= 0 && slice[i].close > emaVal && rsiVal < 70 && adxVal > 20) {
           if (!patterns.signals.some(s => Math.abs(s.localIndex - i) < 5)) {
                patterns.signals.push({ type: 'buy', price: slice[i].close, localIndex: i, label: 'FB', volRatio: 1 });
           }
        } 
        // Fallback Sell:
        // 1. MACD Cross Down
        // 2. Price < EMA 20 (Trend is Down)
        // 3. RSI > 30 (Not Oversold)
        // 4. ADX > 20 (Trend Strength)
        else if (curr.histogram < 0 && prev.histogram >= 0 && slice[i].close < emaVal && rsiVal > 30 && adxVal > 20) {
           if (!patterns.signals.some(s => Math.abs(s.localIndex - i) < 5)) {
                patterns.signals.push({ type: 'sell', price: slice[i].close, localIndex: i, label: 'FB', volRatio: 1 });
           }
        }
      }
      patterns.signals.sort((a, b) => a.localIndex - b.localIndex);
    } else {
      console.log(`[${config.days}d] Pattern Engine found ${patterns.signals.length} signals.`);
    }

    let volBal = 0;
    const recent = slice.slice(-20);
    const upV = recent.reduce((a,b,i)=> i>0 && b.close>recent[i-1].close ? a+b.volume : a, 0);
    const downV = recent.reduce((a,b,i)=> i>0 && b.close<recent[i-1].close ? a+b.volume : a, 0);
    if (upV > downV * 1.1) volBal = 1;
    if (downV > upV * 1.1) volBal = -1;

    const current = slice[slice.length-1].close;
    const annualized = (Math.exp(trend.slope * 365) - 1) * 100;
    
    let trendDir = 'sideways';
    if (trend.rSquared > 0.4) {
        if (annualized > 10) trendDir = 'rising';
        else if (annualized < -10) trendDir = 'falling';
    }
    
    const width = 2.0 * trend.sigma;
    const midLog = trend.slope * (slice.length-1) + trend.intercept;
    const trendUpperVal = Math.exp(midLog + width);
    const trendLowerVal = Math.exp(midLog - width);
    
    let trendStatus = 'inside';
    if (current > trendUpperVal) trendStatus = 'break_up';
    if (current < trendLowerVal) trendStatus = 'break_down';

    let score = 0;
    if (trendDir === 'rising') score = (trendStatus === 'break_down') ? -30 : 50;
    else if (trendDir === 'falling') score = (trendStatus === 'break_up') ? 30 : -50;
    else {
        // FIX: If sideways but broken down below band, it's bearish
        if (current < trendLowerVal) score = -20;
        if (current > trendUpperVal) score = 20;
    }

    if (regime === 'TRENDING') {
      if (trendDir === 'rising' && diPlus > diMinus + 5) score += 5;
      if (trendDir === 'falling' && diMinus > diPlus + 5) score -= 5;
    }

    const recentSignal = patterns.signals[patterns.signals.length - 1];
    if (recentSignal) {
        if (recentSignal.type === 'sell') score -= 30;
        if (recentSignal.type === 'buy') score += 30;
    }

    const sortedSupports = patterns.supLevels.filter(l => l.price < current).sort((a, b) => b.price - a.price).slice(0,3);
    const nearestSup = sortedSupports[0]?.price;
    const sortedResistances = patterns.resLevels.filter(l => l.price > current).sort((a, b) => a.price - b.price).slice(0,3);
    const nearestRes = sortedResistances[0]?.price;
    
    if (nearestSup && (current - nearestSup)/current < 0.02) score += 10;
    if (!nearestSup) score -= 20;
    if (rsi < 30) score -= 10;
    if (rsi > 70) score -= 5;
    if (volBal > 0) score += 10; else if (volBal < 0) score -= 10;

    // --- Fibonacci Confluence ---
    const fibSwing = findFibSwing(slice, patterns);
    let fibLevels = [];
    let fibGoldenPocket = null;
    const fibConfluence = { support: null, resistance: null };

    if (fibSwing.dir !== 'none') {
      fibLevels = calculateFibLevels(fibSwing);
      const goldenRatios = [0.5, 0.618];
      const goldenLevels = fibLevels.filter(f => goldenRatios.includes(f.ratio));
      if (goldenLevels.length >= 1) {
        const gpLow = Math.min(...goldenLevels.map(f => f.price));
        const gpHigh = Math.max(...goldenLevels.map(f => f.price));
        fibGoldenPocket = { low: gpLow, high: gpHigh };

        const tolerance = 0.015; 
        if (nearestSup) {
          const bestDist = Math.min(...goldenLevels.map(f => Math.abs(nearestSup - f.price) / current));
          if (bestDist < tolerance) {
            if (trendDir === 'rising') { score += 10; fibConfluence.support = { level: nearestSup, distance: bestDist }; }
          }
        }
        if (nearestRes) {
          const bestDist = Math.min(...goldenLevels.map(f => Math.abs(nearestRes - f.price) / current));
          if (bestDist < tolerance) {
            if (trendDir === 'falling') { score += 10; fibConfluence.resistance = { level: nearestRes, distance: bestDist }; }
          }
        }
      }
    }

    const atrPct = atr / current; 
    let environment = 'NORMAL';
    if (atrPct > 0.1 && adxValue < 15) environment = 'CHAOTIC';    
    else if (atrPct < 0.02 && adxValue < 15) environment = 'NOISE'; 
    else if (adxValue > 30 && atrPct >= 0.03) environment = 'STRONG_TREND';

    const signalsWithDate = patterns.signals.map(s => ({ ...s, date: slice[s.localIndex].date }));
    // Pass config.days to dynamic backtest timeout
    const backtestStats = runBacktest(slice, signalsWithDate, atrArray, patterns.resLevels, patterns.supLevels, macd, adxSeries, config.days);

    const currentMacd = macd[macd.length - 1] || { histogram: 0, signal: 0, macd: 0 };
    const prevMacd = macd[macd.length - 2] || currentMacd;
    const tradeSetups = calculateTradeSetups(current, patterns.supLevels, patterns.resLevels, atr, score, { hist: currentMacd.histogram, prevHist: prevMacd.histogram }, regime);

    const processed = slice.map((d, i) => {
      const ml = trend.slope * i + trend.intercept;
      let resY = null, supY = null;
      if (patterns.resLine && i >= patterns.resLine.p1.localIndex) 
         resY = patterns.resLine.p1.high + patterns.resLine.slope * (i - patterns.resLine.p1.localIndex);
      if (patterns.supLine && i >= patterns.supLine.p1.localIndex) 
         supY = patterns.supLine.p1.low + patterns.supLine.slope * (i - patterns.supLine.p1.localIndex);
      const sig = patterns.signals.find(s => s.localIndex === i);
      return {
        ...d,
        trendUpper: Math.exp(ml + width),
        trendLower: Math.exp(ml - width),
        trendMid: Math.exp(ml),
        formationRes: resY,
        formationSup: supY,
        signalType: sig ? sig.type : null, 
        signalLabel: sig ? sig.label : null,
        macdHist: macd[i]?.histogram ?? 0,
        macdSignal: macd[i]?.signal ?? 0,
        macdLine: macd[i]?.macd ?? 0,
        emaLine: ema20[i] || 0
      };
    });

    return {
        data: processed,
        vp, patterns, signalsWithDate,
        smartSupports: sortedSupports.map(s => {
          const isFib = fibLevels.some(f => Math.abs(f.price - s.price) / current < 0.01);
          return { ...s, width: 1 + getVolumeStrength(s.price, vp) * 3 + (isFib ? 1 : 0), fib: isFib };
        }),
        smartResistances: sortedResistances.map(r => {
          const isFib = fibLevels.some(f => Math.abs(f.price - r.price) / current < 0.01);
          return { ...r, width: 1 + getVolumeStrength(r.price, vp) * 3 + (isFib ? 1 : 0), fib: isFib };
        }),
        current, score: Math.max(-100, Math.min(100, score)),
        trend: { dir: trendDir, status: trendStatus, rSquared: trend.rSquared },
        rsi, volBal, tradeSetups, backtestStats, atr, regime, adx: adxValue, atrPct, environment,
        fib: { swing: fibSwing, levels: fibLevels, goldenPocket: fibGoldenPocket, confluence: fibConfluence }
    };
};

// --- 6. COMPONENT ---
const BitcoinAnalysis = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('medium');
  const [rawData, setRawData] = useState(null);
  const [analyses, setAnalyses] = useState(null);

  useEffect(() => { fetchMarketData().then(setRawData); }, []);

  useEffect(() => {
    if(!rawData) return;
    const configs = {
      short: { days: 90, pivotWin: 4, rsi: 9 },
      medium: { days: 365, pivotWin: 8, rsi: 14 },
      long: { days: 1000, pivotWin: 20, rsi: 14 }
    };
    const short = analyzeData(rawData, configs.short);
    const medium = analyzeData(rawData, configs.medium);
    const long = analyzeData(rawData, configs.long);
    setAnalyses({ short, medium, long });
  }, [rawData]);

  if(!analyses) return <div className="p-10 flex justify-center text-gray-400"><RefreshCw className="animate-spin"/></div>;

  const active = analyses[selectedTimeframe];
  const { trend, rsi, volBal, tradeSetups, score, backtestStats, current, patterns, fib, regime } = active;

  let finalRec = tradeSetups.recommendation;
  let warningMessage = ""; // Use this for "Low Sample Size" warnings instead of overwriting recommendation

  if (selectedTimeframe === 'short') {
      const med = analyses.medium;
      const isMedBullish = med.trend.dir === 'rising' && med.trend.status !== 'break_down';
      const isMedBearish = med.trend.dir === 'falling' && med.trend.status !== 'break_up';

      if (finalRec.includes("LONG") && (isMedBearish || med.score < 0)) {
           warningMessage = "HTF Conflict: Medium term trend is bearish";
      }
      if (finalRec.includes("SHORT") && (isMedBullish || med.score > 0)) {
           warningMessage = "HTF Conflict: Medium term trend is bullish";
      }
  } else if (selectedTimeframe === 'medium') {
      const long = analyses.long;
      const isLongBullish = long.trend.dir === 'rising' && long.trend.status !== 'break_down';
      const isLongBearish = long.trend.dir === 'falling' && long.trend.status !== 'break_up';

      if (finalRec.includes("LONG") && isLongBearish) {
          warningMessage = "HTF Conflict: Long term trend is bearish";
      } else if (finalRec.includes("SHORT") && isLongBullish) {
          warningMessage = "HTF Conflict: Long term trend is bullish";
      }
  }

  if (!finalRec.includes('WAIT')) {
    // Instead of overwriting with "WAIT", we append a warning message
    if (backtestStats.total < 5) {
        warningMessage = "Low Sample Size (Trades < 5)";
    } else if (backtestStats.profitFactor < 1.0) {
        warningMessage = "Low Reliability (Profit Factor < 1.0)";
    }
    
    if (active.environment === 'CHAOTIC') {
        warningMessage = "Warning: Chaotic Volatility";
    } else if (active.environment === 'NOISE') {
        warningMessage = "Warning: Low Volatility Chop";
    }
  }

  const renderPivot = (props) => {
    const { cx, cy, payload, key } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const isH = active.patterns.majorHighs.find(h => h.date === payload.date);
    const isL = active.patterns.majorLows.find(l => l.date === payload.date);
    if (isH) return <circle key={key} cx={cx} cy={cy} r={4} stroke="#ef4444" strokeWidth={2} fill="white" />;
    if (isL) return <circle key={key} cx={cx} cy={cy} r={4} stroke="#22c55e" strokeWidth={2} fill="white" />;
    return null;
  };

  const renderSignalDot = (props) => {
    const { cx, cy, payload, key } = props;
    if (!payload.signalType) return null;
    const color = payload.signalType === 'buy' ? '#22c55e' : '#ef4444';
    return (
       <g key={key} transform={`translate(${cx},${cy})`}>
         {payload.signalType === 'buy' ? <ArrowUp className="w-6 h-6 -ml-3" stroke={color} strokeWidth={3} y={10} /> : <ArrowDown className="w-6 h-6 -ml-3" stroke={color} strokeWidth={3} y={-30} />}
       </g>
    );
  };

  const report = generateReport(selectedTimeframe, trend, rsi, volBal, tradeSetups.nearestSup, tradeSetups.nearestRes, score, current, regime);
  const hasFibConfluence = fib && (fib.confluence.support || fib.confluence.resistance);

  return (
    <div className="max-w-6xl mx-auto bg-white p-6 font-sans text-gray-900">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-gray-800">
            <Activity className="text-orange-500" /> Bitcoin (BTC) Analysis
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-1 items-center">
            <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1"><History className="w-3 h-3"/> Backtest: {backtestStats.winRate.toFixed(1)}% WR</span>
            <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1"><Layers className="w-3 h-3"/> Multi-TF Gated</span>
            <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1"><Zap className="w-3 h-3"/> Momentum Filter</span>
            <span className={`px-2 py-0.5 rounded flex items-center gap-1 ${regime === 'TRENDING' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                <Gauge className="w-3 h-3" /> {regime}
            </span>
            <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                <Gauge className="w-3 h-3" /> ADX {active.adx.toFixed(1)}
            </span>
            <span className={`bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1`}>
                <Gauge className="w-3 h-3" /> Env {active.environment}
            </span>
            <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                <Gauge className="w-3 h-3" /> ATR {(active.atrPct * 100).toFixed(1)}%
            </span>
            {hasFibConfluence && (
              <span className="bg-yellow-100 px-2 py-0.5 rounded flex items-center gap-1">
                <BarChart2 className="w-3 h-3 text-yellow-700" /> Fib Confluence
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded">
          {['short', 'medium', 'long'].map(t => (
            <button key={t} onClick={() => setSelectedTimeframe(t)}
              className={`px-4 py-1 rounded text-sm font-bold uppercase ${selectedTimeframe === t ? 'bg-white shadow text-black' : 'text-gray-400'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* MAIN CHART */}
        <div className="lg:col-span-2 border border-gray-300 bg-white relative rounded-sm">
           <div className="h-[450px] w-full pt-4 pr-4 relative">
             <ResponsiveContainer>
               <ComposedChart data={active.data} margin={{ top: 20, right: 40, left: 0, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f3f4f6" />
                 <XAxis dataKey="date" tick={{fontSize: 10, fill: '#888'}} minTickGap={50} />
                 <YAxis domain={['auto', 'auto']} orientation="right" tick={{fontSize: 11, fontWeight: 'bold'}} axisLine={false} tickLine={false} tickFormatter={(v)=>Number(v).toLocaleString()} />
                 <Tooltip contentStyle={{ borderRadius: 4, borderColor: '#eee' }} formatter={(v)=>Number(v).toLocaleString()} />
                 {fib?.goldenPocket && <ReferenceArea y1={fib.goldenPocket.low} y2={fib.goldenPocket.high} stroke="none" fill="#f97316" fillOpacity={0.08} />}
                 {fib?.levels && fib.levels.filter((f) => f.ratio === 0.5 || f.ratio === 0.618).map((f, idx) => (
                    <ReferenceLine key={`fib-${idx}`} y={f.price} stroke="#f97316" strokeDasharray="3 3" strokeWidth={1.5}>
                      <Label value={`${Math.round(f.ratio * 100)}%`} position="insideRight" fill="#f97316" fontSize={9} />
                    </ReferenceLine>
                 ))}
                 <Line type="monotone" dataKey="trendUpper" stroke="#ccc" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                 <Line type="monotone" dataKey="trendLower" stroke="#ccc" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                 <Line type="linear" dataKey="formationRes" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                 <Line type="linear" dataKey="formationSup" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                 <Line type="monotone" dataKey="close" stroke="#000" strokeWidth={1.5} dot={renderPivot} activeDot={{r: 6}} />
                 <Line type="monotone" dataKey="close" stroke="none" dot={renderSignalDot} activeDot={false} />
                 {/* RENDER EMA LINE */}
                 <Line type="monotone" dataKey="emaLine" stroke="#8b5cf6" strokeWidth={1.5} dot={false} activeDot={false} strokeDasharray="3 3" />

                 {active.smartSupports.map((s, i) => (
                    <ReferenceLine key={`s-${i}`} y={s.price} stroke={s.fib ? "#f97316" : "#22c55e"} strokeDasharray="5 5" strokeWidth={s.width}>
                        <Label value={`${s.price}${s.fib ? ' (Fib)' : ''}`} position="insideLeft" fill={s.fib ? "#f97316" : "#22c55e"} fontSize={10} fontWeight="bold" dy={10} />
                    </ReferenceLine>
                 ))}
                 {active.smartResistances.map((r, i) => (
                    <ReferenceLine key={`r-${i}`} y={r.price} stroke={r.fib ? "#f97316" : "#ef4444"} strokeDasharray="5 5" strokeWidth={r.width}>
                        <Label value={`${r.price}${r.fib ? ' (Fib)' : ''}`} position="insideLeft" fill={r.fib ? "#f97316" : "#ef4444"} fontSize={10} fontWeight="bold" dy={-10} />
                    </ReferenceLine>
                 ))}
               </ComposedChart>
             </ResponsiveContainer>
           </div>
           <div className="h-16 w-full border-t border-gray-200 bg-gray-50/30 pr-4">
             <ResponsiveContainer>
               <BarChart data={active.data} margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                 <Bar dataKey="volume" fill="#bdc3c7" />
               </BarChart>
             </ResponsiveContainer>
           </div>
           {/* MACD SUBCHART */}
           <div className="h-20 w-full border-t border-gray-200 bg-white pr-4">
               <ResponsiveContainer>
                   <ComposedChart data={active.data} margin={{ top: 5, right: 40, left: 0, bottom: 0 }}>
                       <YAxis orientation="right" tick={{fontSize: 8}} axisLine={false} tickLine={false} />
                       <Bar dataKey="macdHist" barSize={2}>
                         {active.data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.macdHist > 0 ? '#22c55e' : '#ef4444'} />
                         ))}
                       </Bar>
                       <Line type="monotone" dataKey="macdLine" stroke="#3b82f6" strokeWidth={1} dot={false} />
                       <Line type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1} dot={false} />
                   </ComposedChart>
               </ResponsiveContainer>
           </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-4">
           
           {/* RECOMMENDATION BADGE */}
           {finalRec.includes('WAIT') ? (
                <div className={`p-4 rounded-lg border-2 text-center shadow-md ${score > 20 ? 'bg-green-50 border-green-300' : score < -20 ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-300'}`}>
                    <div className="text-xs font-bold uppercase tracking-wider opacity-70">Technical Rating</div>
                    <div className={`text-xl font-black ${score > 20 ? 'text-green-700' : score < -20 ? 'text-red-700' : 'text-gray-600'}`}>
                        {finalRec}
                    </div>
                    {warningMessage && <div className="text-[10px] text-red-600 font-bold mt-1 uppercase">{warningMessage}</div>}
                    <div className="text-xs font-medium mt-1 opacity-80">Score: {score}</div>
                </div>
           ) : (
               <div className={`p-4 rounded-lg border-2 text-center shadow-md ${finalRec.includes('LONG') ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                   <div className="text-xs font-bold uppercase tracking-wider opacity-70">Algo Recommendation</div>
                   <div className={`text-2xl font-black ${finalRec.includes('LONG') ? 'text-green-700' : 'text-red-700'}`}>
                       {finalRec} (Score: {score})
                   </div>
                   {warningMessage && (
                       <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-bold uppercase text-orange-600">
                           <AlertTriangle className="w-3 h-3" /> {warningMessage}
                       </div>
                   )}
               </div>
           )}

           {/* BACKTEST RESULTS & KELLY */}
           <div className="bg-slate-800 text-white p-4 rounded-xl shadow-lg">
             <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-600">
               <h4 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2"><History className="w-3 h-3"/> Strategy Performance</h4>
               <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                   {backtestStats.total} Trades · {backtestStats.reliability}
               </span>
             </div>
             <div className="grid grid-cols-3 gap-2 text-center">
                 <div>
                     <div className="text-[9px] uppercase text-slate-400 font-bold">Win Rate</div>
                     <div className={`text-lg font-mono font-bold ${backtestStats.winRate > 50 ? 'text-green-400' : 'text-orange-400'}`}>
                         {backtestStats.winRate.toFixed(0)}%
                     </div>
                 </div>
                 <div>
                     <div className="text-[9px] uppercase text-slate-400 font-bold">Pr. Factor</div>
                     <div className={`text-lg font-mono font-bold ${backtestStats.profitFactor > 1.2 ? 'text-blue-400' : 'text-gray-400'}`}>
                         {backtestStats.profitFactor.toFixed(2)}
                     </div>
                 </div>
                 <div>
                     <div className="text-[9px] uppercase text-slate-400 font-bold">Kelly Bet</div>
                     <div className={`text-lg font-mono font-bold ${backtestStats.kelly > 0 ? 'text-purple-400' : 'text-gray-500'}`}>
                         {backtestStats.kelly > 0 ? `${backtestStats.kelly.toFixed(1)}%` : '0%'}
                     </div>
                 </div>
             </div>
           </div>

           {/* LONG SETUP */}
           <div className={`p-4 border rounded-xl relative ${finalRec.includes('LONG') ? 'border-green-500 bg-white shadow-lg ring-2 ring-green-100' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
             <div className="flex justify-between items-center mb-2">
                 <h4 className="font-black text-green-700 flex items-center gap-2"><TrendingUp className="w-4 h-4"/> LONG</h4>
                 <span className={`text-xs font-bold px-2 py-1 rounded ${tradeSetups.long.rr >= 1.5 ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                   RR: {tradeSetups.long.rr.toFixed(2)}
                 </span>
             </div>
             <div className="text-sm space-y-1 text-gray-700 font-mono">
                 <div className="flex justify-between"><span>Entry</span> <span>${Math.round(tradeSetups.long.entry).toLocaleString()}</span></div>
                 <div className="flex justify-between text-red-600"><span>Stop</span> <span>${Math.round(tradeSetups.long.stop).toLocaleString()}</span></div>
                 <div className="flex justify-between text-green-600"><span>Target</span> <span>${Math.round(tradeSetups.long.target).toLocaleString()}</span></div>
             </div>
             <div className="text-[10px] text-gray-400 mt-2 border-t pt-1 text-right">{tradeSetups.long.note}</div>
           </div>

           {/* SHORT SETUP */}
           <div className={`p-4 border rounded-xl relative ${finalRec.includes('SHORT') ? 'border-red-500 bg-white shadow-lg ring-2 ring-red-100' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
             <div className="flex justify-between items-center mb-2">
                 <h4 className="font-black text-red-700 flex items-center gap-2"><TrendingDown className="w-4 h-4"/> SHORT</h4>
                 <span className={`text-xs font-bold px-2 py-1 rounded ${tradeSetups.short.rr >= 1.5 ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                   RR: {tradeSetups.short.rr.toFixed(2)}
                 </span>
             </div>
             <div className="text-sm space-y-1 text-gray-700 font-mono">
                 <div className="flex justify-between"><span>Entry</span> <span>${Math.round(tradeSetups.short.entry).toLocaleString()}</span></div>
                 <div className="flex justify-between text-red-600"><span>Stop</span> <span>${Math.round(tradeSetups.short.stop).toLocaleString()}</span></div>
                 <div className="flex justify-between text-green-600"><span>Target</span> <span>${Math.round(tradeSetups.short.target).toLocaleString()}</span></div>
             </div>
             <div className="text-[10px] text-gray-400 mt-2 border-t pt-1 text-right">{tradeSetups.short.note}</div>
           </div>

           {/* ANALYSIS TEXT */}
           <div className="flex-grow p-4 border border-gray-200 rounded-xl bg-white shadow-sm overflow-y-auto max-h-60">
             <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2 uppercase text-xs border-b pb-1">
                 <AlignLeft className="w-3 h-3" /> Analysis
             </h3>
             <div className="prose prose-xs text-gray-600 leading-relaxed text-justify">
                 <p dangerouslySetInnerHTML={{ __html: report.paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
             </div>
             <div className="mt-4 pt-4 border-t border-gray-100">
                 <div className="flex flex-wrap items-center gap-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                    <BrainCircuit className="w-4 h-4" />
                    <span><strong>Adaptive Logic:</strong> Targets & Stops automatically adjust to market volatility and trend regime.</span>
                 </div>
             </div>
           </div>

        </div>
      </div>
    </div>
  );
};