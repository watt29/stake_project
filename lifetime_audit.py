import csv

def get_total_from_csv(filename):
    total = 0.0
    try:
        with open(filename, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    total += float(row["Amount"])
                except:
                    continue
    except:
        pass
    return total

if __name__ == "__main__":
    total_in = get_total_from_csv("company_deposits_report.csv")
    total_out = get_total_from_csv("company_withdrawals_report.csv")
    current_balance = 1350.0 # From recent report
    
    lifetime_profit = (total_out + current_balance) - total_in
    roi = (lifetime_profit / total_in * 100) if total_in > 0 else 0
    
    print(f"--- MASTER LIFETIME FINANCIAL REPORT ---")
    print(f"Total Deposited: {total_in:,.2f} TRX")
    print(f"Total Withdrawn: {total_out:,.2f} TRX")
    print(f"Current Equity:  {current_balance:,.2f} TRX")
    print(f"------------------------------------------")
    print(f"LIFETIME NET PROFIT: {lifetime_profit:+,.2f} TRX")
    print(f"LIFETIME ROI:        {roi:.2f}%")
    print(f"------------------------------------------")
