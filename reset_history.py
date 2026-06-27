"""
Reset all bot history/stats to start fresh for all config profiles.
"""
import glob
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

stats_reset = {
    "real_consecutive_wins": 0,
    "recent_all_bets": [],
    "total_bets": 0,
    "last_condition": None,
    "last_fib_step": 0,
    "reserve_fund": 0.0,
    "max_single_loss": 0.0,
    "locked_profit": 0.0,
    "stop_loss": 0.0,
    "wins": 0,
    "real_bets_without_ww": 0,
    "total_profit": 0.0,
    "total_wagered": 0.0,
    "losses": 0,
    "total_deposited": 0.0,
    "initial_capital": 0.0,
    "peak_equity": 0.0,
    "max_drawdown": 0.0,
    "initial_balance": 0.0,
    "total_withdrawn": 0.0,
    "total_uptime_seconds": 0,
    "max_fib_step": 0,
    "max_loss_streak": 0,
    "first_run_time": None,
}

# 1. Reset all stats files (*.json)
for filepath in glob.glob("dice_stats*.json"):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(stats_reset, f, indent=4)
    print(f"[OK] {filepath} reset", flush=True)

# 2. Reset hermes model state
if os.path.exists("hermes_model_state.json"):
    with open("hermes_model_state.json", "w", encoding="utf-8") as f:
        json.dump({}, f, indent=2)
    print("[OK] hermes_model_state.json reset", flush=True)

# 3. Clear audit and debug logs
for path in glob.glob("*.log"):
    # Avoid clearing important system files if any, but clear audit/events
    if "audit" in path or "events" in path or "live_start" in path or "startup_probe" in path or "hermes_brain" in path:
        with open(path, "w", encoding="utf-8") as f:
            f.write("")
        print(f"[OK] {path} cleared", flush=True)

# 4. Reset history CSV files
for filepath in glob.glob("dice_history*.csv"):
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("timestamp,mode,step,bet,target,condition,result,payout,status,streak,streak_type\n")
    print(f"[OK] {filepath} reset (header only)", flush=True)

# 5. Reset accounting reports
for filepath in glob.glob("daily_accounting_report*.csv"):
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("date,initial_capital,deposits,withdrawals,gross_profit,net_profit,bets,wins,losses,win_rate\n")
    print(f"[OK] {filepath} reset (header only)", flush=True)

# 6. Reset deposit history
for filepath in glob.glob("deposit_history*.csv"):
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("Timestamp,DepositAmount,BalanceAfter\n")
    print(f"[OK] {filepath} reset (header only)", flush=True)

print("\n[DONE] Bot history for all profiles fully reset. Ready to start fresh!", flush=True)
