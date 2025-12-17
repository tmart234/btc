#!/usr/bin/env python3
"""
Global Liquidity Plotting - Demo with realistic sample data.
(Use original script locally with FRED API access for real data)
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

def generate_sample_data() -> pd.DataFrame:
    """Generate realistic sample global liquidity data based on historical patterns."""
    
    # Create monthly date range from 2000 to present
    dates = pd.date_range(start="2000-01-01", end="2024-11-30", freq="ME")
    n = len(dates)
    
    # Base growth trends with realistic patterns
    t = np.arange(n)
    
    # US M2 - started ~4.5T in 2000, ~21T in 2024 (billions)
    us_base = 4500 * np.exp(0.0055 * t)  # ~6.8% annual growth
    # Add COVID spike (around index 243 = March 2020)
    covid_idx = 243
    us_covid_bump = np.zeros(n)
    us_covid_bump[covid_idx:] = 4000 * (1 - np.exp(-0.1 * (t[covid_idx:] - covid_idx)))
    us_m2 = us_base + us_covid_bump + np.random.randn(n) * 100
    
    # Eurozone M2 - ~5T EUR in 2000, ~16T EUR in 2024 (billions EUR)
    ea_base = 5000 * np.exp(0.004 * t)
    ea_covid_bump = np.zeros(n)
    ea_covid_bump[covid_idx:] = 2000 * (1 - np.exp(-0.08 * (t[covid_idx:] - covid_idx)))
    ea_m2_eur = ea_base + ea_covid_bump + np.random.randn(n) * 80
    
    # China M2 - ~13T CNY in 2000, ~300T CNY in 2024 (billions CNY)
    cn_base = 13000 * np.exp(0.011 * t)  # ~14% annual growth
    cn_m2_cny = cn_base + np.random.randn(n) * 500
    
    # Japan M2 - ~630T JPY in 2000, ~1250T JPY in 2024 (billions JPY)
    jp_base = 630000 * np.exp(0.0025 * t)  # ~3% annual growth
    jp_m2_jpy = jp_base + np.random.randn(n) * 5000
    
    # FX rates with realistic patterns
    # EUR/USD: 0.92 in 2000, fluctuated 0.85-1.60, ~1.05 in 2024
    usd_per_eur = 0.92 + 0.15 * np.sin(t * 0.02) + 0.1 * np.sin(t * 0.05) + np.random.randn(n) * 0.02
    usd_per_eur = np.clip(usd_per_eur, 0.85, 1.60)
    
    # CNY/USD: 8.28 in 2000, ~7.2 in 2024
    cny_per_usd = 8.28 - 1.5 * (1 - np.exp(-0.015 * t)) + np.random.randn(n) * 0.1
    cny_per_usd = np.clip(cny_per_usd, 6.0, 8.3)
    
    # JPY/USD: 107 in 2000, ~150 in 2024
    jpy_per_usd = 107 + 0.15 * t + 15 * np.sin(t * 0.03) + np.random.randn(n) * 3
    jpy_per_usd = np.clip(jpy_per_usd, 75, 160)
    
    # Convert to USD
    us_m2_usd = us_m2
    ea_m2_usd = ea_m2_eur * usd_per_eur
    cn_m2_usd = cn_m2_cny / cny_per_usd
    jp_m2_usd = jp_m2_jpy / jpy_per_usd
    
    global_m2_usd = us_m2_usd + ea_m2_usd + cn_m2_usd + jp_m2_usd
    
    # Create DataFrame
    df = pd.DataFrame({
        "m2_us": us_m2,
        "m2_ea": ea_m2_eur,
        "m2_cn": cn_m2_cny,
        "m2_jp": jp_m2_jpy,
        "usd_per_eur": usd_per_eur,
        "cny_per_usd": cny_per_usd,
        "jpy_per_usd": jpy_per_usd,
        "us_m2_usd": us_m2_usd,
        "ea_m2_usd": ea_m2_usd,
        "cn_m2_usd": cn_m2_usd,
        "jp_m2_usd": jp_m2_usd,
        "global_m2_usd": global_m2_usd,
    }, index=dates)
    
    # YoY growth and acceleration
    df["global_m2_yoy"] = df["global_m2_usd"].pct_change(12) * 100.0
    df["global_m2_yoy_accel"] = df["global_m2_yoy"].diff(6)
    
    # Liquidity regime classification
    def classify_liquidity(row) -> str:
        yoy = row.get("global_m2_yoy")
        accel = row.get("global_m2_yoy_accel")
        if pd.isna(yoy):
            return "UNKNOWN"
        if yoy < 0:
            return "LIQ_BEAR"
        if yoy > 0 and not pd.isna(accel) and accel > 0:
            return "LIQ_BULL"
        return "LIQ_NEUTRAL"
    
    df["liquidity_regime"] = df.apply(classify_liquidity, axis=1)
    
    # Fed Net Liquidity (simplified model)
    # Balance sheet: ~700B in 2000, ~4.5T pre-COVID, ~9T peak, ~7T in 2024
    walcl_base = 700 + 15 * t
    walcl_qe = np.zeros(n)
    # QE1-3 (2008-2014)
    qe_start = 96  # ~2008
    walcl_qe[qe_start:] += 3000 * (1 - np.exp(-0.03 * (t[qe_start:] - qe_start)))
    # COVID QE
    walcl_qe[covid_idx:] += 4500 * (1 - np.exp(-0.08 * (t[covid_idx:] - covid_idx)))
    # QT 2022+
    qt_start = 270
    walcl_qe[qt_start:] -= 25 * (t[qt_start:] - qt_start)
    walcl = walcl_base + walcl_qe
    walcl = np.clip(walcl, 700, 9000)
    
    # TGA: typically 200-400B, spiked to 1.8T in 2020
    tga = 300 + np.random.randn(n) * 50
    tga[covid_idx:covid_idx+12] += 1200  # COVID spike
    tga = np.clip(tga, 50, 1800)
    
    # RRP: near zero until 2021, then up to 2.5T
    rrp = np.zeros(n)
    rrp_start = 255  # ~2021
    rrp[rrp_start:] = 2000 * (1 - np.exp(-0.1 * (t[rrp_start:] - rrp_start)))
    rrp[280:] -= 15 * (t[280:] - 280)  # Declining since 2023
    rrp = np.clip(rrp, 0, 2500)
    
    df["walcl"] = walcl
    df["tga"] = tga
    df["rrp"] = rrp
    df["net_liquidity"] = walcl - tga - rrp
    df["net_liquidity_4w_roc"] = df["net_liquidity"].pct_change(1) * 100.0
    
    return df


def plot_liquidity_data(df: pd.DataFrame):
    """Create comprehensive plots of the liquidity data."""
    
    fig, axes = plt.subplots(4, 1, figsize=(14, 16))
    fig.suptitle("Global Liquidity Dashboard", fontsize=16, fontweight="bold", y=0.98)
    
    colors = {
        "us": "#1f77b4",
        "ea": "#ff7f0e", 
        "cn": "#d62728",
        "jp": "#9467bd",
        "total": "#2ca02c",
        "net_liq": "#8c564b"
    }
    
    # --- Plot 1: Global M2 Components (Stacked Area) ---
    ax1 = axes[0]
    ax1.stackplot(
        df.index,
        df["us_m2_usd"] / 1e3,
        df["ea_m2_usd"] / 1e3,
        df["cn_m2_usd"] / 1e3,
        df["jp_m2_usd"] / 1e3,
        labels=["US M2", "Eurozone M2", "China M2", "Japan M2"],
        colors=[colors["us"], colors["ea"], colors["cn"], colors["jp"]],
        alpha=0.8
    )
    ax1.set_ylabel("M2 (Trillions USD)", fontsize=11)
    ax1.set_title("Global M2 Money Supply by Region", fontsize=12, fontweight="bold")
    ax1.legend(loc="upper left", fontsize=9)
    ax1.grid(True, alpha=0.3)
    ax1.set_xlim(df.index.min(), df.index.max())
    
    # --- Plot 2: Global M2 Total ---
    ax2 = axes[1]
    ax2.plot(df.index, df["global_m2_usd"] / 1e3, color=colors["total"], linewidth=2)
    ax2.fill_between(df.index, 0, df["global_m2_usd"] / 1e3, alpha=0.3, color=colors["total"])
    ax2.set_ylabel("M2 (Trillions USD)", fontsize=11)
    ax2.set_title("Total Global M2", fontsize=12, fontweight="bold")
    ax2.grid(True, alpha=0.3)
    ax2.set_xlim(df.index.min(), df.index.max())
    
    latest_m2 = df["global_m2_usd"].dropna().iloc[-1] / 1e3
    latest_date = df["global_m2_usd"].dropna().index[-1]
    ax2.annotate(
        f"${latest_m2:.1f}T",
        xy=(latest_date, latest_m2),
        xytext=(10, 0),
        textcoords="offset points",
        fontsize=10,
        fontweight="bold",
        color=colors["total"]
    )
    
    # --- Plot 3: YoY Growth with Regime Coloring ---
    ax3 = axes[2]
    yoy_data = df["global_m2_yoy"].dropna()
    
    regime_colors = {"LIQ_BULL": "#90EE90", "LIQ_NEUTRAL": "#FFFACD", "LIQ_BEAR": "#FFB6C1", "UNKNOWN": "#D3D3D3"}
    
    prev_regime = None
    start_idx = None
    for i, (idx, row) in enumerate(df.iterrows()):
        regime = row["liquidity_regime"]
        if regime != prev_regime:
            if prev_regime is not None and start_idx is not None:
                ax3.axvspan(start_idx, idx, alpha=0.3, color=regime_colors.get(prev_regime, "#D3D3D3"))
            start_idx = idx
            prev_regime = regime
    if start_idx is not None:
        ax3.axvspan(start_idx, df.index[-1], alpha=0.3, color=regime_colors.get(prev_regime, "#D3D3D3"))
    
    ax3.plot(yoy_data.index, yoy_data, color="black", linewidth=1.5)
    ax3.axhline(y=0, color="red", linestyle="--", linewidth=1, alpha=0.7)
    ax3.set_ylabel("YoY Growth (%)", fontsize=11)
    ax3.set_title("Global M2 Year-over-Year Growth (Green=Bull, Yellow=Neutral, Red=Bear)", 
                  fontsize=12, fontweight="bold")
    ax3.grid(True, alpha=0.3)
    ax3.set_xlim(df.index.min(), df.index.max())
    
    # --- Plot 4: Fed Net Liquidity ---
    ax4 = axes[3]
    net_liq = df["net_liquidity"].dropna()
    ax4.plot(net_liq.index, net_liq / 1e3, color=colors["net_liq"], linewidth=2, label="Fed Net Liquidity")
    ax4.fill_between(net_liq.index, 0, net_liq / 1e3, alpha=0.3, color=colors["net_liq"])
    
    latest_net = net_liq.iloc[-1] / 1e3
    latest_net_date = net_liq.index[-1]
    ax4.annotate(
        f"${latest_net:.2f}T",
        xy=(latest_net_date, latest_net),
        xytext=(10, 0),
        textcoords="offset points",
        fontsize=10,
        fontweight="bold",
        color=colors["net_liq"]
    )
    
    ax4.set_ylabel("Net Liquidity (Trillions USD)", fontsize=11)
    ax4.set_xlabel("Date", fontsize=11)
    ax4.set_title("Fed Net Liquidity (Balance Sheet - TGA - RRP)", fontsize=12, fontweight="bold")
    ax4.grid(True, alpha=0.3)
    ax4.set_xlim(df.index.min(), df.index.max())
    
    for ax in axes:
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
        ax.xaxis.set_major_locator(mdates.YearLocator(2))
    
    plt.tight_layout()
    plt.savefig("C:/Users/tmart/OneDrive/Documents/GitHub/btc/global_liquidity_chart.png", dpi=150, bbox_inches="tight")
    print("Saved chart")
    plt.close()


def main():
    print("Generating realistic sample global liquidity data...")
    print("(Note: Run original script locally with FRED API for real data)\n")
    
    df = generate_sample_data()
    
    print(f"Data summary: {len(df)} monthly observations")
    print(f"Date range: {df.index.min().strftime('%Y-%m-%d')} to {df.index.max().strftime('%Y-%m-%d')}")
    
    print(f"\nLatest Global M2: ${df['global_m2_usd'].iloc[-1]/1e3:.2f} Trillion USD")
    print(f"Latest YoY Growth: {df['global_m2_yoy'].iloc[-1]:.2f}%")
    print(f"Current Regime: {df['liquidity_regime'].iloc[-1]}")
    print(f"Fed Net Liquidity: ${df['net_liquidity'].iloc[-1]/1e3:.2f} Trillion USD")
    
    print("\nGenerating plots...")
    plot_liquidity_data(df)


if __name__ == "__main__":
    main()