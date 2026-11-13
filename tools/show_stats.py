import sqlite3
import os
import sys

# Ensure UTF-8 output on Windows CP874
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def show_summary():
    tools_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(tools_dir, "stake_ledger.db")
    
    if not os.path.exists(db_path):
        print("❌ ไม่พบฐานข้อมูล stake_ledger.db")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    print("=" * 68)
    print(" 🎲 STAKE DICE BOT — สรุปสถิติผลประกอบการ (SQLite Ledger)")
    print("=" * 68)

    cur.execute("SELECT * FROM v_daily_summary LIMIT 5")
    rows = cur.fetchall()

    if not rows:
        print("ยังไม่มีข้อมูลเซสชัน")
        conn.close()
        return

    print(f"{'วันที่':<12} | {'รอบ':<4} | {'กำไรสะสม ($)':<14} | {'เฉลี่ย/รอบ':<10} | {'ชนะ':<4} | {'แพ้':<4}")
    print("-" * 68)
    for r in rows:
        date, profile, account, count, total_p, avg_p, worst, best, wins, losses = r
        p_str = f"+{total_p:,.4f}" if total_p >= 0 else f"{total_p:,.4f}"
        avg_str = f"+{avg_p:,.4f}" if avg_p >= 0 else f"{avg_p:,.4f}"
        print(f"{date:<12} | {count:<4} | {p_str:<14} | {avg_str:<10} | {wins:<4} | {losses:<4}")

    print("-" * 68)
    print("📋 5 เซสชันล่าสุด:")
    cur.execute("SELECT time, pnl, reason, session_id FROM sessions ORDER BY id DESC LIMIT 5")
    for r in cur.fetchall():
        t, pnl, reason, sid = r
        pnl_str = f"+{pnl:,.5f}" if pnl >= 0 else f"{pnl:,.5f}"
        icon = "[+]" if pnl >= 0 else "[-]"
        print(f"  {icon} {t} | PnL: {pnl_str:>12} $ | เหตุผล: {reason:<6} | {sid}")
    
    print("=" * 68)
    conn.close()

if __name__ == "__main__":
    show_summary()
