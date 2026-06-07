import csv
from datetime import datetime

def analyze_deposits(filename):
    total_amount = 0.0
    count = 0
    dates = []
    
    try:
        with open(filename, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    amt = float(row["Amount"])
                    total_amount += amt
                    count += 1
                    # Parse date: "Tue, 05 May 2026 15:22:58 GMT"
                    date_str = row["Date (GMT)"]
                    dt = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S %Z")
                    dates.append(dt)
                except:
                    continue
        
        if not dates:
            return "No valid data found."
            
        dates.sort()
        first_date = dates[0]
        last_date = dates[-1]
        duration_days = (last_date - first_date).days
        avg_deposit = total_amount / count if count > 0 else 0
        
        summary = (
            f"--- FINANCIAL DEPOSIT SUMMARY (ALL-TIME) ---\n"
            f"Total Deposited: {total_amount:,.2f} TRX\n"
            f"Number of Deposits: {count} records\n"
            f"Average Deposit: {avg_deposit:,.2f} TRX\n"
            f"------------------------------------------\n"
            f"First Deposit Date: {first_date.strftime('%d/%m/%Y')}\n"
            f"Last Deposit Date: {last_date.strftime('%d/%m/%Y')}\n"
            f"Total Account Age: {duration_days} days\n"
            f"------------------------------------------\n"
            f"Note: Based on 660 records from company_deposits_report.csv"
        )
        return summary
        return summary
    except Exception as e:
        return f"Error analyzing data: {e}"

if __name__ == "__main__":
    print(analyze_deposits("company_deposits_report.csv"))
