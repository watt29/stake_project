import json
import os
import sys

# Force UTF-8 for Windows console
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def main():
    print("==================================================")
    print("      STAKE ACCOUNTS - REAL-TIME BALANCE")
    print("==================================================\n")
    
    total_balance = 0.0
    
    for i in range(1, 9):
        filename = "dice_stats.json" if i == 1 else f"dice_stats_account{i}.json"
        
        if os.path.exists(filename):
            try:
                with open(filename, 'r', encoding='utf-8-sig') as f:
                    data = json.load(f)
                    acc_name = data.get("account_name", f"account{i}")
                    balance = data.get("total_profit", 0.0)
                    total_balance += balance
                    print(f"  - {acc_name:<15} : {balance:12.6f} TRX")
            except Exception as e:
                print(f"  - account{i:<14} : [Error Reading File]")
        else:
            print(f"  - account{i:<14} : [No Data / Not Started]")
            
    print("\n==================================================")
    print(f"  TOTAL BALANCE (ยอดรวม) : {total_balance:12.6f} TRX")
    print("==================================================\n")
    
if __name__ == "__main__":
    main()
