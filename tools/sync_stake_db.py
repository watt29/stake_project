import csv
import sqlite3
import os
import sys

def sync_ledger():
    tools_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(tools_dir, "stake_ledger.db")
    csv_path = os.path.join(tools_dir, "rotate-ledger.csv")

    if not os.path.exists(csv_path):
        return 0

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        profile TEXT NOT NULL,
        account TEXT NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        pnl REAL NOT NULL,
        reason TEXT NOT NULL
    )
    ''')

    cur.execute('''
    CREATE VIEW IF NOT EXISTS v_daily_summary AS
    SELECT 
        date,
        profile,
        account,
        COUNT(*) as total_sessions,
        ROUND(SUM(pnl), 5) as total_profit,
        ROUND(AVG(pnl), 5) as avg_profit,
        ROUND(MIN(pnl), 5) as worst_drawdown,
        ROUND(MAX(pnl), 5) as best_session,
        SUM(CASE WHEN pnl >= 0 THEN 1 ELSE 0 END) as win_sessions,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as loss_sessions
    FROM sessions
    GROUP BY date, profile, account
    ORDER BY date DESC
    ''')

    inserted = 0
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                sid = (r.get('session_id') or '').strip()
                if not sid:
                    continue
                pnl_val = float(r.get('pnl') or 0.0)
                cur.execute('''
                INSERT OR IGNORE INTO sessions (date, time, profile, account, session_id, pnl, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (r['date'], r['time'], r['profile'], r['account'], sid, pnl_val, r['reason']))
                if cur.rowcount > 0:
                    inserted += 1
            except Exception:
                pass

    conn.commit()
    conn.close()
    return inserted

if __name__ == "__main__":
    count = sync_ledger()
    print(f"Synced {count} new sessions into stake_ledger.db")
