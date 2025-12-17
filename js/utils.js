/**
 * Bitcoin AI Analyst - Utilities
 * Math functions, formatting helpers, and general utilities
 */
(function() {
  'use strict';

  window.BTC = window.BTC || {};

  // ============================================
  // FORMATTING UTILITIES
  // ============================================

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

  // ============================================
  // STATISTICAL UTILITIES
  // ============================================

  const calculateMean = (data) => {
    const clean = data.filter(
      (v) => v !== null && v !== undefined && Number.isFinite(v)
    );
    if (!clean.length) return 0;
    return clean.reduce((a, b) => a + b, 0) / clean.length;
  };

  const calculateStdDev = (data, mean) => {
    const clean = data.filter(
      (v) => v !== null && v !== undefined && Number.isFinite(v)
    );
    if (clean.length < 2) return 0;
    const squareDiffs = clean.map((value) => {
      const diff = value - mean;
      return diff * diff;
    });
    const avgSquareDiff = calculateMean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  };

  const calculateRollingZScore = (dataArray, windowSize = 180) => {
    const len = dataArray.length;
    const zScores = new Array(len).fill(null);
    const minPeriods = Math.max(30, Math.floor(windowSize / 6));

    for (let i = 0; i < len; i++) {
      const val = dataArray[i];
      if (val === null || val === undefined || !Number.isFinite(val)) {
        zScores[i] = null;
        continue;
      }

      const start = Math.max(0, i - windowSize + 1);
      const slice = [];
      for (let j = start; j <= i; j++) {
        const v = dataArray[j];
        if (v !== null && v !== undefined && Number.isFinite(v)) {
          slice.push(v);
        }
      }

      if (slice.length < minPeriods) {
        zScores[i] = null;
        continue;
      }

      const mean = calculateMean(slice);
      const std = calculateStdDev(slice, mean);
      zScores[i] = std === 0 ? 0 : (val - mean) / std;
    }

    return zScores;
  };

  // ============================================
  // REGRESSION UTILITIES
  // ============================================

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
    
    for (let i = 0; i < indices.length; i++) {
      const pred = p1.slope * indices[i] + p1.intercept;
      if (Math.abs(logPrices[i] - pred) < 1.5 * s1) {
        fX.push(indices[i]);
        fY.push(logPrices[i]);
      }
    }
    
    if (fX.length < indices.length * 0.5) {
      return { slope: p1.slope, intercept: p1.intercept, sigma: s1, rSquared: p1.rSquared };
    }
    
    const p2 = linearRegression(fX, fY);
    const s2 = calculateSigma(fX, fY, p2.slope, p2.intercept);
    return { slope: p2.slope, intercept: p2.intercept, sigma: s2, rSquared: p2.rSquared };
  };

  // ============================================
  // DISTRIBUTION ANALYSIS
  // ============================================

  const computeDistributionStats = (values, latest) => {
    const clean = values.filter(
      v => v !== null && v !== undefined && Number.isFinite(v)
    );
    if (!clean.length || !Number.isFinite(latest)) return null;

    const sorted = [...clean].sort((a, b) => a - b);
    const n = sorted.length;

    let idx = sorted.findIndex(v => v >= latest);
    if (idx === -1) idx = n - 1;

    const percentile = (idx / (n - 1 || 1)) * 100;
    const mean = clean.reduce((a, b) => a + b, 0) / n;
    const variance = clean.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    const stdev = Math.sqrt(variance);
    const zScore = stdev > 0 ? (latest - mean) / stdev : 0;

    return {
      latest,
      percentile,
      mean,
      stdev,
      zScore,
      min: sorted[0],
      max: sorted[n - 1],
    };
  };

  const classifyFundingExtreme = (stats) => {
    if (!stats) return { label: 'Normal', side: null };
    const { latest, percentile } = stats;

    if (percentile >= 97) return { label: 'Extreme Long Crowding', side: 'long' };
    if (percentile >= 90) return { label: 'High Long Bias', side: 'long' };
    if (percentile <= 3) return { label: 'Extreme Short Crowding', side: 'short' };
    if (percentile <= 10) return { label: 'High Short Bias', side: 'short' };
    if (latest < 0) return { label: 'Negative Funding', side: 'short' };

    return { label: 'Normal', side: null };
  };

  const classifyOpenInterestFlow = (priceChange, oiChangePct, changeStats) => {
    if (!Number.isFinite(priceChange) || !Number.isFinite(oiChangePct)) {
      return 'Neutral';
    }

    const upPrice = priceChange > 0;
    const upOi = oiChangePct > 0;
    const magPct = changeStats?.percentile ?? 0;
    const isExtreme = magPct >= 90;
    const isStrong = magPct >= 70;

    if (upPrice && upOi) {
      if (isExtreme) return 'New Longs (Trend Growing)';
      if (isStrong) return 'Long Build-up';
      return 'Mild Long Add';
    }

    if (upPrice && !upOi) {
      if (isExtreme) return 'Short Squeeze / Deleveraging Up';
      return 'Up on Position Reduction';
    }

    if (!upPrice && upOi) {
      if (isExtreme) return 'Aggressive Shorting';
      return 'Shorts Adding';
    }

    if (!upPrice && !upOi) {
      if (isExtreme) return 'Long Liquidation / Deleveraging';
      return 'Down on Deleveraging';
    }

    return 'Neutral';
  };

  // Export to namespace
  window.BTC.utils = {
    smartRound,
    formatPercent,
    getCountDown,
    calculateMean,
    calculateStdDev,
    calculateRollingZScore,
    linearRegression,
    calculateSigma,
    calculateRobustTrend,
    computeDistributionStats,
    classifyFundingExtreme,
    classifyOpenInterestFlow
  };

})();
