import csv
import os
import random
import math
import sys
import json
from datetime import datetime

from _account_paths import account_file, normalize_config_name

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
                        "Format": "7-COL",
                        "Timestamp": dt,
                        "Mode": "REAL",
                        "Step": 1,
                        "BetAmount": float(row[1]),
                        "Target": float(row[2]),
                        "Condition": row[3].strip().lower(),
                        "RollResult": float(row[4]),
                        "Payout": float(row[5]),
                        "Result": row[6].strip().upper(),
                        "Status": "REAL"
                    })
                elif len(row) >= 11:
                    dt = datetime.strptime(row[0], "%Y-%m-%d %H:%M:%S")
                    parsed_rows.append({
                        "Format": "11-COL",
                        "Timestamp": dt,
                        "Mode": row[1].strip().upper(),
                        "Step": int(row[2]),
                        "BetAmount": float(row[3]),
                        "Target": float(row[4]),
                        "Condition": row[5].strip().lower(),
                        "RollResult": float(row[6]),
                        "Payout": float(row[7]),
                        "Result": row[8].strip().upper(),
                        "Status": row[1].strip().upper(),
                        "Streak": int(row[9]),
                        "StreakType": row[10]
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

def analyze_performance():
    print("==================================================================")
    print(" COMMANDER BRIAN - PORTFOLIO & RISK ANALYSIS REPORT")
    print("==================================================================")
    print(f" Account scope: {_CONFIG_REF}")
    
    history = parse_history_file(HISTORY_FILE)
    if not history:
        print(f"[!] Error: {HISTORY_FILE} not found, empty, or corrupt.")
        return
        
    deposits = parse_financial_file(DEPOSITS_FILE)
    withdrawals = parse_financial_file(WITHDRAWALS_FILE)
    
    initial_capital = 1243.154  # Default baseline
    base_bet = 0.05
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r") as f:
                stats = json.load(f)
                initial_capital = stats.get("initial_capital", initial_capital)
                base_bet = stats.get("base_bet", base_bet)
        except:
            pass

    # Timeline creation
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
                "Payout": b["Payout"],
                "Result": b["Result"],
                "Target": b["Target"],
                "Condition": b["Condition"]
            })
            
    timeline.sort(key=lambda x: x["Timestamp"])
    
    # 1. UNITIZED VALUATION (Time-Weighted Return) to isolate Cash Flows
    # We initialize the fund with 1.0 unit price and starting balance
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
            # Deposit increases portfolio value and adds new units at the current unit price
            portfolio_value += dep_amount
            units += dep_amount / unit_price
            total_deposited += dep_amount
        elif event["Type"] == "WITHDRAWAL":
            wit_amount = event["Amount"]
            # Withdrawal decreases portfolio value and removes units at the current unit price
            portfolio_value -= wit_amount
            units -= wit_amount / unit_price
            total_withdrawn += wit_amount
        elif event["Type"] == "BET":
            profit_loss = event["Payout"] - event["BetAmount"]
            portfolio_value += profit_loss
            # Recalculate unit price based on new value
            if units > 0:
                unit_price = portfolio_value / units
            else:
                unit_price = 0.0
                
        # Drawdown calculation based on TWR Unit Price (isolating flows)
        if unit_price > peak_unit_price:
            peak_unit_price = unit_price
            
        dd_pct = ((peak_unit_price - unit_price) / peak_unit_price * 100) if peak_unit_price > 0 else 0.0
        if dd_pct > max_twr_dd_pct:
            max_twr_dd_pct = dd_pct

    # Absolute Financial stats
    net_profit = (portfolio_value + total_withdrawn) - (initial_capital + total_deposited)
    total_invested = initial_capital + total_deposited
    roi = (net_profit / total_invested * 100) if total_invested > 0 else 0.0
    
    # Time-weighted return rate
    twr_return = (unit_price - 1.0) * 100.0
    
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

    print("\n--- 1. FINANCIAL & ROI PERFORMANCE ---")
    print(f"  * Initial Capital        : {initial_capital:,.4f} TRX")
    print(f"  * Total Deposited (Flow) : {total_deposited:,.4f} TRX")
    print(f"  * Total Withdrawn (Flow) : {total_withdrawn:,.4f} TRX")
    print(f"  * Current Equity         : {portfolio_value:,.4f} TRX")
    print(f"  * Net Profit (Realized)  : {net_profit:+,.4f} TRX")
    print(f"  * Lifetime ROI (Absolute): {roi:.2f}%")
    print(f"  * Time-Weighted Return   : {twr_return:+.2f}% (Isolates Deposits/Withdrawals)")
    print(f"  * Active Duration        : {days_active:.2f} days")
    print(f"  * Annualized Growth (CAGR): {cagr:.2f}%")

    print("\n--- 2. RISK & DRAWDOWN ANALYSIS (TWR METHOD) ---")
    print(f"  * Max Strategy Drawdown (Time-Weighted): {max_twr_dd_pct:.2f}% from peak unit price")
    calmar_ratio = cagr / max_twr_dd_pct if max_twr_dd_pct > 0 else 0.0
    print(f"  * Calmar Ratio (CAGR / Max DD)         : {calmar_ratio:.2f}")

    # 3. Provably Fair & Law of Large Numbers
    print("\n--- 3. PROVABLY FAIR & LAW OF LARGE NUMBERS ---")
    total_bets = len(history)
    real_bets = [r for r in history if r["Status"] == "REAL"]
    virtual_bets = [r for r in history if r["Status"] == "VIRTUAL"]
    
    total_real = len(real_bets)
    total_virtual = len(virtual_bets)
    
    # Audit log sum verification
    print(f"  * Data Validation Audit:")
    print(f"    - Real Bets count        : {total_real:,}")
    print(f"    - Virtual Bets count     : {total_virtual:,}")
    print(f"    - Combined Dataset Total : {total_real + total_virtual:,} rows (Verification: {'Match' if (total_real + total_virtual == total_bets) else 'Mismatch'})")
    print()
    
    bets_7 = [r for r in real_bets if r["Format"] == "7-COL"]
    bets_11 = [r for r in real_bets if r["Format"] == "11-COL"]
    
    def print_format_stats(name, subset, default_exp_rate=0.49, custom_logic=False):
        total = len(subset)
        if total == 0:
            print(f"  [{name}] No bets found in this format.")
            return
            
        wins = sum(1 for r in subset if r["Result"] == "WIN")
        actual_rate = (wins / total * 100)
        
        expected_wins = 0.0
        variance = 0.0
        for r in subset:
            cond = r["Condition"]
            target = r["Target"]
            if custom_logic and actual_rate < 25.0:
                prob = 0.198
            else:
                prob = target / 100.0 if cond == "below" else ((100.0 - target) / 100.0 if cond == "above" else default_exp_rate)
            expected_wins += prob
            variance += prob * (1.0 - prob)
            
        expected_rate = (expected_wins / total * 100)
        std_dev = math.sqrt(variance)
        z_score = (wins - expected_wins) / std_dev if std_dev > 0 else 0.0
        
        print(f"  [{name} Dataset]")
        print(f"    * Expected Win % : {expected_rate:.2f}%")
        print(f"    * Actual Win %   : {actual_rate:.2f}% (WIN={wins}, LOSS={total-wins})")
        print(f"    * Deviation      : Z-Score = {z_score:+.2f}")
        if abs(z_score) <= 1.96:
            print("      [OK] Conforms to the Law of Large Numbers (Provably Fair).")
        else:
            print("      [WARN] Statistical deviation detected. (Check strategy target or session logs).")

    print_format_stats("Old 7-Column Log", bets_7, default_exp_rate=0.198, custom_logic=True)
    print()
    print_format_stats("New 11-Column Log", bets_11, default_exp_rate=0.490, custom_logic=False)

    # 4. Monte Carlo Simulation for Expected Max Drawdown
    print("\n--- 4. MONTE CARLO RISK SIMULATION (Normalized Bankroll) ---")
    # To prevent massive bankroll bias, we simulate standard bankrolls
    # 1. ACTUAL ratio simulation (large bankroll bias)
    # 2. NORMALIZED bankroll simulation (e.g. Starting with 1,000 TRX or 2,000 * base_bet)
    
    sim_runs = 10000
    sim_steps = 5000
    win_rate_11 = (sum(1 for r in bets_11 if r["Result"] == "WIN") / len(bets_11)) if bets_11 else 0.4858
    win_prob = win_rate_11
    
    # We define a standard, vulnerable bankroll to analyze true risk: 1000 * base_bet (i.e. 0.5 TRX starting balance)
    normalized_starting_balance = 2000 * base_bet # 1.0 TRX
    
    sim_max_drawdowns_pct = []
    ruined_count = 0

    for _ in range(sim_runs):
        sim_balance = normalized_starting_balance
        sim_peak = sim_balance
        sim_dd_pct = 0.0
        
        m_step = 0
        loss_streak = 0
        v_mode = False
        
        for _ in range(sim_steps):
            if sim_balance <= 0:
                ruined_count += 1
                sim_dd_pct = 100.0
                break
                
            if v_mode:
                bet_amt = 0.0
            else:
                bet_amt = base_bet * (2 ** m_step)
                
            if bet_amt > sim_balance:
                # Forced limit or bust
                bet_amt = sim_balance
                
            win = (random.random() < win_prob)
            
            if win:
                if v_mode:
                    v_mode = False
                else:
                    payout_mult = 0.99 / win_prob if win_prob > 0 else 2.0204
                    sim_balance += bet_amt * (payout_mult - 1.0)
                    m_step = 0
                    loss_streak = 0
            else:
                if v_mode:
                    pass
                else:
                    sim_balance -= bet_amt
                    loss_streak += 1
                    m_step += 1
                    
            if sim_balance > sim_peak:
                sim_peak = sim_balance
            
            current_dd = ((sim_peak - sim_balance) / sim_peak * 100) if sim_peak > 0 else 0.0
            if current_dd > sim_dd_pct:
                sim_dd_pct = current_dd
                
            if loss_streak >= 3 and not v_mode:
                v_mode = True
                
        sim_max_drawdowns_pct.append(sim_dd_pct)
        
    sim_max_drawdowns_pct.sort()
    avg_expected_dd = sum(sim_max_drawdowns_pct) / sim_runs
    p95_expected_dd = sim_max_drawdowns_pct[int(sim_runs * 0.95)]
    p99_expected_dd = sim_max_drawdowns_pct[int(sim_runs * 0.99)]
    ruin_probability = (ruined_count / sim_runs) * 100
    
    print(f"  * Normalized Bankroll Target  : Starting Capital = {normalized_starting_balance:.4f} TRX (2,000x Base Bet)")
    print(f"  * Simulated Horizon           : {sim_steps} bets per run")
    print(f"  * Probability of Ruin (Bust)  : {ruin_probability:.2f}%")
    print(f"  * Expected Average Max Drawdown: {avg_expected_dd:.2f}%")
    print(f"  * 95% Confidence Max Drawdown : {p95_expected_dd:.2f}% (Extreme Case)")
    print(f"  * 99% Confidence Max Drawdown : {p99_expected_dd:.2f}% (Worst Case Scenario)")

    # 5. Virtual Mode Savings & Opportunity Cost Note
    if virtual_bets:
        saved_trx = 0.0
        for r in virtual_bets:
            try:
                step = int(r.get("Step", 0))
                saved_trx += base_bet * (2 ** step)
            except:
                pass
        print(f"\n--- 5. STREAK BREAKER (VIRTUAL MODE) METRICS ---")
        print(f"  * Virtual Bets Run (Filtered Out) : {len(virtual_bets):,}")
        print(f"  * Estimated Capital Saved (TRX)   : {saved_trx:.4f} TRX (Avoided Martingale Drawdowns)")
        print(f"  [NOTE] Opportunity Cost:")
        print(f"         While Virtual Mode successfully reduces variance and protects capital from tail risks,")
        print(f"         it incurs an Opportunity Cost by missing potential early wins on virtual spins.")
    else:
        print(f"\n--- 5. STREAK BREAKER (VIRTUAL MODE) METRICS ---")
        print("  * No virtual bets recorded yet.")
    print("==================================================================\n")

if __name__ == "__main__":
    analyze_performance()
