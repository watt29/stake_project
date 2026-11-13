# -*- coding: utf-8 -*-
"""Chart Generator for Stake Dice Analyst
Generates dark-themed high-res analytics charts using Matplotlib.
"""

import os
import matplotlib
matplotlib.use("Agg") # Non-interactive backend
import matplotlib.pyplot as plt

# Support Windows fonts with Thai and Unicode characters
matplotlib.rcParams['font.sans-serif'] = ['Segoe UI', 'Tahoma', 'Arial', 'DejaVu Sans']
matplotlib.rcParams['axes.unicode_minus'] = False

def generate_portfolio_charts(analytics_data, output_path):
    timeline = analytics_data["timeline"]
    daily = analytics_data["daily"]
    hourly = analytics_data["hourly"]

    if not timeline:
        return None

    # Theme colors (Stake Dark Palette)
    BG_COLOR = "#0f212e"
    PANEL_COLOR = "#1a2c38"
    TEXT_COLOR = "#b1bad3"
    ACCENT_GREEN = "#00e676"
    ACCENT_CYAN = "#00e5ff"
    ACCENT_RED = "#ff5252"
    GRID_COLOR = "#213743"

    plt.style.use("dark_background")
    fig = plt.figure(figsize=(14, 9), facecolor=BG_COLOR)

    # Grid: 2 rows (Top: 1 big cumulative plot; Bottom: 2 side-by-side plots)
    gs = fig.add_gridspec(2, 2, height_ratios=[1.3, 1], hspace=0.32, wspace=0.22)

    # -------------------------------------------------------------
    # 1. TOP: Cumulative Profit Growth Curve
    # -------------------------------------------------------------
    ax1 = fig.add_subplot(gs[0, :])
    ax1.set_facecolor(PANEL_COLOR)

    session_indices = list(range(1, len(timeline) + 1))
    cumulative_pnl = [pt["cumulative"] for pt in timeline]

    ax1.plot(session_indices, cumulative_pnl, color=ACCENT_GREEN, linewidth=2.5, label="Cumulative Net Profit (USDT)")
    ax1.fill_between(session_indices, cumulative_pnl, 0, color=ACCENT_GREEN, alpha=0.15)

    final_profit = cumulative_pnl[-1]
    ax1.scatter([session_indices[-1]], [final_profit], color="#ffffff", s=60, zorder=5)
    ax1.annotate(
        f" Current: +{final_profit:,.2f} USDT",
        xy=(session_indices[-1], final_profit),
        xytext=(-150, 15),
        textcoords="offset points",
        color="#ffffff",
        fontweight="bold",
        fontsize=11,
        bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_COLOR, ec=ACCENT_GREEN, lw=1.5),
        arrowprops=dict(arrowstyle="->", color=ACCENT_GREEN, lw=1.5)
    )

    ax1.set_title("Cumulative Profit Growth Curve (USDT) — 250+ Sessions", fontsize=14, fontweight="bold", color="#ffffff", pad=12)
    ax1.set_xlabel("Sessions Played", color=TEXT_COLOR, fontsize=10)
    ax1.set_ylabel("Cumulative Profit (USDT)", color=TEXT_COLOR, fontsize=10)
    ax1.grid(True, linestyle="--", alpha=0.4, color=GRID_COLOR)
    ax1.tick_params(colors=TEXT_COLOR)

    # -------------------------------------------------------------
    # 2. BOTTOM LEFT: Daily Profit Breakdown
    # -------------------------------------------------------------
    ax2 = fig.add_subplot(gs[1, 0])
    ax2.set_facecolor(PANEL_COLOR)

    dates = [d["date"][-5:] for d in daily] # MM-DD
    profits = [d["profit"] for d in daily]
    bar_colors = [ACCENT_GREEN if p >= 0 else ACCENT_RED for p in profits]

    bars = ax2.bar(dates, profits, color=bar_colors, width=0.55, edgecolor="#ffffff", linewidth=0.5)
    for bar, p in zip(bars, profits):
        y_pos = bar.get_height()
        va = "bottom" if p >= 0 else "top"
        p_txt = f"+{p:.1f}" if p >= 0 else f"{p:.1f}"
        ax2.annotate(p_txt, xy=(bar.get_x() + bar.get_width() / 2, y_pos),
                     xytext=(0, 3 if p >= 0 else -12), textcoords="offset points",
                     ha="center", va=va, fontsize=9, color="#ffffff", fontweight="bold")

    ax2.set_title("Daily Net Profit (USDT)", fontsize=12, fontweight="bold", color="#ffffff", pad=10)
    ax2.set_ylabel("Profit (USDT)", color=TEXT_COLOR, fontsize=10)
    ax2.grid(True, linestyle="--", alpha=0.3, color=GRID_COLOR, axis="y")
    ax2.tick_params(colors=TEXT_COLOR)

    # -------------------------------------------------------------
    # 3. BOTTOM RIGHT: Hourly Profit Heat Distribution (24H)
    # -------------------------------------------------------------
    ax3 = fig.add_subplot(gs[1, 1])
    ax3.set_facecolor(PANEL_COLOR)

    hours = list(range(24))
    h_profits = hourly["profits"]
    h_colors = [ACCENT_CYAN if p >= 0 else ACCENT_RED for p in h_profits]

    ax3.bar(hours, h_profits, color=h_colors, width=0.7, alpha=0.85)
    ax3.set_title("Hourly Profit Performance (00-23)", fontsize=12, fontweight="bold", color="#ffffff", pad=10)
    ax3.set_xlabel("Hour of Day (00 - 23)", color=TEXT_COLOR, fontsize=10)
    ax3.set_ylabel("Total Profit (USDT)", color=TEXT_COLOR, fontsize=10)
    ax3.set_xticks(range(0, 24, 2))
    ax3.grid(True, linestyle="--", alpha=0.3, color=GRID_COLOR, axis="y")
    ax3.tick_params(colors=TEXT_COLOR)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    plt.savefig(output_path, dpi=180, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close()
    return output_path

if __name__ == "__main__":
    from analytics import load_analytics_data
    d = load_analytics_data()
    out = os.path.join(os.path.dirname(__file__), "reports", "pnl_chart.png")
    generate_portfolio_charts(d, out)
    print("Generated chart at:", out)
