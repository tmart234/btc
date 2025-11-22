// Use the globals provided by the UMD scripts you loaded in index.html
const { useState, useEffect } = window.React;

// Safely pull components off window.Recharts (with fallbacks)
let Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea, ComposedChart, Bar, BarChart, Label, Cell;

if (window.Recharts) {
  ({
    Line,
    LineChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    ReferenceArea,
    ComposedChart,
    Bar,
    BarChart,
    Label,
    Cell,
  } = window.Recharts);
} else {
  console.error(
    "Recharts global is missing. Check the <script src='https://unpkg.com/recharts/umd/Recharts.min.js'></script> tag."
  );

  // Fallback stub components so React doesn't crash
  const Stub = ({ children }) => (
    <div className="p-2 text-xs text-red-500 border border-dashed border-red-400">
      Recharts failed to load. Charts disabled.
      {children}
    </div>
  );
  Line = LineChart = XAxis = YAxis = CartesianGrid = Tooltip =
    ResponsiveContainer = ReferenceLine = ReferenceArea =
      ComposedChart = Bar = BarChart = Label = Cell = Stub;
}

const Icon = ({ children, className = '', ...rest }) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    {...rest}
  >
    {children}
  </span>
);

const Activity    = (props) => <Icon {...props}>📈</Icon>;
const ArrowUp     = (props) => <Icon {...props}>⬆️</Icon>;
const ArrowDown   = (props) => <Icon {...props}>⬇️</Icon>;
const RefreshCw   = (props) => <Icon {...props}>🔄</Icon>;
const AlignLeft   = (props) => <Icon {...props}>≡</Icon>;
const BarChart2   = (props) => <Icon {...props}>📊</Icon>;
const TrendingUp  = (props) => <Icon {...props}>📈</Icon>;
const TrendingDown= (props) => <Icon {...props}>📉</Icon>;
const History     = (props) => <Icon {...props}>🕒</Icon>;
const Layers      = (props) => <Icon {...props}>🧱</Icon>;
const Zap         = (props) => <Icon {...props}>⚡</Icon>;
const Gauge       = (props) => <Icon {...props}>🧭</Icon>;
const BrainCircuit= (props) => <Icon {...props}>🧠</Icon>;
const AlertTriangle=(props) => <Icon {...props}>⚠️</Icon>;
const Users       = (props) => <Icon {...props}>👥</Icon>;
const DollarSign  = (props) => <Icon {...props}>💲</Icon>;
const Target      = (props) => <Icon {...props}>🎯</Icon>;
const WifiOff     = (props) => <Icon {...props}>📵</Icon>;
const Timer       = (props) => <Icon {...props}>⏱️</Icon>;
const Clock       = (props) => <Icon {...props}>🕒</Icon>;
const Percent     = (props) => <Icon {...props}>%</Icon>;


// --- 1. DATA FETCHING & PROXIES ---

const PROXY_GENERATORS = [
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

async function fetchJson(targetUrl) {
  const urlWithTime = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  let lastError = null;

  for (const generateProxyUrl of PROXY_GENERATORS) {
    try {
      const proxyUrl = generateProxyUrl(urlWithTime);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  return null;
}

// Fetch Historical Funding (per day)
async function fetchFundingHistory() {
  try {
    const data = await fetchJson('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000');
    const history = {};
    if (Array.isArray(data)) {
      data.forEach(d => {
        const dateStr = new Date(d.fundingTime).toISOString().split('T')[0];
        if (!history[dateStr]) history[dateStr] = [];
        history[dateStr].push(parseFloat(d.fundingRate));
      });
    }
    return history;
  } catch(e) {
    return {};
  }
}

// Fetch Historical Global vs Top Long/Short Ratios (per day)
async function fetchLongShortHistory() {
  try {
    const [global, topPos] = await Promise.all([
      fetchJson('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=365'),
      fetchJson('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1d&limit=365'),
    ]);

    const raw = {};

    if (Array.isArray(global)) {
      global.forEach(d => {
        const dateStr = new Date(Number(d.timestamp)).toISOString().split('T')[0];
        if (!raw[dateStr]) raw[dateStr] = { global: [], top: [] };
        raw[dateStr].global.push(Number(d.longShortRatio));
      });
    }

    if (Array.isArray(topPos)) {
      topPos.forEach(d => {
        const dateStr = new Date(Number(d.timestamp)).toISOString().split('T')[0];
        if (!raw[dateStr]) raw[dateStr] = { global: [], top: [] };
        raw[dateStr].top.push(Number(d.longShortRatio));
      });
    }

    const history = {};
    Object.entries(raw).forEach(([date, val]) => {
      const g = val.global;
      const t = val.top;
      history[date] = {
        global: g.length ? g.reduce((a, b) => a + b, 0) / g.length : null,
        top: t.length ? t.reduce((a, b) => a + b, 0) / t.length : null,
      };
    });

    return history;
  } catch (e) {
    return {};
  }
}

// Fetch Real-Time Funding
async function fetchRealTimeFunding() {
  try {
    const data = await fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT');
    if (data && data.lastFundingRate) {
      return {
        rate: parseFloat(data.lastFundingRate),
        nextTime: parseInt(data.nextFundingTime),
        annualized: parseFloat(data.lastFundingRate) * 3 * 365
      };
    }
    return null;
  } catch(e) {
    return null;
  }
}

// Historical Price + merge in funding + long/short history
const fetchMarketData = async () => {
  try {
    let priceData = null;
    const priceUrl = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000`;

    try {
      const res = await fetch(priceUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.Response === 'Success') priceData = json.Data.Data;
      }
    } catch (e) {}

    if (!priceData) {
      const json = await fetchJson(priceUrl);
      if (json && json.Response === 'Success') priceData = json.Data.Data;
    }

    if (!priceData) return null;

    const [fundingHistory, lsHistory] = await Promise.all([
      fetchFundingHistory(),
      fetchLongShortHistory(),
    ]);

    const cleanData = [];
    priceData.forEach((d, i) => {
      if (Number.isFinite(d.close) && Number.isFinite(d.volumeto) && d.close > 0) {
        const dateStr = new Date(d.time * 1000).toISOString().split('T')[0];

        // Daily funding
        let dailyFund = null;
        if (fundingHistory[dateStr]) {
          const rates = fundingHistory[dateStr];
          if (rates.length) {
            dailyFund = rates.reduce((a, b) => a + b, 0) / rates.length;
          }
        }

        // Daily long/short ratios (global + whales)
        const ls = lsHistory[dateStr] || {};
        const globalLsRatio = ls.global ?? null;
        const topLsRatio = ls.top ?? null;

        cleanData.push({
          date: dateStr,
          index: i,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volumeto,
          fundingRate: dailyFund,
          globalLsRatio,
          topLsRatio,
        });
      }
    });

    // light forward-fill just at the very end so the latest day doesn’t look “missing”
    for (let i = 1; i < cleanData.length; i++) {
      if (cleanData[i].fundingRate == null) {
        cleanData[i].fundingRate = cleanData[i - 1].fundingRate;
      }
      if (cleanData[i].globalLsRatio == null) {
        cleanData[i].globalLsRatio = cleanData[i - 1].globalLsRatio;
      }
      if (cleanData[i].topLsRatio == null) {
        cleanData[i].topLsRatio = cleanData[i - 1].topLsRatio;
      }
    }

    return cleanData;
  } catch (err) {
    return null;
  }
};

// Derivatives Snapshot (real-time)
async function fetchBinanceGlobal() {
  try {
    const data = await fetchJson('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1');
    if (!Array.isArray(data) || data.length === 0) return null;
    const last = data[data.length - 1];
    return { longPct: Number(last.longAccount), shortPct: Number(last.shortAccount), ratio: Number(last.longShortRatio) };
  } catch(e) { return null; }
}

async function fetchBinanceTop() {
  try {
    const [acc, pos] = await Promise.all([
      fetchJson('https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=1'),
      fetchJson('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=5m&limit=1'),
    ]);
    if (!Array.isArray(acc) || !Array.isArray(pos)) return null;
    const lastAcc = acc[acc.length - 1];
    const lastPos = pos[pos.length - 1];

    const safeLongAcc = Number(lastAcc?.longAccount ?? lastAcc?.longQty ?? 0);
    const safeShortAcc = Number(lastAcc?.shortAccount ?? lastAcc?.shortQty ?? 0);
    const safeLongPos = Number(lastPos?.longAccount ?? lastPos?.longQty ?? 0);
    const safeShortPos = Number(lastPos?.shortAccount ?? lastPos?.shortQty ?? 0);

    return {
      accounts: { longPct: safeLongAcc, shortPct: safeShortAcc, ratio: Number(lastAcc?.longShortRatio || 0) },
      positions: { longPct: safeLongPos, shortPct: safeShortPos, ratio: Number(lastPos?.longShortRatio || 0) }
    };
  } catch(e) { return null; }
}

async function fetchBybit() {
  try {
    const json = await fetchJson('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=5min&limit=1');
    const item = json?.result?.list?.[0];
    if (!item) return null;
    const buy = Number(item.buyRatio);
    const sell = Number(item.sellRatio);
    return { longPct: buy, shortPct: sell, ratio: sell > 0 ? buy / sell : 0 };
  } catch(e) { return null; }
}


// --- 2. MATH UTILS ---
const smartRound = (num) => {
  if (!num) return 0;
  if (num > 10000) return Math.round(num / 50) * 50;
  if (num > 1000) return Math.round(num / 10) * 10;
  return Math.round(num * 100) / 100;
};

const formatPercent = (val) =>
  (val === undefined || val === null || !Number.isFinite(val))
    ? '-'
    : `${(val * 100).toFixed(4)}%`;

const getCountDown = (target) => {
  if (!target) return '-';
  const diff = target - Date.now();
  if (diff <= 0) return 'Settling...';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

const linearRegression = (x, y) => {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
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
  if (fX.length < indices.length * 0.5) return { slope: p1.slope, intercept: p1.intercept, sigma: s1, rSquared: p1.rSquared };
  const p2 = linearRegression(fX, fY);
  const s2 = calculateSigma(fX, fY, p2.slope, p2.intercept);
  return { slope: p2.slope, intercept: p2.intercept, sigma: s2, rSquared: p2.rSquared };
};

const calculateRSI = (prices, period = 14) => {
  if (prices.length <= period) return new Array(prices.length).fill(50);
  let gains = 0, losses = 0;
  const rsi = new Array(prices.length).fill(50);

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
    const high = data[i].high; const low = data[i].low; const prevClose = data[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atrs[i] = ((atrs[i-1] * (period - 1)) + tr) / period;
  }
  return atrs;
};

const calculateEMA = (data, period) => {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const res = new Array(data.length).fill(null);
  let sum = 0;
  for(let i=0; i<period; i++) sum += data[i];
  res[period-1] = sum / period;
  for (let i = period; i < data.length; i++) {
    res[i] = data[i] * k + res[i-1] * (1 - k);
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
    if (res[i] === null && res[i-1] !== null && i > data.length - period) res[i] = res[i-1];
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
  for(let i=0; i<validSignalValues.length; i++) signalLine[i + validMacdStart] = validSignalValues[i] || 0;
  return macdLine.map((m, i) => ({ macd: m, signal: signalLine[i], histogram: m - signalLine[i] }));
};

const calculateADX = (data, period = 14) => {
  if (data.length < period * 2) return { adx: 0, diPlus: 0, diMinus: 0, adxSeries: [], slope: 0 };
  let tr = [], dmPlus = [], dmMinus = [];
  for(let i=1; i<data.length; i++) {
    const high = data[i].high; const low = data[i].low; const prevClose = data[i-1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const upMove = data[i].high - data[i-1].high;
    const downMove = data[i-1].low - data[i].low;
    dmPlus.push((upMove > downMove && upMove > 0) ? upMove : 0);
    dmMinus.push((downMove > upMove && downMove > 0) ? downMove : 0);
  }
  const smooth = (arr, per) => {
    let res = []; let sum = 0;
    for(let i=0; i<per; i++) sum += arr[i];
    res.push(sum);
    for(let i=per; i<arr.length; i++) res.push(res[res.length-1] - (res[res.length-1]/per) + arr[i]);
    return res;
  };
  const str = smooth(tr, period); const spdm = smooth(dmPlus, period); const smdm = smooth(dmMinus, period);
  let dx = [];
  for(let i=0; i<str.length; i++) {
    const sum = spdm[i] + smdm[i];
    dx.push(sum === 0 ? 0 : 100 * Math.abs((spdm[i] - smdm[i]) / sum));
  }
  let adx = []; let adxSum = 0;
  for(let i=0; i<period; i++) adxSum += dx[i];
  adx.push(adxSum / period);
  for(let i=period; i<dx.length; i++) adx.push((adx[adx.length-1] * (period-1) + dx[i]) / period);

  const offset = data.length - adx.length;
  const adxSeries = new Array(offset).fill(0).concat(adx);
  const slope = adx.length > 5 ? adx[adx.length-1] - adx[adx.length-5] : 0;
  const last = str.length - 1;
  const denom = str[last] || 1e-9;
  return {
    adx: adx[adx.length-1],
    diPlus: 100 * (spdm[last] / denom),
    diMinus: 100 * (smdm[last] / denom),
    adxSeries,
    slope
  };
};


// --- 3. PATTERNS ---
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

const findPatterns = (data, windowSize) => {
  const len = data.length;
  const highs = [], lows = [];
  for (let i = windowSize; i < len - windowSize; i++) {
    const current = data[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= windowSize; j++) {
      if (!data[i-j] || !data[i+j]) continue;
      if (data[i - j].high > current.high || data[i + j].high > current.high) isHigh = false;
      if (data[i - j].low < current.low || data[i + j].low < current.low) isLow = false;
    }
    if (isHigh) highs.push({ ...current, type: 'resistance', localIndex: i });
    if (isLow) lows.push({ ...current, type: 'support', localIndex: i });
  }

  const clusterPivots = (pivots, tolerance, type) => {
    if (pivots.length === 0) return [];
    const sorted = [...pivots].sort((a,b) => type === 'high' ? a.high - b.high : a.low - b.low);
    const clusters = [];
    let curr = [sorted[0]];
    for(let i=1; i<sorted.length; i++) {
      const val = type === 'high' ? sorted[i].high : sorted[i].low;
      const prevVal = type === 'high' ? curr[curr.length-1].high : curr[curr.length-1].low;
      if ((val - prevVal) / prevVal < tolerance) curr.push(sorted[i]);
      else { clusters.push(curr); curr = [sorted[i]]; }
    }
    clusters.push(curr);
    return clusters.map(c => {
      const avgPrice = Math.round(c.reduce((s,x)=> s + (type === 'high' ? x.high : x.low), 0) / c.length);
      let score = 0;
      c.forEach(p => { score += (len - p.localIndex) < (len * 0.15) ? 3 : 1; });
      return { price: avgPrice, strength: score + c.length, type, minIndex: Math.min(...c.map(p => p.localIndex)) };
    }).sort((a,b) => b.strength - a.strength);
  };

  let resLine = null, supLine = null;
  const majorHighs = highs.filter((h, idx) => {
    const prev = highs[idx-1];
    const next = highs[idx+1];
    if (!prev || !next) return false;
    return h.high >= prev.high && h.high >= next.high;
  });
  const majorLows = lows.filter((l, idx) => {
    const prev = lows[idx-1];
    const next = lows[idx+1];
    if (!prev || !next) return false;
    return l.low <= prev.low && l.low <= next.low;
  });

  const slopeTolerance = 5000;
  if (majorHighs.length >= 2) {
    const p2 = majorHighs[majorHighs.length - 1];
    const p1 = majorHighs[majorHighs.length - 2];
    if (p2.localIndex !== p1.localIndex) {
      const slope = (p2.high - p1.high) / (p2.localIndex - p1.localIndex);
      if (Math.abs(slope) < slopeTolerance) resLine = { p1, p2, slope };
    }
  }
  if (majorLows.length >= 2) {
    const p2 = majorLows[majorLows.length - 1];
    const p1 = majorLows[majorLows.length - 2];
    if (p2.localIndex !== p1.localIndex) {
      const slope = (p2.low - p1.low) / (p2.localIndex - p1.localIndex);
      if (Math.abs(slope) < slopeTolerance) supLine = { p1, p2, slope };
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


// --- FIBONACCI & BACKTEST ---
const FIB_LEVELS = [0.382, 0.5, 0.618];

const findFibSwing = (data, patterns) => {
  if (data.length === 0) return { dir: 'none' };
  let maxIdx = 0, minIdx = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].high > data[maxIdx].high) maxIdx = i;
    if (data[i].low < data[minIdx].low) minIdx = i;
  }
  if (maxIdx > minIdx) {
    return { dir: 'up', swingHigh: data[maxIdx].high, swingLow: data[minIdx].low, startIndex: minIdx, endIndex: maxIdx };
  } else {
    return { dir: 'down', swingHigh: data[maxIdx].high, swingLow: data[minIdx].low, startIndex: maxIdx, endIndex: minIdx };
  }
};

const calculateFibLevels = (swing) => {
  if (!swing || swing.dir === 'none') return [];
  const diff = swing.swingHigh - swing.swingLow;
  if (diff <= 0) return [];
  return FIB_LEVELS.map(ratio => ({
    ratio,
    price: swing.dir === 'up'
      ? swing.swingHigh - diff * ratio
      : swing.swingLow + diff * ratio
  }));
};

const findLiquidityLevel = (vp, price, type) => {
  if (!Array.isArray(vp) || vp.length === 0) return null;
  const sortedVp = [...vp].sort((a,b) => b.volume - a.volume);
  const threshold = sortedVp[Math.floor(sortedVp.length * 0.3)]?.volume || 0;
  if (type === 'below') {
    const supports = sortedVp
      .filter(n => n.volume >= threshold && n.priceEnd < price)
      .sort((a,b) => b.priceEnd - a.priceEnd);
    return supports.length ? supports[0].mid : null;
  } else {
    const res = sortedVp
      .filter(n => n.volume >= threshold && n.priceStart > price)
      .sort((a,b) => a.priceStart - b.priceStart);
    return res.length ? res[0].mid : null;
  }
};


// --- 5. MAIN ANALYZER ---
const calculateTradeSetups = (
  data,
  currentPrice,
  supports,
  resistances,
  atr,
  score,
  macdData,
  regime,
  vp,
  derivatives,
  timeframe,
  fundingRealTime,
  trendLines,
  trendFilter
) => {
  const effectiveAtr = Math.min(atr, currentPrice * 0.05);
  const liqSupport = findLiquidityLevel(vp, currentPrice, 'below');
  const liqRes = findLiquidityLevel(vp, currentPrice, 'above');

  let formationSup = null;
  if (trendLines && trendLines.supLine) {
    const idx = data.length - 1;
    formationSup = trendLines.supLine.p1.low +
      trendLines.supLine.slope * (idx - trendLines.supLine.p1.localIndex);
  }

  // LONG
  let lStop = liqSupport && (currentPrice - liqSupport) < 3.0 * effectiveAtr
    ? liqSupport * 0.985
    : currentPrice - 2.0 * effectiveAtr;

  if (formationSup && formationSup < currentPrice && (currentPrice - formationSup) < 3.0 * effectiveAtr) {
    lStop = formationSup * 0.99;
  }
  if (currentPrice - lStop < 1.5 * effectiveAtr) lStop = currentPrice - 1.5 * effectiveAtr;

  let lTarget = liqRes && (liqRes - currentPrice) > 2.0 * effectiveAtr
    ? liqRes * 0.99
    : currentPrice + 3.0 * effectiveAtr;

  const bestLong = {
    entry: currentPrice,
    stop: smartRound(lStop),
    target: smartRound(lTarget),
    rr: (lTarget - currentPrice)/(currentPrice - lStop),
    note: formationSup ? "Trend Line Support" : "Vol Stop"
  };

  // SHORT
  let sStop = liqRes && (liqRes - currentPrice) < 3.0 * effectiveAtr
    ? liqRes * 1.015
    : currentPrice + 2.0 * effectiveAtr;
  if (sStop - currentPrice < 1.5 * effectiveAtr) sStop = currentPrice + 1.5 * effectiveAtr;

  let sTarget = liqSupport && (currentPrice - liqSupport) > 2.0 * effectiveAtr
    ? liqSupport * 1.01
    : currentPrice - 3.0 * effectiveAtr;

  const riskShort = sStop - currentPrice;
  const rewardShort = currentPrice - sTarget;
  const rrShort = riskShort > 0 ? rewardShort / riskShort : 0;

  const bestShort = {
    entry: currentPrice,
    stop: smartRound(sStop),
    target: smartRound(sTarget),
    rr: rrShort,
    note: liqRes ? "Structure Res" : "Vol Stop"
  };

  let recommendation = "WAIT";

  const isBullish = trendFilter !== null ? currentPrice > trendFilter : score > 0;

  if (isBullish) {
    if (score > 10) recommendation = "LONG";
    else recommendation = "WAIT (Weak Bull)";
  } else {
    if (score < -10) recommendation = "SHORT";
    else recommendation = "WAIT (Weak Bear)";
  }

  if (formationSup && currentPrice < formationSup) {
    if (recommendation === "LONG") recommendation = "WAIT (Trend Broken)";
    else if (score < 0) recommendation = "SHORT (Breakdown)";
  }

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

  if (fundingRealTime && fundingRealTime.rate) {
    if (fundingRealTime.rate > 0.0005 && recommendation.includes("LONG")) {
      recommendation = "WAIT (High Funding)";
    }
  }

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

const runBacktest = (data, signals, atrArray, days) => {
  let wins = 0, losses = 0;
  let grossWinR = 0;
  let grossLossR = 0;

  const equityCurve = [{ trade: 0, equity: 100 }];
  const uniqueSignals = signals
    .filter((v,i,a)=>a.findIndex(t=>(t.localIndex === v.localIndex && t.type === v.type))===i)
    .sort((a,b)=>a.localIndex - b.localIndex);

  uniqueSignals.forEach((sig, idx) => {
    const atr = Math.max(atrArray[sig.localIndex] || (sig.price * 0.05), sig.price * 0.01);
    const effectiveAtr = Math.min(atr, sig.price * 0.05);

    let stop = sig.type === 'buy'
      ? sig.price - 1.5 * effectiveAtr
      : sig.price + 1.5 * effectiveAtr;
    let target = sig.type === 'buy'
      ? sig.price + 3.0 * effectiveAtr
      : sig.price - 3.0 * effectiveAtr;

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

    const prevEquity = equityCurve[equityCurve.length-1].equity;
    if (result === 'win') {
      wins++;
      grossWinR += 2.0;
      equityCurve.push({ trade: idx+1, equity: prevEquity * 1.04 });
    } else if (result === 'loss') {
      losses++;
      grossLossR += 1.0;
      equityCurve.push({ trade: idx+1, equity: prevEquity * 0.98 });
    } else {
      equityCurve.push({ trade: idx+1, equity: prevEquity });
    }
  });

  const total = uniqueSignals.length;
  const winRate = total > 0 ? wins / total : 0;
  const profitFactor = grossLossR > 0
    ? grossWinR / grossLossR
    : (grossWinR > 0 ? 100 : 0);

  const kelly = winRate - ((1 - winRate) / 2.0);

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

const analyzeData = (data, config, derivatives, fundingRealTime, timeframeName) => {
  const closePrices = data.map(d => d.close);
  const rsiFull = calculateRSI(closePrices, config.rsi);
  const macdFull = calculateMACD(closePrices);
  const atrFull = calculateATRSeries(data, 14);
  const sma50Full = calculateSMA(closePrices, 50);
  const sma200Full = calculateSMA(closePrices, 200);
  const ema9Full = calculateEMA(closePrices, 9);
  const { adx: adxVal, slope: adxSlope, adxSeries: adxFull } = calculateADX(data, 14);

  const sliceStartIndex = Math.max(0, data.length - config.days);
  const slice = data.slice(sliceStartIndex);
  const rsi = rsiFull[rsiFull.length - 1];

  const macdSlice = macdFull.slice(sliceStartIndex);
  const atrSlice = atrFull.slice(sliceStartIndex);

  let maLineSlice = [];
  let maFilterFull = [];

  if (timeframeName === 'short') {
    maLineSlice = ema9Full.slice(sliceStartIndex);
    maFilterFull = ema9Full;
  } else if (timeframeName === 'medium') {
    maLineSlice = sma50Full.slice(sliceStartIndex);
    maFilterFull = sma50Full;
  } else {
    maLineSlice = sma200Full.slice(sliceStartIndex);
    maFilterFull = sma200Full;
  }

  if (!slice.length) return null;

  const indices = slice.map((_,i) => i);
  const trend = calculateRobustTrend(indices, slice.map(d => Math.log(d.close)));
  const patterns = findPatterns(slice, config.pivotWin);
  const vp = calculateVolumeProfile(slice, 30);

  const backtestSignals = [];
  const chartSignals = [];
  const startLook = 50;

  const avgVolFull = data.slice(-200).reduce((a,b)=>a+b.volume,0) / 200;
  const volThreshold = timeframeName === 'short' ? 0.5 : 0.8;

  for (let i = startLook; i < data.length - 1; i++) {
    const curr = macdFull[i];
    const prev = macdFull[i - 1];
    if (!curr || !prev) continue;

    const close = data[i].close;
    const open = data[i].open;
    const trendFilter = maFilterFull[i];
    if (trendFilter === null) continue;

    const isBullishTrend = close > trendFilter;
    const isBearishTrend = close < trendFilter;
    const rsiVal = rsiFull[i];
    const prevRsi = rsiFull[i-1];
    const adx = adxFull[i];
    const isGreenCandle = close > open;
    const isRedCandle = close < open;

    if (adx > 15) {
      if (curr.histogram > 0 && prev.histogram <= 0 && isBullishTrend && rsiVal < 70 && isGreenCandle) {
        backtestSignals.push({ type: 'buy', price: close, localIndex: i, label: 'Trend' });
      } else if (curr.histogram < 0 && prev.histogram >= 0 && isBearishTrend && rsiVal > 30 && isRedCandle) {
        backtestSignals.push({ type: 'sell', price: close, localIndex: i, label: 'Trend' });
      }
    }

    const longTermTrend = sma200Full[i];
    if (longTermTrend !== null) {
      const macroBull = close > longTermTrend;
      if (rsiVal > 30 && prevRsi <= 30 && (timeframeName === 'short' || macroBull)) {
        backtestSignals.push({ type: 'buy', price: close, localIndex: i, label: 'Dip' });
      } else if (rsiVal < 70 && prevRsi >= 70 && (timeframeName === 'short' || !macroBull)) {
        backtestSignals.push({ type: 'sell', price: close, localIndex: i, label: 'Top' });
      }
    }
  }

  backtestSignals.forEach(s => {
    if (s.localIndex >= sliceStartIndex) {
      chartSignals.push({ ...s, localIndex: s.localIndex - sliceStartIndex });
    }
  });

  const sortedChartSignals = chartSignals.sort((a, b) => a.localIndex - b.localIndex);
  const filteredChartSignals = [];
  const minGap = timeframeName === 'short' ? 5 : 15;

  for (const s of sortedChartSignals) {
    const last = filteredChartSignals[filteredChartSignals.length - 1];
    if (!last || (s.localIndex - last.localIndex) > minGap) {
      filteredChartSignals.push(s);
    }
  }
  patterns.signals = filteredChartSignals;

  const current = slice[slice.length-1].close;
  const trendDir = trend.slope * 365 > 0.1
    ? 'rising'
    : trend.slope * 365 < -0.1
      ? 'falling'
      : 'sideways';
  let score = trendDir === 'rising' ? 30 : trendDir === 'falling' ? -30 : 0;
  const trendStatus =
    current > Math.exp(trend.slope * (slice.length-1) + trend.intercept + 2.0 * trend.sigma)
      ? 'break_up'
      : current < Math.exp(trend.slope * (slice.length-1) + trend.intercept - 2.0 * trend.sigma)
        ? 'break_down'
        : 'inside';
  if (trendStatus === 'break_up') score += 20;
  else if (trendStatus === 'break_down') score -= 20;
  if (rsi < 30) score += 10;
  if (rsi > 70) score -= 10;

  let derivativesRisk = 'NONE';
  let smartMoneyDelta = 0;
  let derivativesSentiment = 'Neutral';
  if (derivatives && derivatives.binanceTop && derivatives.binanceGlobal) {
    smartMoneyDelta = (derivatives.binanceTop.positions.longPct || 0) -
                      (derivatives.binanceGlobal.longPct || 0);
    if (smartMoneyDelta > 0.05) {
      score += 15; derivativesSentiment = 'Bullish Divergence';
    } else if (smartMoneyDelta < -0.05) {
      score -= 15; derivativesSentiment = 'Bearish Divergence';
    }
    if (derivatives.binanceGlobal.ratio > 2.5) {
      score -= 20; derivativesRisk = 'LONG_CROWDED'; derivativesSentiment = 'Overcrowded Longs';
    } else if (derivatives.binanceGlobal.ratio < 0.7) {
      score += 20; derivativesRisk = 'SHORT_CROWDED'; derivativesSentiment = 'Overcrowded Shorts';
    }
  }

  const fibSwing = findFibSwing(slice, patterns);
  const fibLevels = calculateFibLevels(fibSwing);
  let fibPocket = null;
  if (fibLevels.length) {
    const golden = fibLevels.filter(f => f.ratio === 0.5 || f.ratio === 0.618);
    if (golden.length) {
      fibPocket = {
        low: Math.min(...golden.map(g=>g.price)),
        high: Math.max(...golden.map(g=>g.price))
      };
    }
  }

  let regime = 'RANGING';
  if (adxVal > 25) {
    regime = (adxVal > 35) ? 'STRONG_TREND' : 'TRENDING';
  }

  const processed = slice.map((d, i) => {
    const ml = trend.slope * i + trend.intercept;
    let resY = null, supY = null;
    if (patterns.resLine && i >= patterns.resLine.p1.localIndex) {
      resY = patterns.resLine.p1.high +
        patterns.resLine.slope * (i - patterns.resLine.p1.localIndex);
    }
    if (patterns.supLine && i >= patterns.supLine.p1.localIndex) {
      supY = patterns.supLine.p1.low +
        patterns.supLine.slope * (i - patterns.supLine.p1.localIndex);
    }

    const sig = patterns.signals.find(s => s.localIndex === i);

    return {
      ...d,
      trendUpper: Math.exp(ml + 2.0 * trend.sigma),
      trendLower: Math.exp(ml - 2.0 * trend.sigma),
      formationRes: resY,
      formationSup: supY,
      signalType: sig?.type,
      macdHist: macdSlice[i]?.histogram,
      macdSignal: macdSlice[i]?.signal,
      macdLine: macdSlice[i]?.macd,
      emaLine: maLineSlice[i]
    };
  });

  const currentTrendFilter = maFilterFull[maFilterFull.length - 1];

  let macdHist = 0, prevMacdHist = 0;
  if (macdSlice.length >= 2) {
    macdHist = macdSlice[macdSlice.length-1]?.histogram ?? 0;
    prevMacdHist = macdSlice[macdSlice.length-2]?.histogram ?? 0;
  }

  const tradeSetups = calculateTradeSetups(
    slice,
    current,
    patterns.supLevels,
    patterns.resLevels,
    atrSlice[atrSlice.length-1],
    score,
    { hist: macdHist, prevHist: prevMacdHist },
    regime,
    vp,
    derivatives,
    timeframeName,
    fundingRealTime,
    patterns,
    currentTrendFilter
  );
  const backtestStats = runBacktest(data, backtestSignals, atrFull, config.days);
  const velocity = adxSlope > 0 ? "Accelerating" : "Decelerating";

  return {
    data: processed,
    vp,
    patterns,
    current,
    score: Math.max(-100, Math.min(100, score)),
    trend: { dir: score > 0 ? 'rising' : 'falling' },
    rsi,
    regime,
    adx: adxVal,
    atrPct: atrSlice[atrSlice.length-1]/current,
    tradeSetups,
    backtestStats,
    fib: { swing: fibSwing, levels: fibLevels, goldenPocket: fibPocket },
    smartSupports: patterns.supLevels.slice(0,3).map(s => ({
      ...s,
      width: 1 + getVolumeStrength(s.price, vp)*3
    })),
    smartResistances: patterns.resLevels.slice(0,3).map(r => ({
      ...r,
      width: 1 + getVolumeStrength(r.price, vp)*3
    })),
    derivatives,
    derivativesRisk,
    smartMoneyDelta,
    derivativesSentiment,
    velocity
  };
};


// --- COMPONENTS ---
// cleaner, smaller, semi-transparent tooltip
const MainChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const seen = new Set();
  const rows = [];
  const allowedKeys = new Set(['close', 'trendUpper', 'trendLower', 'emaLine']);

  payload.forEach((item) => {
    if (!item) return;
    const key = item.dataKey || item.name;
    if (!key || seen.has(key) || !allowedKeys.has(key)) return;
    if (item.value === null || item.value === undefined) return;
    seen.add(key);
    rows.push(item);
  });

  const displayName = (key) => {
    const map = {
      trendUpper: 'Trend Upper',
      trendLower: 'Trend Lower',
      close: 'Close',
      emaLine: 'Trend MA',
    };
    return map[key] || key;
  };

  const formatValue = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    const abs = Math.abs(value);
    if (abs >= 1000) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (abs >= 1) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  return (
    <div
      className="rounded-lg px-3 py-2 text-[11px]"
      style={{
        background: 'rgba(15,23,42,0.9)',
        border: '1px solid rgba(148,163,184,0.6)',
        boxShadow: '0 10px 15px -3px rgba(15,23,42,0.5)',
        color: '#e2e8f0',
      }}
    >
      <div className="font-semibold mb-1 text-slate-200">{label}</div>
      {rows.map((item, idx) => (
        <div key={idx} className="flex justify-between gap-4">
          <span className="text-slate-400">
            {displayName(item.dataKey)}
          </span>
          <span className="font-mono text-slate-50">
            {formatValue(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const RatioBar = ({ longPct, shortPct, label, subLabel }) => {
  const l = (longPct * 100).toFixed(0);
  const s = (shortPct * 100).toFixed(0);
  return (
    <div className="w-full mb-3">
      <div className="flex justify-between text-[10px] mb-1 text-slate-400 uppercase font-bold tracking-wider">
        <span>{label}</span><span>{subLabel}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800 flex">
        <div
          style={{ width: `${l}%` }}
          className="bg-emerald-500 flex items-center justify-start pl-1 transition-all duration-500"
        ></div>
        <div
          style={{ width: `${s}%` }}
          className="bg-rose-500 flex items-center justify-end pr-1 transition-all duration-500"
        ></div>
      </div>
      <div className="flex justify-between text-[10px] mt-0.5 font-mono text-slate-500">
        <span>{l}% L</span><span>{s}% S</span>
      </div>
    </div>
  );
};

const App = () => {
  const [timeframe, setTimeframe] = useState('medium');
  const [marketData, setMarketData] = useState(null);
  const [marketError, setMarketError] = useState(null);
  const [derivatives, setDerivatives] = useState(null);
  const [fundingRealTime, setFundingRealTime] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const load = async () => {
      const data = await fetchMarketData();
      if (!data) setMarketError("Market data unavailable. API limits or connectivity issues.");
      else setMarketData(data);
    };
    load();

    const loadDerivatives = async () => {
      try {
        const [bGlobal, bTop, byb, rtFund] = await Promise.all([
          fetchBinanceGlobal(),
          fetchBinanceTop(),
          fetchBybit(),
          fetchRealTimeFunding()
        ]);
        if (bGlobal && bTop) setDerivatives({ binanceGlobal: bGlobal, binanceTop: bTop, bybit: byb });
        if (rtFund) setFundingRealTime(rtFund);
      } catch(e) { console.log("Derivatives fetch error", e); }
    };
    loadDerivatives();
    const interval = setInterval(loadDerivatives, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if(!marketData) return;
    const config = {
      short:  { days: 90,  pivotWin: 3,  rsi: 14 },
      medium: { days: 365, pivotWin: 10, rsi: 14 },
      long:   { days: 1000, pivotWin: 20, rsi: 14 }
    };
    setAnalysis(analyzeData(marketData, config[timeframe], derivatives, fundingRealTime, timeframe));
  }, [marketData, timeframe, derivatives, fundingRealTime]);

  if(marketError) {
    return (
      <div className="p-10 flex justify-center text-red-400 flex-col items-center gap-2">
        <AlertTriangle/>
        <div className="text-sm">{marketError}</div>
      </div>
    );
  }
  if(!analysis) {
    return (
      <div className="p-10 flex justify-center text-slate-400">
        <RefreshCw className="animate-spin"/>
      </div>
    );
  }

  const {
    current,
    score,
    tradeSetups,
    backtestStats,
    trend,
    regime,
    adx,
    derivativesRisk,
    smartMoneyDelta,
    derivativesSentiment,
    velocity
  } = analysis;

  return (
    <div className="max-w-6xl mx-auto bg-slate-50 p-6 font-sans text-slate-900">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-slate-200 pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 text-slate-800 tracking-tight">
            <Activity className="text-indigo-600 w-8 h-8" /> Bitcoin AI Analyst
          </h1>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-2 items-center">
            {derivativesSentiment && (
              <span
                className={`px-2 py-1 rounded flex items-center gap-1 ${
                  derivativesSentiment.includes('Bullish')
                    ? 'bg-emerald-100 text-emerald-700'
                    : derivativesSentiment.includes('Bearish') ||
                      derivativesSentiment.includes('Overcrowded')
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Users className="w-3 h-3" /> {derivativesSentiment}
              </span>
            )}
            {Number.isFinite(smartMoneyDelta) && (
              <span className="px-2 py-1 rounded flex items-center gap-1 bg-white border border-slate-200 text-slate-700">
                <Target className="w-3 h-3" />
                Delta:{' '}
                <span className={smartMoneyDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {(smartMoneyDelta * 100).toFixed(1)}%
                </span>
                <span className="normal-case">
                  ({smartMoneyDelta > 0 ? 'Whales Long' : 'Whales Short'})
                </span>
              </span>
            )}
            <span
              className={`px-2 py-1 rounded flex items-center gap-1 ${
                regime === 'STRONG_TREND'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              <Gauge className="w-3 h-3" /> {regime.replace('_', ' ')}
            </span>
            <span className="bg-white border border-slate-200 px-2 py-1 rounded flex items-center gap-1">
              <Zap className="w-3 h-3" /> ADX {adx.toFixed(0)}
            </span>
            <span
              className={`border px-2 py-1 rounded flex items-center gap-1 ${
                velocity === 'Accelerating'
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-slate-50 text-slate-500 border-slate-100'
              }`}
            >
              <Timer className="w-3 h-3" /> {velocity}
            </span>
            {fundingRealTime && (
              <span
                className={`px-2 py-1 rounded flex items-center gap-1 ${
                  fundingRealTime.rate > 0.0005
                    ? 'bg-rose-100 text-rose-700'
                    : fundingRealTime.rate < 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Percent className="w-3 h-3" />
                Funding {formatPercent(fundingRealTime.rate)}
              </span>
            )}
            {analysis.derivatives && (
              <span className="px-2 py-1 rounded flex items-center gap-1 bg-slate-100 text-slate-700">
                <Users className="w-3 h-3" />
                L/S{' '}
                {analysis.derivatives.binanceGlobal?.ratio
                  ? `${analysis.derivatives.binanceGlobal.ratio.toFixed(2)}x`
                  : '–'}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          {['short', 'medium', 'long'].map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                timeframe === t
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COL: CHART */}
        <div className="lg:col-span-2 border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="h-[450px] w-full pt-4 pr-4 relative flex-grow">
            <ResponsiveContainer>
              <ComposedChart
                data={analysis.data}
                syncId="btc-sync"
                margin={{ top: 20, right: 60, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={true}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="date"
                  tick={{fontSize: 10, fill: '#94a3b8'}}
                  minTickGap={50}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  orientation="right"
                  tick={{fontSize: 11, fontWeight: '600', fill: '#64748b'}}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v)=>Number(v).toLocaleString()}
                />
                <Tooltip
                  content={<MainChartTooltip />}
                  cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                />
                {analysis.fib?.goldenPocket && (
                  <ReferenceArea
                    y1={analysis.fib.goldenPocket.low}
                    y2={analysis.fib.goldenPocket.high}
                    stroke="none"
                    fill="#f59e0b"
                    fillOpacity={0.05}
                  />
                )}

                {/* Linear Trend Channels */}
                <Line
                  type="monotone"
                  dataKey="trendUpper"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
                <Line
                  type="monotone"
                  dataKey="trendLower"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />

                {/* Formation Lines */}
                <Line
                  type="linear"
                  dataKey="formationRes"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  strokeOpacity={0.8}
                />
                <Line
                  type="linear"
                  dataKey="formationSup"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  strokeOpacity={0.8}
                />

                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#1e293b"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{r: 6}}
                />

                {/* Signals */}
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="none"
                  dot={(props) => {
                    const {cx, cy, payload} = props;
                    if(!payload || !payload.signalType) return null;
                    const uniqueKey = `sig-${payload.date}`;
                    const color = payload.signalType === 'buy' ? '#22c55e' : '#ef4444';
                    return (
                      <g key={uniqueKey} transform={`translate(${cx},${cy})`}>
                        {payload.signalType === 'buy' ? (
                          <ArrowUp
                            className="w-5 h-5 -ml-2.5"
                            stroke={color}
                            strokeWidth={3}
                            y={12}
                          />
                        ) : (
                          <ArrowDown
                            className="w-5 h-5 -ml-2.5"
                            stroke={color}
                            strokeWidth={3}
                            y={-28}
                          />
                        )}
                      </g>
                    );
                  }}
                  activeDot={false}
                />

                {/* Pivot Dots */}
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="none"
                  dot={(props) => {
                    const { cx, cy, payload, key } = props;
                    if (!payload || !payload.date || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;

                    const isH = analysis.patterns.majorHighs.some(h => h.date === payload.date);
                    const isL = analysis.patterns.majorLows.some(l => l.date === payload.date);

                    if (isH) {
                      return (
                        <circle
                          key={key}
                          cx={cx}
                          cy={cy}
                          r={4}
                          stroke="#ef4444"
                          strokeWidth={2}
                          fill="white"
                        />
                      );
                    }
                    if (isL) {
                      return (
                        <circle
                          key={key}
                          cx={cx}
                          cy={cy}
                          r={4}
                          stroke="#22c55e"
                          strokeWidth={2}
                          fill="white"
                        />
                      );
                    }
                    return null;
                  }}
                  activeDot={false}
                />

                {/* EMA Line */}
                <Line
                  type="monotone"
                  dataKey="emaLine"
                  stroke="#8b5cf6"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="2 2"
                />

                {analysis.smartSupports.map((s, i) => (
                  <ReferenceLine
                    key={`s-${i}`}
                    y={s.price}
                    stroke="#22c55e"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  >
                    <Label
                      value={`${s.price}`}
                      position="insideLeft"
                      fill="#22c55e"
                      fontSize={9}
                      fontWeight="bold"
                      dy={10}
                    />
                  </ReferenceLine>
                ))}
                {analysis.smartResistances.map((r, i) => (
                  <ReferenceLine
                    key={`r-${i}`}
                    y={r.price}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  >
                    <Label
                      value={`${r.price}`}
                      position="insideLeft"
                      fill="#ef4444"
                      fontSize={9}
                      fontWeight="bold"
                      dy={-10}
                    />
                  </ReferenceLine>
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* SUB-STRIP: MACD + Funding / L-S History */}
          <div className="h-40 w-full border-t border-slate-100 bg-slate-50/50 pr-4 pt-2 flex flex-col gap-2">
            {/* MACD MINI-CHART */}
            <div className="h-1/2 w-full">
              <ResponsiveContainer>
                <ComposedChart
                  data={analysis.data}
                  syncId="btc-sync"
                  margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                >
                  {/* hide X-axis here since the main chart already shows dates */}
                  <XAxis dataKey="date" hide />

                  {/* align Y with main chart: right-only axis */}
                  <YAxis
                    yAxisId="macd"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={false}
                    domain={['auto', 'auto']}
                  />

                  <Bar yAxisId="macd" dataKey="macdHist" barSize={2}>
                    {analysis.data.map((entry, index) => (
                      <Cell
                        key={`macd-cell-${index}`}
                        fill={entry.macdHist > 0 ? '#22c55e' : '#ef4444'}
                        fillOpacity={0.6}
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="macd"
                    type="monotone"
                    dataKey="macdLine"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    dot={false}
                  />
                  <Line
                    yAxisId="macd"
                    type="monotone"
                    dataKey="macdSignal"
                    stroke="#f59e0b"
                    strokeWidth={1}
                    dot={false}
                  />
                  <Tooltip
                    cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                    contentStyle={{
                      background: 'rgba(15,23,42,0.9)',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.6)',
                      boxShadow: '0 10px 15px -3px rgba(15,23,42,0.5)',
                      fontSize: '10px',
                      color: '#e2e8f0',
                    }}
                    labelStyle={{ color: '#cbd5f5', marginBottom: '0.15rem' }}
                    formatter={(value, name) => {
                      if (typeof value !== 'number' || !Number.isFinite(value)) {
                        return [value, name];
                      }
                      const v = value.toFixed(2);
                      if (name === 'macdHist') return [v, 'Hist'];
                      if (name === 'macdLine') return [v, 'MACD'];
                      if (name === 'macdSignal') return [v, 'Signal'];
                      return [v, name];
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* FUNDING + LONG/SHORT HISTORY */}
            <div className="h-1/2 w-full">
              <ResponsiveContainer>
                <ComposedChart
                  data={analysis.data}
                  syncId="btc-sync"
                  margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                >
                  {/* Hide X-axis here since the main chart already shows dates */}
                  <XAxis dataKey="date" hide />

                  {/* funding axis: right, hidden (no extra left margin) */}
                  <YAxis
                    yAxisId="funding"
                    orientation="right"
                    hide
                    domain={['auto', 'auto']}
                  />
                  {/* visible ratio axis, also on the right so charts align */}
                  <YAxis
                    yAxisId="ratio"
                    orientation="right"
                    tick={{ fontSize: 8, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'auto']}
                    tickFormatter={(v) => `${v.toFixed(1)}x`}
                  />

                  <Tooltip
                    cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                    contentStyle={{
                      background: 'rgba(15,23,42,0.9)',
                      borderRadius: 8,
                      border: '1px solid rgba(148,163,184,0.6)',
                      boxShadow: '0 10px 15px -3px rgba(15,23,42,0.5)',
                      fontSize: '10px',
                      color: '#e2e8f0',
                    }}
                    labelStyle={{ color: '#cbd5f5', marginBottom: '0.15rem' }}
                    formatter={(value, name) => {
                      const safe = (v) =>
                        v === null ||
                        v === undefined ||
                        !Number.isFinite(v)
                          ? null
                          : v;

                      if (name === 'fundingRate') {
                        const v = safe(value);
                        return [
                          v === null ? '-' : `${(v * 100).toFixed(3)}%`,
                          'Funding',
                        ];
                      }
                      if (name === 'globalLsRatio') {
                        const v = safe(value);
                        return [
                          v === null ? '-' : `${v.toFixed(2)}x`,
                          'Global L/S',
                        ];
                      }
                      if (name === 'topLsRatio') {
                        const v = safe(value);
                        return [
                          v === null ? '-' : `${v.toFixed(2)}x`,
                          'Whales L/S',
                        ];
                      }
                      return [value, name];
                    }}
                  />

                  <ReferenceLine
                    yAxisId="funding"
                    y={0}
                    stroke="#64748b"
                    strokeDasharray="3 3"
                  />

                  <Bar
                    yAxisId="funding"
                    dataKey="fundingRate"
                    barSize={2}
                    fill="#e5e7eb"
                  />
                  <Line
                    yAxisId="ratio"
                    type="monotone"
                    dataKey="globalLsRatio"
                    stroke="#38bdf8"
                    strokeWidth={1}
                    dot={false}
                  />
                  <Line
                    yAxisId="ratio"
                    type="monotone"
                    dataKey="topLsRatio"
                    stroke="#fb923c"
                    strokeWidth={1}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT COL: STATS & WIDGETS */}
        <div className="flex flex-col gap-4">
          {/* MAIN SIGNAL */}
          <div
            className={`p-5 rounded-xl border-l-4 shadow-sm bg-white ${
              tradeSetups.recommendation.includes('WAIT')
                ? 'border-slate-300'
                : tradeSetups.recommendation.includes('LONG')
                  ? 'border-green-500'
                  : 'border-red-500'
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Algo Signal
              </div>
              <div className="text-xs font-bold bg-slate-100 px-2 py-1 rounded text-slate-600">
                Score: {score}
              </div>
            </div>
            <div
              className={`text-2xl font-black tracking-tight ${
                tradeSetups.recommendation.includes('LONG')
                  ? 'text-green-600'
                  : tradeSetups.recommendation.includes('SHORT')
                    ? 'text-red-600'
                    : 'text-slate-700'
              }`}
            >
              {tradeSetups.recommendation}
            </div>
          </div>

          {/* BACKTEST MINI */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
            <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-2">
              <h4 className="font-bold text-xs uppercase tracking-widest text-slate-500">
                Backtest (Historical)
              </h4>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  backtestStats.reliability === 'HIGH'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {backtestStats.reliability}
              </span>
            </div>
            <div className="flex justify-between text-center mb-3">
              <div>
                <div className="text-[9px] text-slate-400 uppercase">
                  Win Rate
                </div>
                <div className="font-mono font-bold text-sm">
                  {backtestStats.winRate.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 uppercase">PF</div>
                <div className="font-mono font-bold text-sm">
                  {backtestStats.profitFactor.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-slate-400 uppercase">
                  Kelly
                </div>
                <div className="font-mono font-bold text-sm text-indigo-600">
                  {backtestStats.kelly.toFixed(0)}%
                </div>
              </div>
            </div>
            <div className="h-10 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={backtestStats.equityCurve}>
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[9px] text-slate-400 mt-1 text-center">
              Equity Curve ({backtestStats.total} Trades)
            </div>
          </div>

          {/* TRADE PLANS */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className={`p-2 rounded border ${
                tradeSetups.recommendation.includes('LONG')
                  ? 'bg-green-50 border-green-200'
                  : 'bg-slate-50 border-slate-100 opacity-60'
              }`}
            >
              <div className="text-[9px] font-black text-green-700 uppercase mb-1">
                Long (RR {tradeSetups.long.rr.toFixed(1)})
              </div>
              <div className="text-[10px] font-mono text-slate-600">
                <div className="flex justify-between">
                  <span>E</span>
                  <span>
                    $
                    {Math.round(tradeSetups.long.entry).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>S</span>
                  <span>
                    $
                    {Math.round(tradeSetups.long.stop).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>T</span>
                  <span>
                    $
                    {Math.round(tradeSetups.long.target).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <div
              className={`p-2 rounded border ${
                tradeSetups.recommendation.includes('SHORT')
                  ? 'bg-red-50 border-red-200'
                  : 'bg-slate-50 border-slate-100 opacity-60'
              }`}
            >
              <div className="text-[9px] font-black text-red-700 uppercase mb-1">
                Short (RR {tradeSetups.short.rr.toFixed(1)})
              </div>
              <div className="text-[10px] font-mono text-slate-600">
                <div className="flex justify-between">
                  <span>E</span>
                  <span>
                    $
                    {Math.round(tradeSetups.short.entry).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>S</span>
                  <span>
                    $
                    {Math.round(tradeSetups.short.stop).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>T</span>
                  <span>
                    $
                    {Math.round(tradeSetups.short.target).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* FUNDING ANALYTICS WIDGET (real-time snapshot) */}
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg border border-slate-800 mt-auto">
            <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
              <h4 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2 text-yellow-300">
                <Percent className="w-3 h-3"/> Funding Analytics
              </h4>
              {fundingRealTime && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {getCountDown(fundingRealTime.nextTime)}
                </span>
              )}
            </div>
            {fundingRealTime ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">
                    Predicted
                  </div>
                  <div
                    className={`text-lg font-mono font-bold ${
                      fundingRealTime.rate > 0.0001
                        ? 'text-red-400'
                        : fundingRealTime.rate < 0
                          ? 'text-green-400'
                          : 'text-white'
                    }`}
                  >
                    {formatPercent(fundingRealTime.rate)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase">
                    Annualized
                  </div>
                  <div className="text-lg font-mono font-bold text-yellow-400">
                    {formatPercent(fundingRealTime.annualized)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 text-center py-2">
                Loading Funding Data...
              </div>
            )}
          </div>

          {/* DERIVATIVES SENTIMENT WIDGET */}
          {analysis.derivatives ? (
            <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg border border-slate-800">
              <div className="grid grid-cols-2 gap-4 mb-4 border-b border-slate-800 pb-3">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                    Market Mood
                  </div>
                  <div
                    className={`text-sm font-bold flex items-center gap-1 ${
                      derivativesSentiment.includes('Bullish')
                        ? 'text-emerald-400'
                        : derivativesSentiment.includes('Bearish') ||
                          derivativesSentiment.includes('Overcrowded')
                          ? 'text-rose-400'
                          : 'text-slate-200'
                    }`}
                  >
                    {derivativesSentiment.includes('Bullish') ? (
                      <TrendingUp size={14}/>
                    ) : (
                      <TrendingDown size={14}/>
                    )}
                    {derivativesSentiment}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                    Global L/S Ratio
                  </div>
                  <div className="text-lg font-mono font-bold">
                    {analysis.derivatives.binanceGlobal.ratio.toFixed(2)}x
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <RatioBar
                  longPct={analysis.derivatives.binanceGlobal.longPct}
                  shortPct={analysis.derivatives.binanceGlobal.shortPct}
                  label="Retail Accounts"
                  subLabel="Global Sentiment"
                />
                <RatioBar
                  longPct={analysis.derivatives.binanceTop.positions.longPct}
                  shortPct={analysis.derivatives.binanceTop.positions.shortPct}
                  label="Whale Positions"
                  subLabel="Smart Money Top 20%"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-100 rounded-xl text-center text-xs text-slate-400 border border-slate-200 border-dashed flex items-center justify-center gap-2">
              <WifiOff className="w-4 h-4" /> Loading Derivatives...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<App />);
} else {
  console.error('No #root element found');
}
