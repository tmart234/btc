/**
 * Bitcoin AI Analyst - React Components
 * UI components, icons, and chart elements
 */
(function() {
  'use strict';

  const React = window.React;
  const { useState, useEffect } = React;
  
  window.BTC = window.BTC || {};
  const { utils } = window.BTC;

  // Get Recharts components
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
    console.error('Recharts global is missing.');
    const Stub = ({ children }) => (
      <div style={{
        padding: 8,
        fontSize: 12,
        color: '#f87171',
        border: '1px dashed #f87171',
      }}>
        Recharts failed to load. Charts disabled.
        {children}
      </div>
    );
    Line = LineChart = XAxis = YAxis = CartesianGrid = Tooltip =
      ResponsiveContainer = ReferenceLine = ReferenceArea =
        ComposedChart = Bar = BarChart = Label = Cell = Stub;
  }

  // ============================================
  // ICONS
  // ============================================

  const Icon = ({ children, className = '' }) => (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </span>
  );

  const icons = {
    Activity:      (props) => <Icon {...props}>📈</Icon>,
    ArrowUp:       (props) => <Icon {...props}>⬆️</Icon>,
    ArrowDown:     (props) => <Icon {...props}>⬇️</Icon>,
    RefreshCw:     (props) => <Icon {...props}>🔄</Icon>,
    AlignLeft:     (props) => <Icon {...props}>≡</Icon>,
    BarChart2:     (props) => <Icon {...props}>📊</Icon>,
    TrendingUp:    (props) => <Icon {...props}>📈</Icon>,
    TrendingDown:  (props) => <Icon {...props}>📉</Icon>,
    History:       (props) => <Icon {...props}>🕒</Icon>,
    Layers:        (props) => <Icon {...props}>🧱</Icon>,
    Zap:           (props) => <Icon {...props}>⚡</Icon>,
    Gauge:         (props) => <Icon {...props}>🧭</Icon>,
    BrainCircuit:  (props) => <Icon {...props}>🧠</Icon>,
    AlertTriangle: (props) => <Icon {...props}>⚠️</Icon>,
    Users:         (props) => <Icon {...props}>👥</Icon>,
    DollarSign:    (props) => <Icon {...props}>💲</Icon>,
    Target:        (props) => <Icon {...props}>🎯</Icon>,
    WifiOff:       (props) => <Icon {...props}>📵</Icon>,
    Timer:         (props) => <Icon {...props}>⏱️</Icon>,
    Clock:         (props) => <Icon {...props}>🕒</Icon>,
    Percent:       (props) => <Icon {...props}>%</Icon>,
  };

  // ============================================
  // CHART TOOLTIP
  // ============================================

  const MainChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    const seen = new Set();
    const rows = [];
    const allowedKeys = new Set(['close', 'trendUpper', 'trendLower', 'emaLine', 'formationRes', 'formationSup']);

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
        formationRes: 'Resistance Line',
        formationSup: 'Support Line',
      };
      return map[key] || key;
    };

    const formatValue = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return value;
      const abs = Math.abs(value);
      if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
      if (abs >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
            <span className="text-slate-400">{displayName(item.dataKey)}</span>
            <span className="font-mono text-slate-50">{formatValue(item.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ============================================
  // RATIO BAR COMPONENT
  // ============================================

  const RatioBar = ({ longPct, shortPct, label, subLabel }) => {
    const l = (longPct * 100).toFixed(0);
    const s = (shortPct * 100).toFixed(0);
    return (
      <div className="w-full mb-3">
        <div className="flex justify-between text-[10px] mb-1 text-slate-400 uppercase font-bold tracking-wider">
          <span>{label}</span>
          <span>{subLabel}</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800 flex">
          <div
            style={{ width: `${l}%` }}
            className="bg-emerald-500 flex items-center justify-start pl-1 transition-all duration-500"
          />
          <div
            style={{ width: `${s}%` }}
            className="bg-rose-500 flex items-center justify-end pr-1 transition-all duration-500"
          />
        </div>
        <div className="flex justify-between text-[10px] mt-0.5 font-mono text-slate-500">
          <span>{l}% L</span>
          <span>{s}% S</span>
        </div>
      </div>
    );
  };

  // ============================================
  // STATUS CHIP COMPONENT
  // ============================================

  const StatusChip = ({ icon: IconComponent, label, value, variant = 'default', className = '' }) => {
    const variantClasses = {
      default: 'bg-slate-100 text-slate-600',
      bullish: 'bg-emerald-100 text-emerald-700',
      bearish: 'bg-rose-100 text-rose-700',
      warning: 'bg-amber-100 text-amber-700',
      info: 'bg-indigo-100 text-indigo-700',
    };

    return (
      <span className={`px-2 py-1 rounded flex items-center gap-1 ${variantClasses[variant]} ${className}`}>
        {IconComponent && <IconComponent className="w-3 h-3" />}
        {label && <span className="uppercase text-[9px] tracking-widest">{label}</span>}
        {value && <span className="font-mono">{value}</span>}
      </span>
    );
  };

  // ============================================
  // TIMEFRAME SELECTOR
  // ============================================

  const TimeframeSelector = ({ timeframe, onChange }) => {
    return (
      <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
        {['short', 'medium', 'long'].map(t => (
          <button
            key={t}
            onClick={() => onChange(t)}
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
    );
  };

  // ============================================
  // SIGNAL CARD
  // ============================================

  const SignalCard = ({ tradeSetups, score }) => {
    const recommendation = tradeSetups.recommendation;
    const isWait = recommendation.includes('WAIT');
    const isLong = recommendation.includes('LONG');
    
    return (
      <div
        className={`p-5 rounded-xl border-l-4 shadow-sm bg-white ${
          isWait ? 'border-slate-300' :
          isLong ? 'border-green-500' : 'border-red-500'
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
            isLong ? 'text-green-600' :
            !isWait ? 'text-red-600' : 'text-slate-700'
          }`}
        >
          {recommendation}
        </div>
      </div>
    );
  };

  // ============================================
  // TRADE PLAN CARD
  // ============================================

  const TradePlanCard = ({ setup, type, isActive }) => {
    const isLong = type === 'long';
    
    return (
      <div
        className={`p-2 rounded border ${
          isActive
            ? (isLong ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')
            : 'bg-slate-50 border-slate-100 opacity-60'
        }`}
      >
        <div className={`text-[9px] font-black uppercase mb-1 ${isLong ? 'text-green-700' : 'text-red-700'}`}>
          {type} (RR {setup.rr.toFixed(1)})
        </div>
        <div className="text-[10px] font-mono text-slate-600">
          <div className="flex justify-between">
            <span>E</span>
            <span>${Math.round(setup.entry).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-red-500">
            <span>S</span>
            <span>${Math.round(setup.stop).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>T</span>
            <span>${Math.round(setup.target).toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // BACKTEST CARD
  // ============================================

  const BacktestCard = ({ stats }) => {
    return (
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-2">
          <h4 className="font-bold text-xs uppercase tracking-widest text-slate-500">
            Backtest (Historical)
          </h4>
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              stats.reliability === 'HIGH'
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {stats.reliability}
          </span>
        </div>
        <div className="flex justify-between text-center mb-3">
          <div>
            <div className="text-[9px] text-slate-400 uppercase">Win Rate</div>
            <div className="font-mono font-bold text-sm">{stats.winRate.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-[9px] text-slate-400 uppercase">PF</div>
            <div className="font-mono font-bold text-sm">{stats.profitFactor.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] text-slate-400 uppercase">Kelly</div>
            <div className="font-mono font-bold text-sm text-indigo-600">{stats.kelly.toFixed(0)}%</div>
          </div>
        </div>
        <div className="h-10 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.equityCurve}>
              <Line type="monotone" dataKey="equity" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[9px] text-slate-400 mt-1 text-center">
          Equity Curve ({stats.total} Trades)
        </div>
      </div>
    );
  };

  // ============================================
  // FUNDING WIDGET
  // ============================================

  const FundingWidget = ({ fundingRealTime }) => {
    return (
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg border border-slate-800 mt-auto">
        <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
          <h4 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2 text-yellow-300">
            <icons.Percent className="w-3 h-3"/> Funding Analytics
          </h4>
          {fundingRealTime && (
            <span className="text-[10px] text-slate-400 font-mono">
              {utils.getCountDown(fundingRealTime.nextTime)}
            </span>
          )}
        </div>
        {fundingRealTime ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Predicted</div>
              <div
                className={`text-lg font-mono font-bold ${
                  fundingRealTime.rate > 0.0001
                    ? 'text-red-400'
                    : fundingRealTime.rate < 0
                      ? 'text-green-400'
                      : 'text-white'
                }`}
              >
                {utils.formatPercent(fundingRealTime.rate)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase">Annualized</div>
              <div className="text-lg font-mono font-bold text-yellow-400">
                {utils.formatPercent(fundingRealTime.annualized)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 text-center py-2">
            Loading Funding Data...
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // DERIVATIVES WIDGET
  // ============================================

  const DerivativesWidget = ({ derivatives, derivativesSentiment }) => {
    if (!derivatives) {
      return (
        <div className="p-4 bg-slate-100 rounded-xl text-center text-xs text-slate-400 border border-slate-200 border-dashed flex items-center justify-center gap-2">
          <icons.WifiOff className="w-4 h-4" /> Loading Derivatives...
        </div>
      );
    }

    return (
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
                  : derivativesSentiment.includes('Bearish') || derivativesSentiment.includes('Overcrowded')
                    ? 'text-rose-400'
                    : 'text-slate-200'
              }`}
            >
              {derivativesSentiment.includes('Bullish') 
                ? <icons.TrendingUp size={14}/> 
                : <icons.TrendingDown size={14}/>
              }
              {derivativesSentiment}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
              Global L/S Ratio
            </div>
            <div className="text-lg font-mono font-bold">
              {derivatives.binanceGlobal.ratio.toFixed(2)}x
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <RatioBar
            longPct={derivatives.binanceGlobal.longPct}
            shortPct={derivatives.binanceGlobal.shortPct}
            label="Retail Accounts"
            subLabel="Global Sentiment"
          />
          <RatioBar
            longPct={derivatives.binanceTop.positions.longPct}
            shortPct={derivatives.binanceTop.positions.shortPct}
            label="Whale Positions"
            subLabel="Smart Money Top 20%"
          />
        </div>
      </div>
    );
  };

  // Export to namespace
  window.BTC.components = {
    icons,
    recharts: {
      Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, 
      ResponsiveContainer, ReferenceLine, ReferenceArea, 
      ComposedChart, Bar, BarChart, Label, Cell
    },
    MainChartTooltip,
    RatioBar,
    StatusChip,
    TimeframeSelector,
    SignalCard,
    TradePlanCard,
    BacktestCard,
    FundingWidget,
    DerivativesWidget,
  };

})();