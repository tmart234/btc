/**
 * Bitcoin AI Analyst - Main Application
 * Core analyzer function and main React App component
 */
(function() {
  'use strict';

  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const { useState, useEffect } = React;

  if (!React || !ReactDOM) {
    throw new Error('Missing React/ReactDOM globals.');
  }

  const { config, utils, api, analysis, components } = window.BTC;
  const {
    icons, recharts, MainChartTooltip, RatioBar, StatusChip,
    TimeframeSelector, SignalCard, TradePlanCard, BacktestCard,
    FundingWidget, DerivativesWidget
  } = components;

  const {
    Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, ReferenceArea,
    ComposedChart, Bar, Label, Cell
  } = recharts;

  const {
    Activity, ArrowUp, ArrowDown, RefreshCw, AlertTriangle,
    Users, Target, Gauge, Zap, Timer, Percent, BrainCircuit, DollarSign
  } = icons;

  // ============================================
  // MAIN ANALYZER FUNCTION
  // ============================================

  const analyzeData = (data, configObj, derivatives, fundingRealTime, timeframeName) => {
    const closePrices = data.map(d => d.close);
    const rsiFull = analysis.calculateRSI(closePrices, configObj.rsi);
    const macdFull = analysis.calculateMACD(closePrices);
    const atrFull = analysis.calculateATRSeries(data, 14);
    const sma50Full = analysis.calculateSMA(closePrices, 50);
    const sma200Full = analysis.calculateSMA(closePrices, 200);
    const ema9Full = analysis.calculateEMA(closePrices, 9);
    const { adx: adxVal, slope: adxSlope, adxSeries: adxFull } = analysis.calculateADX(data, 14);

    const sliceStartIndex = Math.max(0, data.length - configObj.days);
    const slice = data.slice(sliceStartIndex);
    if (!slice.length) return null;

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

    const indices = slice.map((_, i) => i);
    const trend = utils.calculateRobustTrend(indices, slice.map(d => Math.log(d.close)));
    const patterns = analysis.findPatterns(slice, configObj.pivotWin);
    const vp = analysis.calculateVolumeProfile(slice, 30);

    // Signal generation for backtest
    const backtestSignals = [];
    const chartSignals = [];
    const startLook = 50;
    
    // Get timeframe-specific ADX threshold
    const adxThreshold = configObj.adxThreshold || 20;

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
      const prevRsi = rsiFull[i - 1];
      const adx = adxFull[i];
      const isGreenCandle = close > open;
      const isRedCandle = close < open;

      // MACD trend signals - use timeframe-specific threshold
      if (adx > adxThreshold) {
        if (curr.histogram > 0 && prev.histogram <= 0 && isBullishTrend && rsiVal < 70 && isGreenCandle) {
          backtestSignals.push({ type: 'buy', price: close, localIndex: i, label: 'Trend' });
        } else if (curr.histogram < 0 && prev.histogram >= 0 && isBearishTrend && rsiVal > 30 && isRedCandle) {
          backtestSignals.push({ type: 'sell', price: close, localIndex: i, label: 'Trend' });
        }
      }

      // RSI dip/top signals
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

    // Trend score calculation with timeframe-specific weights
    const current = slice[slice.length - 1].close;
    const trendSlopeAnnual = trend.slope * 365;
    const trendDir = trendSlopeAnnual > 0.1 ? 'rising' : trendSlopeAnnual < -0.1 ? 'falling' : 'sideways';
    
    // Get weights for current timeframe
    const weights = configObj.weights || { trend: 30, breakout: 20, rsi: 10, macd: 5, derivatives: 25 };

    let score = trendDir === 'rising' ? weights.trend : trendDir === 'falling' ? -weights.trend : 0;

    const mlLast = trend.slope * (slice.length - 1) + trend.intercept;
    const trendStatus =
      current > Math.exp(mlLast + 2.0 * trend.sigma) ? 'break_up' :
      current < Math.exp(mlLast - 2.0 * trend.sigma) ? 'break_down' : 'inside';

    if (trendStatus === 'break_up') score += weights.breakout;
    else if (trendStatus === 'break_down') score -= weights.breakout;

    // RSI contribution
    if (rsi < 30) score += weights.rsi;
    if (rsi > 70) score -= weights.rsi;
    
    // MACD momentum contribution
    const lastMacd = macdSlice[macdSlice.length - 1];
    const prevMacd = macdSlice[macdSlice.length - 2];
    if (lastMacd && prevMacd && weights.macd) {
      const histImproving = lastMacd.histogram > prevMacd.histogram;
      const histPositive = lastMacd.histogram > 0;
      if (histPositive && histImproving) score += weights.macd;
      else if (!histPositive && !histImproving) score -= weights.macd;
    }

    // Derivatives overlays
    let derivativesRisk = 'NONE';
    let smartMoneyDelta = 0;
    let derivativesSentiment = 'Neutral';

    if (derivatives && derivatives.binanceTop && derivatives.binanceGlobal) {
      smartMoneyDelta = (derivatives.binanceTop.positions.longPct || 0) -
                        (derivatives.binanceGlobal.longPct || 0);

      // Cap derivative contribution to weight
      const derivCap = weights.derivatives;
      
      if (smartMoneyDelta > 0.05) {
        score += Math.min(15, derivCap);
        derivativesSentiment = 'Bullish Divergence';
      } else if (smartMoneyDelta < -0.05) {
        score -= Math.min(15, derivCap);
        derivativesSentiment = 'Bearish Divergence';
      }

      if (derivatives.binanceGlobal.ratio > 2.5) {
        score -= Math.min(20, derivCap);
        derivativesRisk = 'LONG_CROWDED';
        derivativesSentiment = 'Overcrowded Longs';
      } else if (derivatives.binanceGlobal.ratio < 0.7) {
        score += Math.min(20, derivCap);
        derivativesRisk = 'SHORT_CROWDED';
        derivativesSentiment = 'Overcrowded Shorts';
      }
    }

    // Fib + regime
    const fibSwing = analysis.findFibSwing(slice, patterns, trend);
    const fibLevels = analysis.calculateFibLevels(fibSwing);
    let fibPocket = null;
    if (fibLevels.length) {
      const golden = fibLevels.filter(f => f.ratio === 0.5 || f.ratio === 0.618);
      if (golden.length) {
        fibPocket = {
          low: Math.min(...golden.map(g => g.price)),
          high: Math.max(...golden.map(g => g.price))
        };
      }
    }

    let regime = 'RANGING';
    if (adxVal > 25) regime = adxVal > 35 ? 'STRONG_TREND' : 'TRENDING';

    // Funding / OI stats
    const lastSlice = slice[slice.length - 1];

    const fundingAll = data.map(d => d.fundingRate);
    const fundingStats = utils.computeDistributionStats(fundingAll, lastSlice.fundingRate);
    const fundingExtreme = utils.classifyFundingExtreme(fundingStats);

    const oiChangesAll = data.map(d => d.oiChangePct);
    const lastOiChange = lastSlice.oiChangePct;
    const oiStats = utils.computeDistributionStats(oiChangesAll, lastOiChange);

    let oiFlowLabel = 'Neutral';
    if (slice.length > 1 && Number.isFinite(lastOiChange)) {
      const prevClose = slice[slice.length - 2].close;
      const priceChange = prevClose && Number.isFinite(prevClose)
        ? (lastSlice.close - prevClose) / prevClose
        : 0;
      oiFlowLabel = utils.classifyOpenInterestFlow(priceChange, lastOiChange, oiStats);
    }

    // Build processed chart data
    const processed = slice.map((d, i) => {
      const ml = trend.slope * i + trend.intercept;
      let resY = null;
      let supY = null;

      if (patterns.resLine && i >= patterns.resLine.p1.localIndex) {
        const anchor = patterns.resLine.p1.base ?? patterns.resLine.p1.high;
        resY = anchor + patterns.resLine.slope * (i - patterns.resLine.p1.localIndex);
      }
      if (patterns.supLine && i >= patterns.supLine.p1.localIndex) {
        const anchor = patterns.supLine.p1.base ?? patterns.supLine.p1.low;
        supY = anchor + patterns.supLine.slope * (i - patterns.supLine.p1.localIndex);
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

    let macdHist = 0;
    let prevMacdHist = 0;
    if (macdSlice.length >= 2) {
      macdHist = macdSlice[macdSlice.length - 1]?.histogram ?? 0;
      prevMacdHist = macdSlice[macdSlice.length - 2]?.histogram ?? 0;
    }

    const tradeSetups = analysis.calculateTradeSetups(
      slice, current, patterns.supLevels, patterns.resLevels,
      atrSlice[atrSlice.length - 1], score,
      { hist: macdHist, prevHist: prevMacdHist },
      regime, vp, derivatives, timeframeName, fundingRealTime,
      patterns, currentTrendFilter
    );

    const backtestStats = analysis.runBacktest(data, backtestSignals, atrFull, configObj.days, regime);
    const velocity = adxSlope > 0 ? 'Accelerating' : 'Decelerating';

    // Calculate Delta trend (whale vs retail positioning trend)
    let deltaTrend = 'stable';
    if (derivatives && derivatives.binanceTop && derivatives.binanceGlobal) {
      // Look at recent L/S ratio changes in slice data
      const recentSlice = slice.slice(-14); // Last 14 days
      const olderSlice = slice.slice(-28, -14); // Previous 14 days
      
      const recentGlobalData = recentSlice.filter(d => d.globalLsRatio != null && Number.isFinite(d.globalLsRatio));
      const olderGlobalData = olderSlice.filter(d => d.globalLsRatio != null && Number.isFinite(d.globalLsRatio));
      const recentTopData = recentSlice.filter(d => d.topLsRatio != null && Number.isFinite(d.topLsRatio));
      const olderTopData = olderSlice.filter(d => d.topLsRatio != null && Number.isFinite(d.topLsRatio));
      
      // Only calculate if we have sufficient data (at least 5 data points in each period)
      if (recentGlobalData.length >= 5 && olderGlobalData.length >= 5 && 
          recentTopData.length >= 5 && olderTopData.length >= 5) {
        
        const avgRecentGlobal = recentGlobalData.reduce((sum, d) => sum + d.globalLsRatio, 0) / recentGlobalData.length;
        const avgOlderGlobal = olderGlobalData.reduce((sum, d) => sum + d.globalLsRatio, 0) / olderGlobalData.length;
        const avgRecentTop = recentTopData.reduce((sum, d) => sum + d.topLsRatio, 0) / recentTopData.length;
        const avgOlderTop = olderTopData.reduce((sum, d) => sum + d.topLsRatio, 0) / olderTopData.length;
        
        const globalChange = avgRecentGlobal - avgOlderGlobal;
        const topChange = avgRecentTop - avgOlderTop;
        
        // Delta trend: how is whale positioning changing vs retail?
        const divergenceChange = topChange - globalChange;
        
        if (divergenceChange > 0.05) deltaTrend = 'whales accumulating';
        else if (divergenceChange < -0.05) deltaTrend = 'whales distributing';
        else if (topChange > 0.03) deltaTrend = 'whales adding longs';
        else if (topChange < -0.03) deltaTrend = 'whales reducing longs';
        else deltaTrend = 'stable';
      }
    }

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
      atrPct: atrSlice[atrSlice.length - 1] / current,
      tradeSetups,
      backtestStats,
      fib: { swing: fibSwing, levels: fibLevels, goldenPocket: fibPocket },
      smartSupports: patterns.supLevels.slice(0, 3).map(s => ({
        ...s,
        width: 1 + analysis.getVolumeStrength(s.price, vp) * 3
      })),
      smartResistances: patterns.resLevels.slice(0, 3).map(r => ({
        ...r,
        width: 1 + analysis.getVolumeStrength(r.price, vp) * 3
      })),
      derivatives,
      derivativesRisk,
      smartMoneyDelta,
      derivativesSentiment,
      deltaTrend,
      velocity,
      fundingStats,
      fundingExtreme,
      oiStats,
      oiFlowLabel,
      timeframeName
    };
  };

  // ============================================
  // MAIN APP COMPONENT
  // ============================================

  const App = () => {
    const [timeframe, setTimeframe] = useState('medium');
    const [marketData, setMarketData] = useState(null);
    const [marketError, setMarketError] = useState(null);
    const [derivatives, setDerivatives] = useState(null);
    const [fundingRealTime, setFundingRealTime] = useState(null);
    const [analysisResult, setAnalysisResult] = useState(null);

    useEffect(() => {
      const load = async () => {
        const data = await api.fetchMarketData();
        if (!data) setMarketError("Market data unavailable. API limits or connectivity issues.");
        else setMarketData(data);
      };
      load();

      const loadDerivatives = async () => {
        try {
          const [bGlobal, bTop, byb, rtFund] = await Promise.all([
            api.fetchBinanceGlobal(),
            api.fetchBinanceTop(),
            api.fetchBybit(),
            api.fetchRealTimeFunding()
          ]);
          if (bGlobal && bTop) setDerivatives({ binanceGlobal: bGlobal, binanceTop: bTop, bybit: byb });
          if (rtFund) setFundingRealTime(rtFund);
        } catch (e) { 
          console.log("Derivatives fetch error", e); 
        }
      };
      loadDerivatives();
      const interval = setInterval(loadDerivatives, 60000);
      return () => clearInterval(interval);
    }, []);

    useEffect(() => {
      if (!marketData) return;
      const result = analyzeData(marketData, config.TIMEFRAMES[timeframe], derivatives, fundingRealTime, timeframe);
      setAnalysisResult(result);
    }, [marketData, timeframe, derivatives, fundingRealTime]);

    if (marketError) {
      return (
        <div className="p-10 flex justify-center text-red-400 flex-col items-center gap-2">
          <AlertTriangle/>
          <div className="text-sm">{marketError}</div>
        </div>
      );
    }

    if (!analysisResult) {
      return (
        <div className="p-10 flex justify-center text-slate-400">
          <RefreshCw className="animate-spin"/>
        </div>
      );
    }

    const {
      current, score, tradeSetups, backtestStats, trend, regime, adx,
      derivativesRisk, smartMoneyDelta, derivativesSentiment, deltaTrend, velocity,
      fundingStats, fundingExtreme, oiStats, oiFlowLabel, timeframeName: currentTimeframe,
    } = analysisResult;

    const lastRow = analysisResult.data[analysisResult.data.length - 1] || {};
    const lastFgZ = lastRow.fearGreedZ;
    const lastGtZ = lastRow.gtCompositeZ;

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
                <StatusChip
                  icon={Users}
                  value={derivativesSentiment}
                  variant={derivativesSentiment.includes('Bullish') ? 'bullish' : 
                          derivativesSentiment.includes('Bearish') || derivativesSentiment.includes('Overcrowded') ? 'bearish' : 'default'}
                />
              )}
              
              {Number.isFinite(smartMoneyDelta) && (
                <span className="px-2 py-1 rounded flex items-center gap-1 bg-white border border-slate-200 text-slate-700">
                  <Target className="w-3 h-3" />
                  Delta: <span className={smartMoneyDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {(smartMoneyDelta * 100).toFixed(1)}%
                  </span>
                  <span className="normal-case">
                    ({smartMoneyDelta > 0 ? 'Whales Long' : 'Whales Short'}{deltaTrend && deltaTrend !== 'stable' ? ` • ${deltaTrend}` : ''})
                  </span>
                </span>
              )}

              <StatusChip
                icon={Gauge}
                value={regime.replace('_', ' ')}
                variant={regime === 'STRONG_TREND' ? 'info' : 'default'}
              />

              <span className="bg-white border border-slate-200 px-2 py-1 rounded flex items-center gap-1">
                <Zap className="w-3 h-3" /> ADX {adx.toFixed(0)}
              </span>

              <span className={`border px-2 py-1 rounded flex items-center gap-1 ${
                velocity === 'Accelerating'
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-slate-50 text-slate-500 border-slate-100'
              }`}>
                <Timer className="w-3 h-3" /> {velocity}
              </span>

              {fundingRealTime && (
                <StatusChip
                  icon={Percent}
                  value={utils.formatPercent(fundingRealTime.rate)}
                  label="Funding"
                  variant={fundingRealTime.rate > 0.0005 ? 'bearish' : fundingRealTime.rate < 0 ? 'bullish' : 'default'}
                />
              )}

              {fundingStats && fundingExtreme && (
                <span className={`px-2 py-1 rounded flex items-center gap-1 ${
                  fundingExtreme.side === 'long' ? 'bg-rose-100 text-rose-700' :
                  fundingExtreme.side === 'short' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  <Percent className="w-3 h-3" />
                  <span className="uppercase text-[9px] tracking-widest">Hist Funding</span>
                  <span className="font-mono">{fundingStats.percentile.toFixed(0)}th</span>
                  <span className="normal-case">{fundingExtreme.label}</span>
                </span>
              )}

              {Number.isFinite(lastFgZ) && (
                <span className="px-2 py-1 rounded flex items-center gap-1 bg-slate-100 text-slate-700">
                  <BrainCircuit className="w-3 h-3" />
                  <span className="uppercase text-[9px] tracking-widest">F&amp;G Z</span>
                  <span className="font-mono">{lastFgZ.toFixed(2)}</span>
                </span>
              )}

              {Number.isFinite(lastGtZ) && (
                <span className="px-2 py-1 rounded flex items-center gap-1 bg-slate-100 text-slate-700">
                  <Activity className="w-3 h-3" />
                  <span className="uppercase text-[9px] tracking-widest">GT Z</span>
                  <span className="font-mono">{lastGtZ.toFixed(2)}</span>
                </span>
              )}

              {oiStats && oiFlowLabel && (
                <span className={`px-2 py-1 rounded flex items-center gap-1 ${
                  oiFlowLabel.includes('Short Squeeze') || oiFlowLabel.includes('New Longs') || oiFlowLabel.includes('Long Build')
                    ? 'bg-emerald-100 text-emerald-700'
                    : oiFlowLabel.includes('Aggressive Shorting') || oiFlowLabel.includes('Liquidation')
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                }`}>
                  <DollarSign className="w-3 h-3" />
                  <span className="uppercase text-[9px] tracking-widest">OI Flow</span>
                  <span className="normal-case">{oiFlowLabel}</span>
                </span>
              )}

              {analysisResult.derivatives && (
                <span className="px-2 py-1 rounded flex items-center gap-1 bg-slate-100 text-slate-700">
                  <Users className="w-3 h-3" />
                  L/S {analysisResult.derivatives.binanceGlobal?.ratio
                    ? `${analysisResult.derivatives.binanceGlobal.ratio.toFixed(2)}x`
                    : '–'}
                </span>
              )}
            </div>
          </div>
          <TimeframeSelector timeframe={timeframe} onChange={setTimeframe} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COL: CHART */}
          <div className="lg:col-span-2 border border-slate-200 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="h-[450px] w-full pt-4 relative flex-grow">
              <ResponsiveContainer>
                <ComposedChart
                  data={analysisResult.data}
                  syncId="btc-sync"
                  margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    minTickGap={50}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[
                      (dataMin) => Math.floor(dataMin * 0.95 / 1000) * 1000,
                      (dataMax) => Math.ceil(dataMax * 1.05 / 1000) * 1000
                    ]}
                    orientation="right"
                    width={55}
                    tick={({ x, y, payload }) => {
                      // Check if this tick is near a support/resistance level
                      const val = payload.value;
                      const isNearRes = analysisResult.smartResistances.some(r => Math.abs(r.price - val) / val < 0.02);
                      const isNearSup = analysisResult.smartSupports.some(s => Math.abs(s.price - val) / val < 0.02);
                      
                      return (
                        <text
                          x={x}
                          y={y}
                          dy={4}
                          textAnchor="start"
                          fontSize={isNearRes || isNearSup ? 11 : 10}
                          fontWeight={isNearRes || isNearSup ? '700' : '500'}
                          fill={isNearRes ? '#ef4444' : isNearSup ? '#22c55e' : '#64748b'}
                        >
                          {Number(val).toLocaleString()}
                        </text>
                      );
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<MainChartTooltip />}
                    cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  />
                  
                  {analysisResult.fib?.goldenPocket && (
                    <ReferenceArea
                      y1={analysisResult.fib.goldenPocket.low}
                      y2={analysisResult.fib.goldenPocket.high}
                      stroke="none"
                      fill="#f59e0b"
                      fillOpacity={0.05}
                    />
                  )}

                  <Line type="monotone" dataKey="trendUpper" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="trendLower" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Line type="linear" dataKey="formationRes" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls strokeOpacity={0.8} />
                  <Line type="linear" dataKey="formationSup" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls strokeOpacity={0.8} />
                  <Line type="monotone" dataKey="close" stroke="#1e293b" strokeWidth={1.5} dot={false} activeDot={{ r: 6 }} />
                  
                  {/* Signals */}
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="none"
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!payload || !payload.signalType) return null;
                      const uniqueKey = `sig-${payload.date}`;
                      const color = payload.signalType === 'buy' ? '#22c55e' : '#ef4444';
                      return (
                        <g key={uniqueKey} transform={`translate(${cx},${cy})`}>
                          {payload.signalType === 'buy' ? (
                            <ArrowUp className="w-5 h-5 -ml-2.5" stroke={color} strokeWidth={3} y={12} />
                          ) : (
                            <ArrowDown className="w-5 h-5 -ml-2.5" stroke={color} strokeWidth={3} y={-28} />
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

                      const isH = analysisResult.patterns.majorHighs.some(h => h.date === payload.date);
                      const isL = analysisResult.patterns.majorLows.some(l => l.date === payload.date);

                      if (isH) {
                        return <circle key={key} cx={cx} cy={cy} r={4} stroke="#ef4444" strokeWidth={2} fill="white" />;
                      }
                      if (isL) {
                        return <circle key={key} cx={cx} cy={cy} r={4} stroke="#22c55e" strokeWidth={2} fill="white" />;
                      }
                      return null;
                    }}
                    activeDot={false}
                  />

                  <Line type="monotone" dataKey="emaLine" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="2 2" />

                  {analysisResult.smartSupports.map((s, i) => (
                    <ReferenceLine key={`s-${i}`} y={s.price} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5}>
                      <Label value={`${s.price}`} position="insideLeft" fill="#22c55e" fontSize={9} fontWeight="bold" dy={10} />
                    </ReferenceLine>
                  ))}
                  {analysisResult.smartResistances.map((r, i) => (
                    <ReferenceLine key={`r-${i}`} y={r.price} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5}>
                      <Label value={`${r.price}`} position="insideLeft" fill="#ef4444" fontSize={9} fontWeight="bold" dy={-10} />
                    </ReferenceLine>
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* SUB-STRIP CHARTS */}
            <div className="h-60 w-full border-t border-slate-100 bg-slate-50/50 pt-2 flex flex-col gap-2">
              {/* MACD */}
              <div className="h-1/3 w-full">
                <ResponsiveContainer>
                  <ComposedChart data={analysisResult.data} syncId="btc-sync" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis yAxisId="macd" orientation="right" width={55} axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#64748b' }} domain={['auto', 'auto']} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)} />
                    <Bar yAxisId="macd" dataKey="macdHist" barSize={2}>
                      {analysisResult.data.map((entry, index) => (
                        <Cell key={`macd-cell-${index}`} fill={entry.macdHist > 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.6} />
                      ))}
                    </Bar>
                    <Line yAxisId="macd" type="monotone" dataKey="macdLine" stroke="#3b82f6" strokeWidth={1} dot={false} />
                    <Line yAxisId="macd" type="monotone" dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1} dot={false} />
                    <Tooltip
                      cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                      labelFormatter={() => ''}
                      contentStyle={{
                        background: 'rgba(15,23,42,0.9)',
                        borderRadius: 8,
                        border: '1px solid rgba(148,163,184,0.6)',
                        fontSize: '10px',
                        color: '#e2e8f0',
                      }}
                      formatter={(value, name) => {
                        if (typeof value !== 'number' || !Number.isFinite(value)) return [value, name];
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

              {/* Funding (Medium/Long) OR OI + L/S (Short) */}
              <div className="h-1/3 w-full">
                <ResponsiveContainer>
                  {currentTimeframe === 'short' ? (
                    // SHORT: Show OI, Global L/S, Whales L/S
                    <ComposedChart data={analysisResult.data} syncId="btc-sync" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis yAxisId="oi" orientation="right" width={0} hide domain={['auto', 'auto']} />
                      <YAxis yAxisId="ratio" orientation="right" width={50} axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#64748b' }} domain={[0, 'auto']} tickFormatter={(v) => `${v.toFixed(1)}x`} />
                      <Tooltip
                        cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                        labelFormatter={() => ''}
                        contentStyle={{
                          background: 'rgba(15,23,42,0.9)',
                          borderRadius: 8,
                          border: '1px solid rgba(148,163,184,0.6)',
                          fontSize: '10px',
                          color: '#e2e8f0',
                        }}
                        formatter={(value, name) => {
                          const safe = (v) => v === null || v === undefined || !Number.isFinite(v) ? null : v;
                          if (name === 'globalLsRatio') {
                            const v = safe(value);
                            return [v === null ? '-' : `${v.toFixed(2)}x`, 'Global L/S'];
                          }
                          if (name === 'topLsRatio') {
                            const v = safe(value);
                            return [v === null ? '-' : `${v.toFixed(2)}x`, 'Whales L/S'];
                          }
                          if (name === 'openInterestUsd') {
                            const v = safe(value);
                            if (v === null) return ['-', 'Open Interest'];
                            const abs = Math.abs(v);
                            const label = abs >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : abs >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v.toFixed(0);
                            return [label, 'Open Interest'];
                          }
                          return [value, name];
                        }}
                      />
                      <Line yAxisId="oi" type="monotone" dataKey="openInterestUsd" stroke="#22c55e" strokeWidth={1} dot={false} strokeOpacity={0.7} />
                      <Line yAxisId="ratio" type="monotone" dataKey="globalLsRatio" stroke="#38bdf8" strokeWidth={1} dot={false} />
                      <Line yAxisId="ratio" type="monotone" dataKey="topLsRatio" stroke="#fb923c" strokeWidth={1} dot={false} />
                    </ComposedChart>
                  ) : (
                    // MEDIUM/LONG: Show only Funding
                    <ComposedChart data={analysisResult.data} syncId="btc-sync" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis yAxisId="funding" orientation="right" width={50} axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#64748b' }} domain={['auto', 'auto']} tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} />
                      <Tooltip
                        cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                        labelFormatter={() => ''}
                        contentStyle={{
                          background: 'rgba(15,23,42,0.9)',
                          borderRadius: 8,
                          border: '1px solid rgba(148,163,184,0.6)',
                          fontSize: '10px',
                          color: '#e2e8f0',
                        }}
                        formatter={(value, name) => {
                          const safe = (v) => v === null || v === undefined || !Number.isFinite(v) ? null : v;
                          if (name === 'fundingRate') {
                            const v = safe(value);
                            return [v === null ? '-' : `${(v * 100).toFixed(3)}%`, 'Funding Rate'];
                          }
                          return [value, name];
                        }}
                      />
                      <ReferenceLine yAxisId="funding" y={0} stroke="#64748b" strokeDasharray="3 3" />
                      <Bar yAxisId="funding" dataKey="fundingRate" barSize={2}>
                        {analysisResult.data.map((entry, index) => (
                          <Cell key={`fund-cell-${index}`} fill={entry.fundingRate > 0 ? '#ef4444' : '#22c55e'} fillOpacity={0.6} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Fear & Greed Z + GT Z */}
              <div className="h-1/3 w-full">
                <ResponsiveContainer>
                  <ComposedChart data={analysisResult.data} syncId="btc-sync" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis yAxisId="fng" orientation="right" width={50} axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#64748b' }} domain={['auto', 'auto']} />
                    <Tooltip
                      cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                      labelFormatter={() => ''}
                      contentStyle={{
                        background: 'rgba(15,23,42,0.9)',
                        borderRadius: 8,
                        border: '1px solid rgba(148,163,184,0.6)',
                        fontSize: '10px',
                        color: '#e2e8f0',
                      }}
                      formatter={(value, name) => {
                        const safe = value === null || value === undefined || !Number.isFinite(value) ? null : value;
                        let label = name;
                        if (name === 'fearGreedZ') label = 'F&G Z';
                        if (name === 'gtCompositeZ') label = 'GT Composite Z';
                        return [safe === null ? '-' : safe.toFixed(2), label];
                      }}
                    />
                    <ReferenceLine yAxisId="fng" y={0} stroke="#64748b" strokeDasharray="3 3" strokeOpacity={0.7} />
                    <ReferenceLine yAxisId="fng" y={2} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
                    <ReferenceLine yAxisId="fng" y={-2} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.3} />
                    <Line yAxisId="fng" type="monotone" dataKey="fearGreedZ" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeOpacity={0.9} name="F&G Z" />
                    <Line yAxisId="fng" type="monotone" dataKey="gtCompositeZ" stroke="#3b82f6" strokeWidth={1.2} dot={false} strokeOpacity={0.8} name="GT Composite Z" connectNulls={true} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* RIGHT COL: STATS & WIDGETS */}
          <div className="flex flex-col gap-4">
            <SignalCard tradeSetups={tradeSetups} score={score} />
            <BacktestCard stats={backtestStats} />

            {/* TRADE PLANS */}
            <div className="grid grid-cols-2 gap-2">
              <TradePlanCard
                setup={tradeSetups.long}
                type="long"
                isActive={tradeSetups.recommendation.includes('LONG')}
              />
              <TradePlanCard
                setup={tradeSetups.short}
                type="short"
                isActive={tradeSetups.recommendation.includes('SHORT')}
              />
            </div>

            <FundingWidget fundingRealTime={fundingRealTime} />
            <DerivativesWidget derivatives={analysisResult.derivatives} derivativesSentiment={derivativesSentiment} />
          </div>
        </div>
      </div>
    );
  };

  // Mount the application
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = ReactDOM.createRoot(rootEl);
    root.render(<App />);
  } else {
    console.error('No #root element found');
  }

})();