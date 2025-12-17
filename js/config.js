/**
 * Bitcoin AI Analyst - Configuration
 * Constants, API endpoints, and global configuration
 */
(function() {
  'use strict';

  window.BTC = window.BTC || {};

  // CORS Proxy generators for API requests
  const PROXY_GENERATORS = [
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  // API Endpoints
  const API = {
    BINANCE_FUNDING: 'https://fapi.binance.com/fapi/v1/fundingRate',
    BINANCE_PREMIUM: 'https://fapi.binance.com/fapi/v1/premiumIndex',
    BINANCE_OI_HIST: 'https://fapi.binance.com/futures/data/openInterestHist',
    BINANCE_GLOBAL_LS: 'https://fapi.binance.com/futures/data/globalLongShortAccountRatio',
    BINANCE_TOP_ACC: 'https://fapi.binance.com/futures/data/topLongShortAccountRatio',
    BINANCE_TOP_POS: 'https://fapi.binance.com/futures/data/topLongShortPositionRatio',
    BYBIT_RATIO: 'https://api.bybit.com/v5/market/account-ratio',
    FEAR_GREED: 'https://api.alternative.me/fng/?limit=0&format=json',
    CRYPTO_COMPARE: 'https://min-api.cryptocompare.com/data/v2/histoday'
  };

  // Timeframe configurations with scoring weights
  const TIMEFRAMES = {
    short:  { 
      days: 90,   
      pivotWin: 3,  
      rsi: 14,
      atrCap: 0.08,        // 8% max ATR for short-term
      adxThreshold: 18,    // Lower ADX threshold for short-term
      weights: {
        trend: 20,         // Less weight on trend
        breakout: 25,      // More weight on breakouts
        rsi: 15,
        macd: 10,
        derivatives: 20
      }
    },
    medium: { 
      days: 365,  
      pivotWin: 10, 
      rsi: 14,
      atrCap: 0.05,        // 5% max ATR
      adxThreshold: 20,    // Standard threshold
      weights: {
        trend: 30,
        breakout: 20,
        rsi: 10,
        macd: 5,
        derivatives: 25
      }
    },
    long:   { 
      days: 1000, 
      pivotWin: 20, 
      rsi: 14,
      atrCap: 0.04,        // 4% max ATR for long-term
      adxThreshold: 25,    // Higher threshold - need strong trends
      weights: {
        trend: 40,         // Heavy weight on trend
        breakout: 15,
        rsi: 5,            // RSI less relevant long-term
        macd: 5,
        derivatives: 15    // Derivatives are short-term noise
      }
    }
  };

  // Fibonacci levels for retracement analysis
  const FIB_LEVELS = [0.382, 0.5, 0.618];

  // Default symbol
  const SYMBOL = 'BTCUSDT';

  // Export to namespace
  window.BTC.config = {
    PROXY_GENERATORS,
    API,
    TIMEFRAMES,
    FIB_LEVELS,
    SYMBOL
  };

})();