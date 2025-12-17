/**
 * Bitcoin AI Analyst - API Module
 * All data fetching functions for market data, derivatives, and sentiment
 */
(function() {
  'use strict';

  window.BTC = window.BTC || {};
  const { config, utils } = window.BTC;

  // ============================================
  // CORE FETCH UTILITY
  // ============================================

  async function fetchJson(targetUrl) {
    const urlWithTime = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    let lastError = null;

    for (const generateProxyUrl of config.PROXY_GENERATORS) {
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

  // ============================================
  // FUNDING RATE DATA
  // ============================================

  async function fetchFundingHistory() {
    const history = {};
    try {
      const symbol = config.SYMBOL;
      const limit = 1000;
      let startTime = Date.UTC(2019, 0, 1);
      const now = Date.now();
      let pageCount = 0;
      const MAX_PAGES = 10;

      while (startTime < now && pageCount < MAX_PAGES) {
        const url = `${config.API.BINANCE_FUNDING}?symbol=${symbol}&limit=${limit}&startTime=${startTime}`;
        const batch = await fetchJson(url);

        if (!Array.isArray(batch) || batch.length === 0) break;

        for (const d of batch) {
          const t = d.fundingTime || d.fundingTime === 0 ? d.fundingTime : null;
          const r = parseFloat(d.fundingRate);
          if (!t || !Number.isFinite(r)) continue;

          const dateStr = new Date(t).toISOString().split('T')[0];
          if (!history[dateStr]) history[dateStr] = [];
          history[dateStr].push(r);
        }

        const lastTime = Math.max(...batch.map(x => x.fundingTime || 0));
        if (!Number.isFinite(lastTime) || lastTime <= startTime) break;

        startTime = lastTime + 1;
        pageCount += 1;
      }

      return history;
    } catch (e) {
      console.error('Funding history fetch failed', e);
      return history;
    }
  }

  async function fetchRealTimeFunding() {
    try {
      const data = await fetchJson(`${config.API.BINANCE_PREMIUM}?symbol=${config.SYMBOL}`);
      if (data && data.lastFundingRate) {
        return {
          rate: parseFloat(data.lastFundingRate),
          nextTime: parseInt(data.nextFundingTime),
          annualized: parseFloat(data.lastFundingRate) * 3 * 365
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // SENTIMENT DATA
  // ============================================

  async function fetchGoogleTrendsHistory() {
    const history = {};
    try {
      const res = await fetch('./btc_google_trends.json?t=' + Date.now());
      
      if (!res.ok) {
        console.warn('[GT] trends JSON not found / status', res.status);
        return history;
      }

      const rows = await res.json();
      if (!Array.isArray(rows)) {
        console.warn('[GT] unexpected payload', rows);
        return history;
      }

      rows.forEach((row) => {
        const rawDate = row.date || row.Date || row.ds;
        if (!rawDate) return;

        const dateStr = String(rawDate).slice(0, 10);

        const btcRaw = row.bitcoin ?? row.btc ?? row.search_bitcoin ?? null;
        const buyRaw = row.buy_bitcoin ?? row.buyBitcoin ?? row.search_buy_bitcoin ?? null;
        const crashRaw = row.bitcoin_crash ?? row.bitcoinCrash ?? row.search_bitcoin_crash ?? null;

        const btc = Number(btcRaw);
        const buy = Number(buyRaw);
        const crash = Number(crashRaw);

        history[dateStr] = {
          bitcoin: Number.isFinite(btc) ? btc : null,
          buyBitcoin: Number.isFinite(buy) ? buy : null,
          bitcoinCrash: Number.isFinite(crash) ? crash : null,
        };
      });
    } catch (e) {
      console.error('[GT] Google Trends fetch failed', e);
    }
    return history;
  }

  async function fetchFearGreedHistory() {
    const history = {};
    const url = config.API.FEAR_GREED;

    try {
      let json = null;

      // Try direct first
      try {
        const res = await fetch(url);
        if (res.ok) {
          json = await res.json();
          console.log('[FNG] direct ok, count:', json?.data?.length);
        }
      } catch (e) {
        console.warn('[FNG] direct fetch failed', e);
      }

      // Fallback to proxy
      if (!json) {
        json = await fetchJson(url);
        console.log('[FNG] proxy response', json && json.data && json.data.length);
      }

      if (!json || !Array.isArray(json.data)) {
        console.warn('[FNG] unexpected payload', json);
        return history;
      }

      json.data.forEach((row) => {
        const ts = Number(row.timestamp);
        const val = Number(row.value);
        if (!Number.isFinite(ts) || !Number.isFinite(val)) return;

        const dateStr = new Date(ts * 1000).toISOString().split('T')[0];
        history[dateStr] = {
          fearGreed: val,
          fearGreedClass: row.value_classification || '',
        };
      });

      return history;
    } catch (e) {
      console.error('[FNG] fetch failed', e);
      return history;
    }
  }

  // ============================================
  // OPEN INTEREST DATA
  // ============================================

  async function fetchOpenInterestHistory() {
    const history = {};
    try {
      const url = `${config.API.BINANCE_OI_HIST}?symbol=${config.SYMBOL}&period=1d&limit=365`;

      const raw = await fetchJson(url);
      const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data)) ? raw.data : [];

      arr.forEach(d => {
        const t = Number(d.timestamp ?? d.time);
        const oiRaw = d.sumOpenInterest ?? d.openInterest ?? d.sumOpenInterestValue;
        const oi = Number(oiRaw);
        if (!Number.isFinite(t) || !Number.isFinite(oi)) return;

        const dateStr = new Date(Number(t)).toISOString().split('T')[0];
        const oiValRaw = d.sumOpenInterestValue;
        const oiVal = oiValRaw != null ? parseFloat(oiValRaw) : null;

        history[dateStr] = {
          openInterest: oi,
          openInterestUsd: Number.isFinite(oiVal) ? oiVal : null,
        };
      });
    } catch (e) {
      console.error('Open interest history fetch failed', e);
    }
    return history;
  }

  // ============================================
  // LONG/SHORT RATIO DATA
  // ============================================

  async function fetchLongShortHistory() {
    try {
      const [global, topPos] = await Promise.all([
        fetchJson(`${config.API.BINANCE_GLOBAL_LS}?symbol=${config.SYMBOL}&period=1d&limit=365`),
        fetchJson(`${config.API.BINANCE_TOP_POS}?symbol=${config.SYMBOL}&period=1d&limit=365`),
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

  // ============================================
  // REAL-TIME DERIVATIVES
  // ============================================

  async function fetchBinanceGlobal() {
    try {
      const data = await fetchJson(`${config.API.BINANCE_GLOBAL_LS}?symbol=${config.SYMBOL}&period=5m&limit=1`);
      if (!Array.isArray(data) || data.length === 0) return null;
      const last = data[data.length - 1];
      return { 
        longPct: Number(last.longAccount), 
        shortPct: Number(last.shortAccount), 
        ratio: Number(last.longShortRatio) 
      };
    } catch (e) { 
      return null; 
    }
  }

  async function fetchBinanceTop() {
    try {
      const [acc, pos] = await Promise.all([
        fetchJson(`${config.API.BINANCE_TOP_ACC}?symbol=${config.SYMBOL}&period=5m&limit=1`),
        fetchJson(`${config.API.BINANCE_TOP_POS}?symbol=${config.SYMBOL}&period=5m&limit=1`),
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
    } catch (e) { 
      return null; 
    }
  }

  async function fetchBybit() {
    try {
      const json = await fetchJson(`${config.API.BYBIT_RATIO}?category=linear&symbol=${config.SYMBOL}&period=5min&limit=1`);
      const item = json?.result?.list?.[0];
      if (!item) return null;
      const buy = Number(item.buyRatio);
      const sell = Number(item.sellRatio);
      return { longPct: buy, shortPct: sell, ratio: sell > 0 ? buy / sell : 0 };
    } catch (e) { 
      return null; 
    }
  }

  // ============================================
  // MAIN MARKET DATA FETCH
  // ============================================

  async function fetchMarketData() {
    try {
      let priceData = null;
      const priceUrl = `${config.API.CRYPTO_COMPARE}?fsym=BTC&tsym=USD&limit=2000`;

      // Try direct first
      try {
        const res = await fetch(priceUrl);
        if (res.ok) {
          const json = await res.json();
          if (json.Response === 'Success' && Array.isArray(json.Data?.Data)) {
            priceData = json.Data.Data;
          }
        }
      } catch (e) {
        console.warn('[fetchMarketData] direct histoday failed', e);
      }

      // Fallback to proxy
      if (!priceData) {
        const json = await fetchJson(priceUrl);
        if (json && json.Response === 'Success' && Array.isArray(json.Data?.Data)) {
          priceData = json.Data.Data;
        }
      }

      if (!priceData) {
        console.error('[fetchMarketData] No price data from CryptoCompare');
        return null;
      }

      // Fetch all supplementary data in parallel
      const [
        fundingHistory,
        lsHistory,
        oiHistory,
        fngHistory,
        gtHistory
      ] = await Promise.all([
        fetchFundingHistory(),
        fetchLongShortHistory(),
        fetchOpenInterestHistory(),
        fetchFearGreedHistory(),
        fetchGoogleTrendsHistory(),
      ]);

      const cleanData = [];
      const compositeRaw = [];
      const fngVals = [];

      // Forward-fill variables for GT
      let lastGt = { bitcoin: null, buy: null, crash: null };

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

          // Long/short ratios
          const ls = lsHistory[dateStr] || {};
          const globalLsRatio = ls.global ?? null;
          const topLsRatio = ls.top ?? null;

          // Open interest
          const oi = oiHistory[dateStr] || {};
          const openInterest = Number.isFinite(oi.openInterest) ? oi.openInterest : null;
          const openInterestUsd = Number.isFinite(oi.openInterestUsd) ? oi.openInterestUsd : null;

          // Fear & Greed
          const fng = fngHistory[dateStr] || {};
          const fearGreed = Number.isFinite(fng.fearGreed) ? fng.fearGreed : null;
          const fearGreedClass = fng.fearGreedClass || null;

          // Google Trends (forward fill)
          const gtExact = gtHistory[dateStr];
          if (gtExact) {
            if (Number.isFinite(gtExact.bitcoin)) lastGt.bitcoin = gtExact.bitcoin;
            if (Number.isFinite(gtExact.buyBitcoin)) lastGt.buy = gtExact.buyBitcoin;
            if (Number.isFinite(gtExact.bitcoinCrash)) lastGt.crash = gtExact.bitcoinCrash;
          }

          const gtBitcoin = lastGt.bitcoin;
          const gtBuy = lastGt.buy;
          const gtCrash = lastGt.crash;

          // GT composite: 0.5 * buy - 0.3 * crash + 0.2 * bitcoin
          let compositeVal = null;
          if (gtBitcoin != null || gtBuy != null || gtCrash != null) {
            const b = gtBitcoin ?? 0;
            const buy = gtBuy ?? 0;
            const crash = gtCrash ?? 0;
            compositeVal = 0.5 * buy - 0.3 * crash + 0.2 * b;
          }

          compositeRaw.push(compositeVal);
          fngVals.push(fearGreed);

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
            openInterest,
            openInterestUsd,
            oiChange: null,
            oiChangePct: null,
            fearGreed,
            fearGreedClass,
            gtBitcoin,
            gtBuy,
            gtCrash,
            gtCompositeZ: null,
            fearGreedZ: null,
            fgGtDivergence: null,
          });
        }
      });

      // Calculate sentiment z-scores
      if (cleanData.length) {
        const compositeZ = utils.calculateRollingZScore(compositeRaw, 180);
        const fngZ = utils.calculateRollingZScore(fngVals, 180);

        cleanData.forEach((row, i) => {
          row.gtCompositeZ = compositeZ[i];
          row.fearGreedZ = fngZ[i];
          row.fgGtDivergence = fngZ[i] != null && compositeZ[i] != null
            ? fngZ[i] - compositeZ[i]
            : null;
        });
      }

      // Forward-fill other metrics + ΔOI
      for (let i = 1; i < cleanData.length; i++) {
        const cur = cleanData[i];
        const prev = cleanData[i - 1];

        if (cur.fundingRate == null) cur.fundingRate = prev.fundingRate;
        if (cur.globalLsRatio == null) cur.globalLsRatio = prev.globalLsRatio;
        if (cur.topLsRatio == null) cur.topLsRatio = prev.topLsRatio;

        if (
          Number.isFinite(cur.openInterest) &&
          Number.isFinite(prev.openInterest) &&
          prev.openInterest !== 0
        ) {
          const diff = cur.openInterest - prev.openInterest;
          cur.oiChange = diff;
          cur.oiChangePct = diff / prev.openInterest;
        }
      }

      if (cleanData.length > 0 && Number.isFinite(cleanData[0].openInterest)) {
        cleanData[0].oiChange = 0;
        cleanData[0].oiChangePct = 0;
      }

      return cleanData;
    } catch (err) {
      console.error('[fetchMarketData] unexpected error', err);
      return null;
    }
  }

  // Export to namespace
  window.BTC.api = {
    fetchJson,
    fetchFundingHistory,
    fetchRealTimeFunding,
    fetchGoogleTrendsHistory,
    fetchFearGreedHistory,
    fetchOpenInterestHistory,
    fetchLongShortHistory,
    fetchBinanceGlobal,
    fetchBinanceTop,
    fetchBybit,
    fetchMarketData
  };

})();
