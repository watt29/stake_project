# -*- coding: utf-8 -*-
"""Analytics Engine for Stake Dice Bot
Queries stake_ledger.db to calculate performance metrics, risk, and capital requirements.
"""

import sqlite3
import os
from datetime import datetime

def get_db_path():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, "stake_ledger.db")

def load_analytics_data():
    db_path = get_db_path()
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # 1. Total statistics
    cur.execute("""
        SELECT 
            COUNT(*),
            ROUND(SUM(pnl), 5),
            ROUND(AVG(pnl), 5),
            ROUND(MIN(pnl), 5),
            ROUND(MAX(pnl), 5),
            SUM(CASE WHEN pnl >= 0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END)
        FROM sessions
    """)
    row = cur.fetchone()
    total_sessions = row[0] or 0
    total_pnl = float(row[1] or 0.0)
    avg_pnl = float(row[2] or 0.0)
    worst_pnl = float(row[3] or 0.0)
    best_pnl = float(row[4] or 0.0)
    wins = row[5] or 0
    losses = row[6] or 0
    win_rate = (wins / total_sessions * 100) if total_sessions > 0 else 0.0

    # 2. Daily breakdown
    cur.execute("""
        SELECT 
            date,
            total_sessions,
            total_profit,
            avg_profit,
            worst_drawdown,
            best_session,
            win_sessions,
            loss_sessions
        FROM v_daily_summary
        ORDER BY date ASC
    """)
    daily_records = []
    for r in cur.fetchall():
        daily_records.append({
            "date": r[0],
            "sessions": r[1],
            "profit": float(r[2]),
            "avg_profit": float(r[3]),
            "worst": float(r[4]),
            "best": float(r[5]),
            "wins": r[6],
            "losses": r[7],
            "win_rate": (r[6] / r[1] * 100) if r[1] > 0 else 0.0
        })

    # 3. Cumulative PnL Timeline
    cur.execute("""
        SELECT date, time, pnl, reason, session_id
        FROM sessions
        ORDER BY id ASC
    """)
    timeline = []
    running_total = 0.0
    hourly_profits = [0.0] * 24
    hourly_counts = [0] * 24

    for r in cur.fetchall():
        dt_str = f"{r[0]} {r[1]}"
        pnl = float(r[2])
        running_total += pnl
        timeline.append({
            "datetime": dt_str,
            "pnl": pnl,
            "cumulative": round(running_total, 5),
            "reason": r[3],
            "session_id": r[4]
        })

        try:
            hour = int(r[1].split(":")[0])
            if 0 <= hour < 24:
                hourly_profits[hour] += pnl
                hourly_counts[hour] += 1
        except Exception:
            pass

    conn.close()

    # 4. Martingale Ladder Simulation & Risk Matrix
    martingale_matrix = calculate_martingale_matrix()

    return {
        "summary": {
            "total_sessions": total_sessions,
            "total_pnl": round(total_pnl, 5),
            "avg_pnl": round(avg_pnl, 5),
            "worst_session": worst_pnl,
            "best_session": best_pnl,
            "wins": wins,
            "losses": losses,
            "win_rate": round(win_rate, 2)
        },
        "daily": daily_records,
        "timeline": timeline,
        "hourly": {
            "profits": [round(p, 4) for p in hourly_profits],
            "counts": hourly_counts
        },
        "martingale_matrix": martingale_matrix
    }

def calculate_martingale_matrix(base_bet=0.00015, win_chance=0.68,
                                 boost_chance=0.70, boost_from_step=7, max_steps=15):
    """บันได Martingale ตามพารามิเตอร์จริงของบอท (v2.4.25)

    ตัวคูณทบคิดจาก payout ของโอกาสชนะที่ใช้จริงของไม้นั้น:
        k = 1 + 1 / (99/chance - 1)
        68% → 3.1935x (+219.35%)   ·   70% → 3.4138x (+241.38%)
    จึงกู้คืนยอดที่เสียสะสมได้ 100% ทุกความลึก
    """
    steps = []
    cumulative = 0.0
    current_bet = base_bet
    loss_prob = 1.0

    for s in range(1, max_steps + 1):
        ch = boost_chance if s >= boost_from_step else win_chance
        cumulative += current_bet
        steps.append({
            "step": s,
            "chance": ch,
            "bet": round(current_bet, 5),
            "cumulative_cost": round(cumulative, 5),
            "prob_reach_pct": round(loss_prob * 100, 4),
            "prob_lose_streak_pct": round(loss_prob * (1.0 - ch) * 100, 6),
        })
        loss_prob *= (1.0 - ch)
        # k = 1 + 1/(3p) → ชนะติด 3 ไม้ (เดิมพันเท่าเดิม) คืนทุนทั้งก้อน
        nxt_ch = boost_chance if (s + 1) >= boost_from_step else win_chance
        p_next = 99.0 / (nxt_ch * 100.0) - 1.0
        current_bet = current_bet * (1.0 + 1.0 / (3.0 * p_next))

    return {
        "base_bet": base_bet,
        "win_chance": win_chance,
        "boost_chance": boost_chance,
        "boost_from_step": boost_from_step,
        "multiplier": round(1.0 + 1.0 / (3.0 * (99.0 / (win_chance * 100.0) - 1.0)), 5),
        "steps": steps,
        "safe_capital_10_steps": round(steps[9]["cumulative_cost"], 3),
        "safe_capital_12_steps": round(steps[11]["cumulative_cost"], 3),
        "safe_capital_15_steps": round(steps[14]["cumulative_cost"], 3),
    }

if __name__ == "__main__":
    data = load_analytics_data()
    print("Summary:", data["summary"])
    print("Days recorded:", len(data["daily"]))
    print("Safe capital for 12 steps (base 0.001):", data["martingale_matrix"]["safe_capital_12_steps"], "USDT")
