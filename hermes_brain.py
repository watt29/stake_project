import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd

# Force UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

HISTORY_FILE = "dice_history.csv"
SKILLS_FILE = "ai_skills.json"
MEMORY_FILE = "MARKET_MEMORY.md"

DEFAULT_SKILLS = {
    "isolated_wins_threshold": 18,
    "loss_streak_threshold": 5,
    "sawtooth_length": 6,
    "loss_streak_escape_wins": 2,
    "loss_streak_mid_step": 8,
    "loss_streak_mid_threshold": 3,
    "loss_streak_mid_escape_wins": 3,
    "loss_streak_high_step": 14,
    "loss_streak_high_threshold": 1,
    "loss_streak_high_escape_wins": 3,
    "loss_streak_high_min_virtual_rolls": 8,
    "hard_virtual_step": 0,
    "hard_virtual_escape_wins": 4,
    "hard_virtual_min_rolls": 20,
}


def clamp(value, low, high):
    return max(low, min(int(value), high))


def atomic_write_json(path, data):
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp_path, path)


def loss_streak_lengths(results):
    if results.empty:
        return pd.Series(dtype=int)
    groups = (results != results.shift()).cumsum()
    streak_df = results.groupby(groups).agg(value="first", length="size")
    return streak_df[streak_df["value"] == "LOSS"]["length"]


def ww_gaps(results):
    if len(results) < 2:
        return pd.Series(dtype=int)
    ww_mask = (results == "WIN") & (results.shift(-1) == "WIN")
    ww_indices = pd.Series(results.index[ww_mask])
    if len(ww_indices) <= 1:
        return pd.Series(dtype=int)
    return (ww_indices.diff().dropna() - 2).clip(lower=0)


def classify_risk(recent_real):
    if recent_real.empty:
        return "NORMAL"
    recent_max_step = int(recent_real["step"].max())
    recent_loss_streaks = loss_streak_lengths(recent_real["result"])
    recent_max_loss = int(recent_loss_streaks.max()) if not recent_loss_streaks.empty else 0

    if recent_max_step >= 20 or recent_max_loss >= 8:
        return "CRISIS"
    if recent_max_step >= 14 or recent_max_loss >= 6:
        return "DANGER"
    if recent_max_step >= 10 or recent_max_loss >= 5:
        return "ELEVATED"
    return "NORMAL"


def build_skills(real_df, all_df):
    recent_real = real_df.tail(1500).copy()
    recent_all = all_df.tail(2000).copy()

    global_gaps = ww_gaps(real_df["result"])
    recent_gaps = ww_gaps(recent_real["result"])
    gap_source = recent_gaps if len(recent_gaps) >= 20 else global_gaps
    if gap_source.empty:
        isolated_wins = DEFAULT_SKILLS["isolated_wins_threshold"]
        max_gap = 0
    else:
        isolated_wins = clamp(np.ceil(gap_source.quantile(0.95)), 12, 24)
        max_gap = int(gap_source.max())

    global_losses = loss_streak_lengths(real_df["result"])
    recent_losses = loss_streak_lengths(recent_real["result"])
    loss_source = recent_losses if len(recent_losses) >= 20 else global_losses
    p95_loss = int(np.ceil(loss_source.quantile(0.95))) if not loss_source.empty else 5
    max_recent_step = int(recent_real["step"].max()) if not recent_real.empty else 0
    max_recent_loss = int(recent_losses.max()) if not recent_losses.empty else 0
    risk_mode = classify_risk(recent_real)

    skills = DEFAULT_SKILLS.copy()
    skills["isolated_wins_threshold"] = isolated_wins

    # Low steps stay close to the user's rule. In a crisis, enter virtual mode one loss earlier.
    skills["loss_streak_threshold"] = 4 if risk_mode == "CRISIS" else 5

    if risk_mode == "NORMAL":
        skills["hard_virtual_step"] = 0
        skills["loss_streak_mid_threshold"] = 3
        skills["loss_streak_mid_escape_wins"] = 3
        skills["loss_streak_high_escape_wins"] = 3
        skills["loss_streak_high_min_virtual_rolls"] = 8
    elif risk_mode == "ELEVATED":
        skills["hard_virtual_step"] = 18
        skills["loss_streak_mid_threshold"] = 3
        skills["loss_streak_mid_escape_wins"] = 3
        skills["loss_streak_high_escape_wins"] = 3
        skills["loss_streak_high_min_virtual_rolls"] = 10
    elif risk_mode == "DANGER":
        skills["hard_virtual_step"] = 16
        skills["loss_streak_mid_threshold"] = 2
        skills["loss_streak_mid_escape_wins"] = 3
        skills["loss_streak_high_escape_wins"] = 4
        skills["loss_streak_high_min_virtual_rolls"] = 12
    else:
        skills["hard_virtual_step"] = 14
        skills["loss_streak_mid_threshold"] = 2
        skills["loss_streak_mid_escape_wins"] = 4
        skills["loss_streak_high_escape_wins"] = 4
        skills["loss_streak_high_min_virtual_rolls"] = 16

    virtual_counts = recent_all["mode"].value_counts().to_dict() if not recent_all.empty else {}
    return skills, {
        "risk_mode": risk_mode,
        "p95_loss": p95_loss,
        "max_recent_loss": max_recent_loss,
        "max_recent_step": max_recent_step,
        "isolated_wins": isolated_wins,
        "max_gap": max_gap,
        "virtual_counts": virtual_counts,
        "recent_real_count": len(recent_real),
        "total_real_count": len(real_df),
    }


def analyze_and_learn():
    print("[Hermes AI Brain] Starting risk-management loop...")

    if not os.path.exists(HISTORY_FILE):
        print(f"Error: {HISTORY_FILE} not found.")
        return 1

    try:
        df = pd.read_csv(
            HISTORY_FILE,
            header=None,
            low_memory=False,
            names=[
                "timestamp",
                "mode",
                "step",
                "bet",
                "target",
                "condition",
                "payout",
                "profit",
                "result",
                "streak_count",
                "streak_type",
            ],
        )
    except Exception as e:
        print(f"Error reading data: {e}")
        return 1

    df["step"] = pd.to_numeric(df["step"], errors="coerce").fillna(0).astype(int)
    df["result"] = df["result"].astype(str).str.upper()
    df["mode"] = df["mode"].astype(str)

    real_df = df[df["mode"].str.contains("REAL", na=False)].copy()
    if len(real_df) < 100:
        print("Not enough real bet data to learn from.")
        return 0

    skills, report = build_skills(real_df, df)
    atomic_write_json(SKILLS_FILE, skills)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    memory_content = f"""# Stake Market Memory (Hermes AI)

This file stores persistent facts and risk adjustments generated by Hermes.

## Latest Risk Status
* Timestamp: {timestamp}
* Risk Mode: {report["risk_mode"]}
* Total Real Bets Analyzed: {report["total_real_count"]:,}
* Recent Real Bets Used: {report["recent_real_count"]:,}
* Max Recent Step: {report["max_recent_step"]}
* Max Recent Loss Streak: {report["max_recent_loss"]}
* P95 Loss Streak: {report["p95_loss"]}
* W-W Gap Threshold: {report["isolated_wins"]}
* Worst W-W Gap Observed: {report["max_gap"]}
* Recent Mode Counts: {report["virtual_counts"]}

## Active ai_skills.json
```json
{json.dumps(skills, indent=4, ensure_ascii=False)}
```

## Guardrails
* Hermes only changes risk-control thresholds.
* Hermes does not change base_bet, balance, token, cookies, or simulate mode.
* Step 14+ remains protected by 1 real loss -> virtual mode.
"""
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        f.write(memory_content)

    print(f"Skills updated. Risk={report['risk_mode']} MaxStep={report['max_recent_step']} MaxLoss={report['max_recent_loss']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(analyze_and_learn())
