import pandas as pd
import os
import sys

# Force UTF-8 for Windows console
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

HISTORY_FILE = "dice_history.csv"

def run_analysis():
    print("==================================================================")
    print("   W-W GAP & BALANCE DRAWDOWN ANALYZER")
    print("==================================================================")
    
    if not os.path.exists(HISTORY_FILE):
        print(f"Error: Could not find {HISTORY_FILE}")
        return

    # Load data
    try:
        df = pd.read_csv(HISTORY_FILE, header=None, names=[
            'timestamp', 'mode', 'step', 'bet', 'target', 
            'condition', 'payout', 'profit', 'result', 
            'streak_count', 'streak_type'
        ])
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    # Filter only REAL mode bets
    real_df = df[df['mode'] == 'REAL'].copy()
    if len(real_df) == 0:
        print("No REAL bets found in history.")
        return

    # Convert to list for fast iteration
    records = real_df.to_dict('records')

    gaps = []
    
    current_gap_length = 0
    consecutive_wins = 0
    
    # Balance tracking
    running_balance = 0.0
    gap_start_balance = 0.0
    gap_min_balance = 0.0

    for i, row in enumerate(records):
        try:
            actual_payout = float(row['profit'])
            bet_amt = float(row['bet'])
            if actual_payout > 0:
                profit = actual_payout - bet_amt
            else:
                profit = -bet_amt
        except:
            profit = 0.0
            
        running_balance += profit
        
        # Initialize gap start if it's length 0
        if current_gap_length == 0:
            gap_start_balance = running_balance - profit # Balance before this bet
            gap_min_balance = gap_start_balance

        current_gap_length += 1
        
        # Track minimum balance during this gap
        if running_balance < gap_min_balance:
            gap_min_balance = running_balance

        # Check for Win
        if row['result'] == 'WIN':
            consecutive_wins += 1
        else:
            consecutive_wins = 0
            
        # Check for W-W
        if consecutive_wins >= 2:
            # End of gap
            drawdown = gap_start_balance - gap_min_balance
            net_profit_gap = running_balance - gap_start_balance
            
            gaps.append({
                'length': current_gap_length,
                'drawdown': drawdown,
                'net_profit': net_profit_gap,
                'end_index': i
            })
            
            # Reset trackers
            current_gap_length = 0
            consecutive_wins = 0

    if current_gap_length > 0:
        # Trailing gap
        drawdown = gap_start_balance - gap_min_balance
        net_profit_gap = running_balance - gap_start_balance
        gaps.append({
            'length': current_gap_length,
            'drawdown': drawdown,
            'net_profit': net_profit_gap,
            'end_index': -1
        })

    if not gaps:
        print("No W-W occurrences found.")
        return

    gap_df = pd.DataFrame(gaps)
    
    total_gaps = len(gap_df)
    print(f"\n[+] สถิติภาพรวม (TOTAL W-W GAPS: {total_gaps:,})")
    print(f"  - ค่าเฉลี่ยความห่าง (Average)  : {gap_df['length'].mean():.2f} ตา")
    print(f"  - 75% ของกราฟออก W-W ภายใน   : {gap_df['length'].quantile(0.75):.0f} ตา")
    print(f"  - 90% ของกราฟออก W-W ภายใน   : {gap_df['length'].quantile(0.90):.0f} ตา")
    print(f"  - 95% ของกราฟออก W-W ภายใน   : {gap_df['length'].quantile(0.95):.0f} ตา")
    print(f"  - 99% ของกราฟออก W-W ภายใน   : {gap_df['length'].quantile(0.99):.0f} ตา")
    print(f"  - ลากยาวที่สุดที่เคยเจอ (Max)  : {gap_df['length'].max():.0f} ตา")

    print("\n[+] วิเคราะห์ความลึกของพอร์ต (Drawdown Analysis)")
    
    # Categorize gaps
    def categorize(length):
        if length <= 8: return "1-8 ตา (ปกติ)"
        elif length <= 15: return "9-15 ตา (ลากปานกลาง)"
        elif length <= 24: return "16-24 ตา (ซวย)"
        else: return "> 24 ตา (วิกฤติ)"
        
    gap_df['category'] = gap_df['length'].apply(categorize)
    
    summary = gap_df.groupby('category').agg(
        Count=('length', 'count'),
        Avg_Drawdown=('drawdown', 'mean'),
        Max_Drawdown=('drawdown', 'max')
    ).sort_values('Avg_Drawdown')

    for index, row in summary.iterrows():
        print(f"  [{index}]")
        print(f"     - จำนวนครั้งที่เกิด : {row['Count']:,} ครั้ง")
        print(f"     - ดึงพอร์ตเฉลี่ย  : -{row['Avg_Drawdown']:.4f} TRX")
        print(f"     - ดึงพอร์ตลึกสุด  : -{row['Max_Drawdown']:.4f} TRX")

    print("\n[+] Top 10 จังหวะที่ลากยาวที่สุด (Worst Case Scenarios)")
    top10 = gap_df.sort_values('length', ascending=False).head(10)
    
    print(f"  {'อันดับ':<6} {'ความห่าง (ตา)':<15} {'ดึงพอร์ตลึกสุด (Max DD)':<25} {'กำไร/ขาดทุนสุทธิของลูปนี้'}")
    print("  " + "-"*75)
    rank = 1
    for _, row in top10.iterrows():
        print(f"  {rank:<6} {int(row['length']):<15} -{row['drawdown']:<24.4f} {row['net_profit']:+.4f} TRX")
        rank += 1
        
    print("==================================================================\n")

if __name__ == "__main__":
    run_analysis()
