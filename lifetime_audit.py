import csv
import os
import math
import sys
import json
from datetime import datetime

from _account_paths import account_file, normalize_config_name

# Force UTF-8 for Windows console
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

_CONFIG_REF = normalize_config_name(sys.argv[1]) if len(sys.argv) > 1 else "config.json"

HISTORY_FILE = account_file("dice_history.csv", _CONFIG_REF)
STATS_FILE = account_file("dice_stats.json", _CONFIG_REF)
DEPOSITS_FILE = "company_deposits_report.csv"
WITHDRAWALS_FILE = "company_withdrawals_report.csv"

def parse_history_file(filename):
    if not os.path.exists(filename):
        return []
    
    parsed_rows = []
    with open(filename, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            if "Timestamp" in row[0] or "Mode" in row[0]:
                continue
                
            try:
                if len(row) == 7:
                    dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    parsed_rows.append({
                        "Type": "BET",
                        "Timestamp": dt,
                        "BetAmount": float(row[1]),
                        "Payout": float(row[5]),
                        "Status": "REAL"
                    })
                elif len(row) >= 11:
                    dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    parsed_rows.append({
                        "Type": "BET",
                        "Timestamp": dt,
                        "BetAmount": float(row[3]),
                        "Payout": float(row[7]),
                        "Status": row[1].strip().upper()
                    })
            except Exception:
                continue
    return parsed_rows

def parse_financial_file(filename):
    if not os.path.exists(filename):
        return []
    
    events = []
    with open(filename, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                date_str = row["Date (GMT)"]
                dt = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S %Z")
                events.append({
                    "Timestamp": dt,
                    "Amount": float(row["Amount"])
                })
            except Exception:
                continue
    return events

def run_master_audit():
    print("==================================================================")
    print("   MASTER FINANCIAL AUDIT & PERFORMANCE REPORT (TWRR)")
    print("==================================================================")
    print(f" Account scope: {_CONFIG_REF}")
    
    history = parse_history_file(HISTORY_FILE)
    deposits = parse_financial_file(DEPOSITS_FILE)
    withdrawals = parse_financial_file(WITHDRAWALS_FILE)
    
    # Load initial capital from stats JSON or fallback to defaults
    initial_capital = 1243.154
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r") as f:
                stats = json.load(f)
                initial_capital = stats.get("initial_capital", initial_capital)
        except:
            pass

    # Trace current wallet balance from stats JSON if available
    current_wallet_balance = 105684.0 # default fallback
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r") as f:
                stats = json.load(f)
                # If bot_state is recorded, fetch current balance
                current_wallet_balance = stats.get("initial_balance", current_wallet_balance)
        except:
            pass

    # Build chronological timeline
    timeline = []
    for d in deposits:
        timeline.append({"Type": "DEPOSIT", "Timestamp": d["Timestamp"], "Amount": d["Amount"]})
    for w in withdrawals:
        timeline.append({"Type": "WITHDRAWAL", "Timestamp": w["Timestamp"], "Amount": w["Amount"]})
    for b in history:
        if b["Status"] == "REAL":
            timeline.append({
                "Type": "BET",
                "Timestamp": b["Timestamp"],
                "BetAmount": b["BetAmount"],
                "Payout": b["Payout"]
            })
            
    timeline.sort(key=lambda x: x["Timestamp"])
    
    # TWRR & Drawdown Tracking
    portfolio_value = initial_capital
    units = initial_capital
    unit_price = 1.0
    
    peak_unit_price = 1.0
    max_twr_dd_pct = 0.0
    
    total_deposited = 0.0
    total_withdrawn = 0.0
    
    for event in timeline:
        if event["Type"] == "DEPOSIT":
            dep_amount = event["Amount"]
            portfolio_value += dep_amount
            units += dep_amount / unit_price
            total_deposited += dep_amount
        elif event["Type"] == "WITHDRAWAL":
            wit_amount = event["Amount"]
            portfolio_value -= wit_amount
            units -= wit_amount / unit_price
            total_withdrawn += wit_amount
        elif event["Type"] == "BET":
            profit_loss = event["Payout"] - event["BetAmount"]
            portfolio_value += profit_loss
            if units > 0:
                unit_price = portfolio_value / units
            else:
                unit_price = 0.0
                
        # Peak tracking for Drawdown
        if unit_price > peak_unit_price:
            peak_unit_price = unit_price
            
        dd_pct = ((peak_unit_price - unit_price) / peak_unit_price * 100) if peak_unit_price > 0 else 0.0
        if dd_pct > max_twr_dd_pct:
            max_twr_dd_pct = dd_pct

    # Performance Metrics
    net_profit = (portfolio_value + total_withdrawn) - (initial_capital + total_deposited)
    total_invested = initial_capital + total_deposited
    absolute_roi = (net_profit / total_invested * 100) if total_invested > 0 else 0.0
    twrr = (unit_price - 1.0) * 100.0
    
    # CAGR
    days_active = 1.0
    if len(history) > 1:
        diff = (history[-1]["Timestamp"] - history[0]["Timestamp"]).total_seconds() / 86400.0
        if diff > 0:
            days_active = diff
            
    ending_val = portfolio_value + total_withdrawn
    starting_val = total_invested
    if starting_val > 0 and ending_val > 0 and days_active > 0:
        cagr = (math.pow(ending_val / starting_val, 365.0 / days_active) - 1.0) * 100.0
    else:
        cagr = 0.0
        
    calmar = cagr / max_twr_dd_pct if max_twr_dd_pct > 0 else 0.0

    print("\n[+] FINANCIAL LEDGER AUDIT:")
    print(f"  * Initial Capital         : {initial_capital:,.4f} TRX")
    print(f"  * Total Deposits (Flow)   : {total_deposited:,.4f} TRX")
    print(f"  * Total Withdrawals (Flow): {total_withdrawn:,.4f} TRX")
    print(f"  * Current Portfolio Value : {portfolio_value:,.4f} TRX")
    print(f"  * Net Profit (Realized)   : {net_profit:+,.4f} TRX")
    
    print("\n[+] PERFORMANCE & TWRR METRICS:")
    print(f"  * Absolute ROI (Simple)   : {absolute_roi:.2f}%")
    print(f"  * Time-Weighted Return    : {twrr:+.2f}% (TWRR)")
    print(f"  * Active Trading Horizon  : {days_active:.2f} days")
    print(f"  * CAGR (Annualized)       : {cagr:.2f}%")
    print(f"  * Max Strategy Drawdown   : {max_twr_dd_pct:.2f}%")
    print(f"  * Calmar Ratio (CAGR/MaxDD): {calmar:.2f}")
    
    # Financial health status
    print("\n[+] SYSTEM AUDIT STATUS:")
    if calmar > 1.0:
        print("  * Risk-Return Rating    : [GOOD/EXCELLENT] Strategy pays off relative to drawdowns.")
    elif calmar >= 0.0:
        print("  * Risk-Return Rating    : [ACCEPTABLE/STABLE] Consistent but low return-to-risk ratio.")
    else:
        print("  * Risk-Return Rating    : [WARNING] Negative CAGR detected. Review strategy variables.")
    print("==================================================================\n")

if __name__ == "__main__":
    run_master_audit()
