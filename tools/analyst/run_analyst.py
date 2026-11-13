# -*- coding: utf-8 -*-
"""Master Pipeline Runner for Stake Dice Analyst
"""

import os
import sys
import webbrowser
from analytics import load_analytics_data
from charts import generate_portfolio_charts
from html_report import generate_html_report
from telegram_sender import send_telegram_audit

# Fix console encoding on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def main():
    print("=" * 70)
    print(" 🎲 STAKE QUANTITATIVE RISK & STRATEGY ANALYST (PIPELINE)")
    print("=" * 70)

    analyst_dir = os.path.dirname(os.path.abspath(__file__))
    reports_dir = os.path.join(analyst_dir, "reports")
    chart_path = os.path.join(reports_dir, "pnl_chart.png")
    html_path = os.path.join(reports_dir, "daily_audit.html")

    print("[1/4] 📥 กำลังดึงและวิเคราะห์สถิติจาก stake_ledger.db...")
    data = load_analytics_data()
    summary = data["summary"]
    print(f"      • วิเคราะห์ครบ {summary['total_sessions']} เซสชัน | กำไรรวม: +{summary['total_pnl']:,.2f} USDT")
    print(f"      • Win Rate รวม: {summary['win_rate']:.1f}% | กำไรเฉลี่ยต่อ 20 นาที: +{summary['avg_pnl']:,.4f} USDT")

    print("[2/4] 📈 กำลังวาดกราฟพอร์ตโฟลิโอเชิงลึก (Matplotlib Dark Theme)...")
    generate_portfolio_charts(data, chart_path)
    print(f"      • บันทึกกราฟที่: {chart_path}")

    print("[3/4] 📄 กำลังสร้างรายงานบริหารความเสี่ยง (McKinsey Style HTML Report)...")
    generate_html_report(data, chart_path, html_path)
    print(f"      • บันทึกรายงานที่: {html_path}")

    print("[4/4] 📲 กำลังส่งกราฟและรายงานสรุปเข้า Telegram...")
    tg_ok = send_telegram_audit(data, chart_path)
    if tg_ok:
        print("      • ส่งเข้า Telegram บนมือถือเรียบร้อยแล้ว!")
    else:
        print("      • ข้ามการส่ง Telegram (หรือเกิดข้อผิดพลาดในการเชื่อมต่อ)")

    print("=" * 70)
    print(" 🎉 การวิเคราะห์เสร็จสมบูรณ์ 100%!")
    print("=" * 70)

    # Open HTML report in browser
    try:
        webbrowser.open(html_path)
    except Exception:
        pass

if __name__ == "__main__":
    main()
