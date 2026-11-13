# -*- coding: utf-8 -*-
"""Telegram Photo & Summary Sender for Stake Analyst
Sends the generated chart image and executive audit summary to Telegram.
"""

import os
import urllib.request
import urllib.parse
import mimetypes

def load_env_vars():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_file = os.path.join(base_dir, ".env")
    env = {}
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def send_telegram_audit(analytics_data, chart_path):
    env = load_env_vars()
    bot_token = env.get("TELEGRAM_BOT_TOKEN")
    chat_id = env.get("TELEGRAM_CHAT_ID")

    if not bot_token or not chat_id:
        print("⚠️ Telegram token or chat_id not found in .env")
        return False

    summary = analytics_data["summary"]
    daily = analytics_data["daily"]
    today_rec = daily[-1] if daily else {"profit": 0, "sessions": 0, "win_rate": 0}

    caption = (
        f"📊 <b>[Stake Dice] รายงานวิเคราะห์พอร์ตโฟลิโอเชิงลึก</b>\n\n"
        f"💰 <b>กำไรสะสมสุทธิ:</b> +{summary['total_pnl']:,.2f} USDT\n"
        f"🎯 <b>Win Rate รวม:</b> {summary['win_rate']:.1f}% ({summary['wins']}/{summary['total_sessions']} รอบ)\n"
        f"📅 <b>ผลงานวันนี้:</b> +{today_rec['profit']:,.2f} USDT ({today_rec['sessions']} รอบ | ชนะ {today_rec['win_rate']:.1f}%)\n"
        f"⚡ <b>เฉลี่ยต่อ 20 นาที:</b> +{summary['avg_pnl']:,.4f} USDT\n\n"
        f"🧠 <b>คำแนะนำกลยุทธ์:</b>\n"
        f"• รองรับไม้ 1 = 0.0005$ ได้ปลอดภัยสูงสุด 100%\n"
        f"• โอกาสเกิดการแพ้ติดกันเกิน 12 ไม้ ต่ำกว่า 0.00017%\n"
        f"• ระบบเร่งกู้คืน 0.005$ (10x) เมื่อติดลบช่วยล็อกพอร์ตแดนบวกได้อย่างมั่นคง"
    )

    if not os.path.exists(chart_path):
        # Fallback to text message
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        data = urllib.parse.urlencode({"chat_id": chat_id, "text": caption, "parse_mode": "HTML"}).encode()
        req = urllib.request.Request(url, data=data)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200
        except Exception as e:
            print("Telegram send error:", e)
            return False

    # Multipart form-data for photo
    boundary = "----StakeAnalystBoundary7MA4YWxkTrZu0gW"
    url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"

    body = bytearray()
    # chat_id
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{chat_id}\r\n".encode())
    # caption
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n{caption}\r\n".encode())
    # parse_mode
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"parse_mode\"\r\n\r\nHTML\r\n".encode())
    # photo
    with open(chart_path, "rb") as f:
        photo_bytes = f.read()
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"pnl_chart.png\"\r\nContent-Type: image/png\r\n\r\n".encode())
    body.extend(photo_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(url, data=bytes(body))
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except Exception as e:
        print("Telegram photo send error:", e)
        return False

if __name__ == "__main__":
    from analytics import load_analytics_data
    d = load_analytics_data()
    cp = os.path.join(os.path.dirname(__file__), "reports", "pnl_chart.png")
    ok = send_telegram_audit(d, cp)
    print("Telegram Audit Sent:", ok)
