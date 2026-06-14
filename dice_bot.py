import socket
socket.setdefaulttimeout(30)
import requests
import undetected_chromedriver as uc
import time
import json
import random
import csv
import os
import uuid
import threading
import sys
import math
import subprocess
from datetime import datetime

# Force UTF-8 for Windows console
if os.name == 'nt':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

# ============================================================
#  LOAD USER CONFIG (รองรับ --config profile)
# ============================================================
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# รับ --config argument เช่น: python dice_bot.py --config config_user2.json
_config_arg = "config.json"
if "--config" in sys.argv:
    idx = sys.argv.index("--config")
    if idx + 1 < len(sys.argv):
        _config_arg = sys.argv[idx + 1]

_CONFIG_FILE = os.path.join(_BASE_DIR, _config_arg)

# Stats file แยกตาม profile เช่น config_user2.json -> dice_stats_user2.json
_profile_suffix = _config_arg.replace("config", "").replace(".json", "") or ""
_STATS_FILE   = os.path.join(_BASE_DIR, f"dice_stats{_profile_suffix}.json")
_HISTORY_FILE = os.path.join(_BASE_DIR, f"dice_history{_profile_suffix}.csv")
_EVENT_LOG    = os.path.join(_BASE_DIR, f"dice_events{_profile_suffix}.log")
_DAILY_REPORT = os.path.join(_BASE_DIR, f"daily_accounting_report{_profile_suffix}.csv")
_DEPOSIT_FILE = os.path.join(_BASE_DIR, f"deposit_history{_profile_suffix}.csv")

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

import logging

from logging.handlers import RotatingFileHandler

# ==========================================
# 1. ตั้งค่าระบบ Logging
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        RotatingFileHandler(
            os.path.join(_BASE_DIR, f"hot_reload_audit{_profile_suffix}.log"),
            maxBytes=5*1024*1024,
            backupCount=3,
            encoding='utf-8'
        ),
        logging.StreamHandler()
    ]
)

class SkillManager(FileSystemEventHandler):
    def __init__(self, config_path):
        self.config_path = config_path
        # Default fallback skills
        self.ai_skills = {
            "isolated_wins_threshold": 16,
            "loss_streak_threshold": 4,
            "sawtooth_length": 6,
            "loss_streak_escape_wins": 2,
            "loss_streak_mid_step": 8,
            "loss_streak_mid_threshold": 3,
            "loss_streak_mid_escape_wins": 3,
            "loss_streak_high_step": 14,
            "loss_streak_high_threshold": 1,
            "loss_streak_high_escape_wins": 3,
            "loss_streak_high_min_virtual_rolls": 8
        }
        self.load_skills()

    def load_skills(self):
        try:
            # ป้องกัน I/O Race Condition
            time.sleep(0.1)
            with open(self.config_path, 'r', encoding="utf-8") as f:
                new_skills = json.load(f)
                
            # ==========================================
            # เริ่มขั้นตอน Schema Validation
            # ==========================================
            expected_schema = {
                "isolated_wins_threshold": int,
                "loss_streak_threshold": int,
                "sawtooth_length": int
            }
            optional_int_schema = {
                "loss_streak_escape_wins": int,
                "loss_streak_mid_step": int,
                "loss_streak_mid_threshold": int,
                "loss_streak_mid_escape_wins": int,
                "loss_streak_high_step": int,
                "loss_streak_high_escape_wins": int,
                "loss_streak_high_threshold": int,
                "loss_streak_high_min_virtual_rolls": int
            }
            
            # เช็ค Key Existence และ Type Checking
            for key, expected_type in expected_schema.items():
                if key not in new_skills:
                    raise ValueError(f"คีย์ที่จำเป็นสูญหาย: '{key}'")
                if not isinstance(new_skills[key], expected_type) or isinstance(new_skills[key], bool):
                    raise TypeError(f"คีย์ '{key}' ต้องเป็นตัวเลข ({expected_type.__name__}) เท่านั้น")
            for key, expected_type in optional_int_schema.items():
                if key in new_skills and (not isinstance(new_skills[key], expected_type) or isinstance(new_skills[key], bool)):
                    raise TypeError(f"คีย์ '{key}' ต้องเป็นตัวเลข ({expected_type.__name__}) เท่านั้น")

            # เช็ค Value Constraints
            if new_skills["loss_streak_threshold"] <= 0:
                raise ValueError("loss_streak_threshold ต้องมีค่ามากกว่า 0")
            if new_skills["sawtooth_length"] < 2:
                raise ValueError("sawtooth_length ต้องมีความยาวอย่างน้อย 2")
            if new_skills.get("loss_streak_escape_wins", 2) <= 0:
                raise ValueError("loss_streak_escape_wins ต้องมีค่ามากกว่า 0")
            if new_skills.get("loss_streak_mid_step", 8) < 0:
                raise ValueError("loss_streak_mid_step ต้องไม่ติดลบ")
            if new_skills.get("loss_streak_mid_threshold", 3) <= 0:
                raise ValueError("loss_streak_mid_threshold ต้องมีค่ามากกว่า 0")
            if new_skills.get("loss_streak_mid_escape_wins", 3) <= 0:
                raise ValueError("loss_streak_mid_escape_wins ต้องมีค่ามากกว่า 0")
            if new_skills.get("loss_streak_high_step", 14) < 0:
                raise ValueError("loss_streak_high_step ต้องไม่ติดลบ")
            if new_skills.get("loss_streak_high_escape_wins", 3) <= 0:
                raise ValueError("loss_streak_high_escape_wins ต้องมีค่ามากกว่า 0")
            if new_skills.get("loss_streak_high_threshold", 1) <= 0:
                raise ValueError("loss_streak_high_threshold ต้องมีค่ามากกว่า 0")
            if new_skills.get("loss_streak_high_min_virtual_rolls", 8) < 0:
                raise ValueError("loss_streak_high_min_virtual_rolls ต้องไม่ติดลบ")
            
            # ==========================================
            # 2. การทำ Logging เมื่อ Hot Reload สำเร็จ
            # ==========================================
            old_skills = self.ai_skills.copy() # เก็บค่าเดิมไว้เทียบก่อน
            
            # Atomic Replacement
            self.ai_skills = new_skills
            
            if old_skills != self.ai_skills:
                logging.info(
                    f"🚀 [Hot Reload Success] AI Skills updated!\n"
                    f"   --> Old: {old_skills}\n"
                    f"   --> New: {self.ai_skills}"
                )
            else:
                logging.debug("⚡ [Hot Reload] File modified but values remain unchanged.")
            
        except json.JSONDecodeError:
            logging.error("⚠️ [JSON Error] โครงสร้างไฟล์ JSON ไม่สมบูรณ์ (อาจกำลังถูกเขียนทับ) บอทจะใช้ค่าเดิมต่อไป")
        except (ValueError, TypeError) as validate_err:
            logging.warning(f"🛡️ [Validation Failed] ค่า Config ไม่ปลอดภัย: {validate_err} -> บอทจะใช้ค่าเดิมต่อไป")
        except Exception:
            logging.exception("⚠️ [Unknown Error] โหลด AI Skills ล้มเหลว")

    def on_modified(self, event):
        # normalize paths to prevent cross-platform issues
        if os.path.normpath(self.config_path) in os.path.normpath(event.src_path):
            self.load_skills()

def _load_config():
    if not os.path.exists(_CONFIG_FILE):
        print(f"[ERROR] ไม่พบไฟล์ {_config_arg} กรุณาสร้างไฟล์ก่อนรัน")
        sys.exit(1)
    with open(_CONFIG_FILE, "r", encoding="utf-8-sig") as f:
        return json.load(f)

_CFG = _load_config()
print(f"[CONFIG] Profile: {_config_arg}")

TELEGRAM_TOKEN   = _CFG["telegram"]["token"]
TELEGRAM_CHAT_ID = _CFG["telegram"]["chat_id"]
_PROFILE_NAMES = {
    "config.json": "watt29",
    "config_account3.json": "Win29",
    "config_account4.json": "Gen45"
}
_CURRENT_PROFILE = _PROFILE_NAMES.get(_config_arg, _config_arg.replace(".json", ""))
STATS_FILE   = _STATS_FILE
HISTORY_FILE = _HISTORY_FILE
EVENT_LOG    = _EVENT_LOG

_fin = _CFG.get("financial", {})
LIFETIME_DEFICIT = _fin.get("lifetime_deficit", 0.0)

# Global state sharing between threads
_bot_state = {}
_stop_event = threading.Event()
_active_bot = None  # Reference to bot instance for tip commands

def load_stats():
    """Load stats from JSON file."""
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {
        "total_profit": 0.0,
        "total_bets": 0,
        "wins": 0,
        "losses": 0,
        "max_loss_streak": 0,
        "max_single_loss": 0.0,

        # W-W Trackers
        "real_consecutive_wins": 0,
        "recent_all_bets": [], # To replace the "recent" list

        "last_fib_step": 0,
        "last_condition": None,
        "initial_balance": 0.0,
        "total_withdrawn": _fin.get("total_withdrawn", 0.0),
        "total_deposited": 0.0,
        "max_fib_step": 0,
        "initial_capital": _fin.get("initial_capital", 0.0),
        "locked_profit": 0.0,
        "reserve_fund": 0.0,
        "peak_equity": 0.0,
        "max_drawdown": 0.0,
        "total_uptime_seconds": 0
    }

def _save_stats_worker(stats):
    try:
        with open(STATS_FILE, "w") as f:
            json.dump(stats, f, indent=4)
    except: pass

def save_stats(stats):
    """Save stats to JSON file."""
    threading.Thread(target=_save_stats_worker, args=(stats.copy(),), daemon=True).start()

def log_event(message):
    """บันทึกเหตุการณ์สำคัญลงไฟล์เพื่อให้คนอ่านย้อนหลังได้ง่าย"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(EVENT_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except:
        pass

def _tg_worker(url, payload):
    try: requests.post(url, json=payload, timeout=10)
    except: pass


def get_fib_multiplier(n):
    if n <= 0: return 1
    if n == 1: return 1
    a, b = 1, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def tg(msg, reply_markup=None):
    """Corporate Reporting System (CEO to Board)"""
    full_msg = f"👤 [<b>{_CURRENT_PROFILE}</b>]\n{msg}"
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": full_msg, "parse_mode": "HTML"}
    if reply_markup: payload["reply_markup"] = reply_markup
    threading.Thread(target=_tg_worker, args=(url, payload), daemon=True).start()

def tg_edit(chat_id, message_id, msg, reply_markup=None):
    """Edit existing message (for callback updates)"""
    full_msg = f"👤 [<b>{_CURRENT_PROFILE}</b>]\n{msg}"
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/editMessageText"
    payload = {"chat_id": chat_id, "message_id": message_id, "text": full_msg, "parse_mode": "HTML"}
    if reply_markup: payload["reply_markup"] = reply_markup
    threading.Thread(target=_tg_worker, args=(url, payload), daemon=True).start()

def log_deposit_to_csv(amount, current_balance):
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        file_exists = os.path.exists(_DEPOSIT_FILE)
        with open(_DEPOSIT_FILE, "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Timestamp", "DepositAmount", "BalanceAfter"])
            writer.writerow([now, f"{amount:.8f}", f"{current_balance:.8f}"])
    except: pass

def tg_answer_callback(callback_query_id):
    """Acknowledge callback query to remove loading spinner"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerCallbackQuery"
    threading.Thread(target=_tg_worker, args=(url, {"callback_query_id": callback_query_id}), daemon=True).start()

def main_menu_markup():
    """Main menu inline keyboard"""
    return {
        "inline_keyboard": [
            [
                {"text": "📊 สถานะ", "callback_data": "/status"},
                {"text": "💰 กำไร/ขาดทุน", "callback_data": "/profit"}
            ],
            [
                {"text": "ℹ️ ข้อมูลบอท", "callback_data": "/info"},
                {"text": "🏥 สุขภาพบอท", "callback_data": "/health"}
            ],
            [
                {"text": "🎯 ตั้งเป้ากำไร", "callback_data": "tp_menu"},
                {"text": "🛑 ตั้งจุดพักบอท", "callback_data": "sl_menu"}
            ],
            [
                {"text": "📄 รายงานบัญชี", "callback_data": "/report"},
                {"text": "📥 ประวัติเติมเงิน", "callback_data": "/deposits"}
            ],
            [
                {"text": "⚙️ การตั้งค่า", "callback_data": "/config"},
                {"text": "💸 โอนเหรียญ (Tip)", "callback_data": "tip_menu"}
            ],
            [
                {"text": "♻️ รีสตาร์ท / หยุดบอท", "callback_data": "/stop"}
            ]
        ]
    }

def tp_menu_markup():
    """Take Profit preset buttons"""
    return {
        "inline_keyboard": [
            [
                {"text": "🎯 +5 TRX",  "callback_data": "/tp 5"},
                {"text": "🎯 +10 TRX", "callback_data": "/tp 10"},
                {"text": "🎯 +20 TRX", "callback_data": "/tp 20"}
            ],
            [
                {"text": "🎯 +50 TRX",  "callback_data": "/tp 50"},
                {"text": "🎯 +100 TRX", "callback_data": "/tp 100"},
                {"text": "🎯 +200 TRX", "callback_data": "/tp 200"}
            ],
            [{"text": "◀️ กลับเมนูหลัก", "callback_data": "main_menu"}]
        ]
    }

def sl_menu_markup():
    """Stop Loss preset buttons"""
    return {
        "inline_keyboard": [
            [
                {"text": "🛑 -5 TRX",  "callback_data": "/sl 5"},
                {"text": "🛑 -10 TRX", "callback_data": "/sl 10"},
                {"text": "🛑 -20 TRX", "callback_data": "/sl 20"}
            ],
            [
                {"text": "🛑 -50 TRX",  "callback_data": "/sl 50"},
                {"text": "🛑 -100 TRX", "callback_data": "/sl 100"},
                {"text": "🛑 -200 TRX", "callback_data": "/sl 200"}
            ],
            [{"text": "◀️ กลับเมนูหลัก", "callback_data": "main_menu"}]
        ]
    }

def corporate_heartbeat():
    """Heartbeat System: Periodic Pulse Check for the Board of Directors"""
    while not _stop_event.is_set():
        time.sleep(1800) # Heartbeat every 30 minutes
        if _bot_state.get('active', False):
            profit = _bot_state.get('profit', 0)
            balance = _bot_state.get('balance', 0)
            bets = _bot_state.get('bets', 0)
            wins = _bot_state.get('wins', 0)
            wr = (wins / bets * 100) if bets > 0 else 0
            tp = _bot_state.get('take_profit', 0)
            progress = (profit / tp * 100) if tp > 0 else 0
            p_icon = "🟢" if profit >= 0 else "🔴"
            uptime = _bot_state.get('total_uptime_seconds', 0)

            tg(
                f"💓 <b>รายงานสถานะ (ทุก 30 นาที)</b>\n"
                f"━━━━━━━━━━━━━━━━\n"
                f"💰 Balance  : <b>{balance:.4f} TRX</b>\n"
                f"{p_icon} P/L     : <b>{profit:+.4f} TRX</b>\n"
                f"📊 Win Rate : <b>{wr:.1f}%</b>\n"
                f"🎰 Bets     : <b>{bets:,}</b>\n"
                f"📍 Step     : <b>{_bot_state.get('fib_step', 1)}</b>\n"
                f"⏱️ Uptime   : <b>{uptime//3600}h {(uptime%3600)//60}m</b>",
                reply_markup=main_menu_markup()
            )

# ============================================================
#  TELEGRAM COMMAND MENU (Background Thread)
# ============================================================
_tg_offset   = 0      # last update_id processed

def _handle_command(cmd: str, show_menu=False):
    s = _bot_state
    if cmd == "/status":
        wr = (s.get('wins', 0) / s['bets'] * 100) if s.get('bets', 0) > 0 else 0
        balance = s.get('balance', 0)
        withdrawn = s.get('total_withdrawn', 300.0)
        initial_cap = s.get('initial_capital', 1243.154)
        
        # CORPORATE CALCULATION
        net_value = balance + withdrawn
        real_net_profit = net_value - initial_cap
        roi = (real_net_profit / initial_cap * 100) if initial_cap > 0 else 0
        unrealized = balance - (initial_cap - withdrawn)
        
        # Signal a refresh on the next bet
        s['force_balance_check'] = True
        
        tg(
            f"📊 <b>COMPANY STYLE PORTFOLIO</b>\n"
            f"--------------------------------\n"
            f"🏦 <b>CAPITAL ACCOUNT</b>\n"
            f"• Initial Deposit : {initial_cap:.3f} TRX\n"
            f"--------------------------------\n"
            f"💵 <b>TREASURY</b>\n"
            f"• Current Equity  : {balance:.8f} TRX\n"
            f"• Realized Profit : {withdrawn:.2f} TRX\n"
            f"• Unrealized Prof : {unrealized:+.4f} TRX\n"
            f"--------------------------------\n"
            f"📈 <b>PERFORMANCE</b>\n"
            f"• Real Net Profit : {real_net_profit:+.4f} TRX\n"
            f"• ROI             : {roi:+.2f}%\n"
            f"• Peak Equity     : {s.get('peak_equity', 0):.2f} TRX\n"
            f"• Max Drawdown    : {s.get('max_drawdown', 0):.2f} TRX\n"
            f"--------------------------------\n"
            f"🎰 Bets: {s.get('bets', 0):,} | WR: {wr:.1f}%\n"
            f"<i>Reported by: Board of Directors Bot</i>"
        )
    elif cmd == "/deposits":
        balance = s.get('balance', 0)
        msg = f"💰 <b>ยอดเงินคงเหลือปัจจุบัน:</b> {balance:.4f} TRX\n"
        msg += "--------------------------------\n"
        
        if os.path.exists(_DEPOSIT_FILE):
            try:
                with open(_DEPOSIT_FILE, "r", encoding="utf-8-sig") as f:
                    lines = f.readlines()
                if len(lines) > 1:
                    recent = lines[1:][-10:] # Skip header, get last 10
                    latest_line = recent[-1]
                    parts = latest_line.strip().split(',')
                    if len(parts) >= 3:
                        msg += f"⚡ <b>ยอดเติมล่าสุด:</b> +{parts[1]} TRX ({parts[0]})\n"
                    
                    msg += "--------------------------------\n"
                    msg += "📥 <b>ประวัติย้อนหลัง (สูงสุด 10 ครั้ง)</b>\n"
                    for line in reversed(recent): # Show newest first
                        parts = line.strip().split(',')
                        if len(parts) >= 3:
                            msg += f"• <b>+{parts[1]} TRX</b> | {parts[0]}\n"
                    tg(msg)
                else:
                    tg(msg + "📥 ยังไม่มีประวัติการเติมเงินในระบบครับ")
            except:
                tg("⚠️ ไม่สามารถอ่านไฟล์ประวัติการเติมเงินได้")
        else:
            tg(msg + "📥 ยังไม่มีประวัติการเติมเงินในระบบครับ")
    
    elif cmd == "/health":
        last_err = s.get('last_error', 'ไม่มี')
        err_count = s.get('error_count', 0)
        api_status = s.get('api_status', '🟢 ปกติ')
        v_state = s.get('virtual_state', 'NONE')
        v_mode = "เปิด (แทงลม)" if v_state != "NONE" else "ปิด (เงินจริง)"
        balance = s.get('balance', 0)
        
        wr = (s.get('wins', 0) / s['bets'] * 100) if s.get('bets', 0) > 0 else 0
        step = s.get('fib_step', 1)
        profit = s.get('profit', 0)
        
        status = "🟢 <b>แข็งแรงมาก (Healthy)</b>"
        advice = "บอททำงานปกติ เดินหน้าต่อได้ยาวๆ ครับ"
        if wr < 47:
            status = "🟡 <b>เฝ้าระวัง (Warning)</b>"
            advice = "ช่วงนี้ดวงตกเล็กน้อย แพ้บ่อยกว่าปกติ"
        if step >= 10:
            status = "🟠 <b>ความดันสูง (Caution)</b>"
            advice = "บอทกำลังสู้หนัก (Step 10+) ควรจับตาดูใกล้ชิด"
        if step >= 18:
            status = "🔴 <b>อันตราย (Critical)</b>"
            advice = "เสี่ยงพอร์ตแตก! พิจารณาหยุดบอทชั่วคราว"
        if profit < 0:
            advice += "\n<i>*ตอนนี้ยังอยู่ในช่วงทวงทุนคืน</i>"

        msg = (
            "🏥 <b>สถานะระบบบอท (System & Strategy Health)</b>\n"
            "--------------------------------\n"
            f"🔌 <b>API Status :</b> {api_status}\n"
            f"⚠️ <b>Last Error :</b> {last_err} ({err_count} ครั้ง)\n"
            f"🌬️ <b>Virtual Mode:</b> {v_mode}\n"
            "--------------------------------\n"
            f"📊 <b>Strategy   :</b> {status}\n"
            f"🎯 <b>Win Rate   :</b> {wr:.1f}%\n"
            f"📈 <b>Fib Step   :</b> ขั้นที่ {step}\n"
            "--------------------------------\n"
            f"🩺 <b>คำแนะนำ:</b>\n{advice}"
        )
        tg(msg)
    elif cmd == "/profit":
        p = s.get('profit', 0)
        icon = "🟢" if p >= 0 else "🔴"
        tg(
            f"{icon} <b>PROFIT & LOSS REPORT</b>\n"
            f"Gross Profit : {p:+.8f} TRX\n"
            f"Withdrawn    : {s.get('total_withdrawn', 0):.8f} TRX\n"
            f"Deposited    : {s.get('total_deposited', 0):.8f} TRX\n"
            f"Initial Cap  : {s.get('start_balance', 0):.8f} TRX\n"
            f"Time Period  : Live Session"
        )
    elif cmd == "/info":
        # เวลาของ Session ปัจจุบัน
        session_start = s.get('session_start', datetime.now())
        session_dur = datetime.now() - session_start
        s_h, s_rem = divmod(int(session_dur.total_seconds()), 3600)
        s_m, _ = divmod(s_rem, 60)
        
        # เวลาสะสมทั้งหมด (Total Uptime)
        total_sec = s.get('total_uptime_seconds', 0)
        t_h, t_rem = divmod(total_sec, 3600)
        t_m, _ = divmod(t_rem, 60)
        
        first_start = s.get('first_run_time', 'N/A')
        wr = (s.get('wins', 0) / s['bets'] * 100) if s.get('bets', 0) > 0 else 0
        
        tg(
            f"ℹ️ <b>BOT HISTORICAL REPORT</b>\n"
            f"--------------------------------\n"
            f"🗓️ <b>First Started</b> : {first_start}\n"
            f"⏳ <b>Total Uptime</b>  : {t_h}h {t_m}m (All-time)\n"
            f"⏰ <b>This Session</b>  : {s_h}h {s_m}m\n"
            f"🎰 <b>Total Bets</b>    : {s.get('bets', 0):,}\n"
            f"--------------------------------\n"
            f"🏆 <b>ALL-TIME RECORDS</b>\n"
            f"Max Loss Streak: {s.get('max_loss_streak', 0)} ครั้ง\n"
            f"Max Step   : ขั้นที่ {s.get('max_fib_step', 0)}\n"
            f"Max Single Bet : {s.get('max_single_loss', 0):.8f} TRX\n"
            f"--------------------------------\n"
            f"⚙️ <b>STRATEGY STATS</b>\n"
            f"Win Rate      : {wr:.1f}%\n"
            f"Step      : {s.get('fib_step', 1)}\n"
            f"Condition Sw  : {s.get('switches', 0)} ครั้ง\n"
            f"Last Result   : {s.get('streak', 0)} {s.get('streak_type', '-')}\n"
            f"Current Bet   : {s.get('current_bet', 0):.8f} TRX\n"
            f"--------------------------------\n"
            f"🎯 <b>TARGETS</b>\n"
            f"Take Profit   : {s.get('take_profit', 0):+.2f} TRX\n"
            f"Auto-Reset at : {s.get('stop_loss', 0):.2f} TRX"
        )
    elif cmd == "/stop":
        tg("🛑 <b>รับคำสั่ง /stop — กำลังหยุดบอท...</b>")
        _stop_event.set()
    elif cmd.startswith("/tp"):
        try:
            val = float(cmd.split()[1])
            _bot_state['take_profit'] = val
            tg(f"🎯 <b>ตั้งเป้ากำไร (Take Profit)</b>\nหยุดเมื่อกำไรถึง: <b>{val:+.2f} TRX</b>")
        except:
            tg("❌ รูปแบบผิด! ใช้: <code>/tp 50</code>")
    elif cmd.startswith("/reset_at") or cmd.startswith("/sl"):
        try:
            val = float(cmd.split()[1])
            _bot_state['stop_loss'] = -abs(val)
            tg(f"🔄 <b>ตั้งจุดพักยกอัตโนมัติ (Auto-Reset)</b>\nบอทจะพัก 2 นาทีเมื่อติดลบถึง: <b>-{abs(val):.2f} TRX</b>")
        except:
            tg("❌ รูปแบบผิด! ใช้: <code>/reset_at 100</code>")

    elif cmd == "/config":
        tp = s.get('take_profit', 0)
        sl = s.get('stop_loss', 0)
        curr_cond = s.get('condition', 'N/A').upper()
        bet = s.get('current_bet', 0)
        tg(
            f"⚙️ <b>BOT CONFIGURATION</b>\n"
            f"------------------------\n"
            f"🎯 <b>Take Profit</b> : {tp:+.2f} TRX\n"
            f"🛑 <b>Stop Loss</b>   : {sl:.2f} TRX\n"
            f"🎲 <b>Condition</b>   : {curr_cond}\n"
            f"💵 <b>Current Bet</b> : {bet:.8f} TRX\n"
            f"🔄 <b>Auto-Reset</b>  : Enabled (2m Pause)"
        )
    elif cmd == "/reset_stats":
        if os.path.exists(STATS_FILE):
            os.remove(STATS_FILE)
        tg("🧹 <b>ล้างสถิติสะสมเรียบร้อยแล้ว!</b>\nกรุณารีสตาร์ทบอทเพื่อเริ่มนับใหม่")
    
    elif cmd.startswith("/tip"):
        parts = cmd.strip().split()
        if len(parts) == 3:
            target_user = parts[1]
            try:
                tip_amount = float(parts[2])
                if tip_amount <= 0:
                    tg("❌ จำนวนเงินต้องมากกว่า 0 ครับ")
                elif _active_bot is None:
                    tg("❌ บอทยังไม่พร้อม ลองใหม่อีกครั้ง")
                else:
                    # Execute Tip via Stake API
                    tip_query = """
                    mutation SendTip($amount: Float!, $currency: CurrencyEnum!, $username: String!) {
                      sendTip(amount: $amount, currency: $currency, targetUserName: $username) {
                        id
                        amount
                        currency
                      }
                    }
                    """
                    variables = {
                        "amount": tip_amount,
                        "currency": _active_bot.currency,
                        "username": target_user
                    }
                    tg(f"💸 กำลังโอน <b>{tip_amount:.4f} TRX</b> ไปยัง <b>{target_user}</b>...")
                    res = _active_bot._execute_graphql(tip_query, variables=variables, operation_name="SendTip")
                    if res and "data" in res and res["data"] and res["data"].get("sendTip"):
                        tip_data = res["data"]["sendTip"]
                        tg(
                            f"✅ <b>โอนเหรียญสำเร็จ!</b>\n"
                            f"📤 จาก   : <b>{_CURRENT_PROFILE}</b>\n"
                            f"📥 ถึง   : <b>{target_user}</b>\n"
                            f"💵 จำนวน : <b>{tip_amount:.4f} TRX</b>"
                        )
                    elif res and "errors" in res:
                        err = res["errors"][0].get("message", "Unknown error")
                        tg(f"❌ <b>โอนไม่สำเร็จ!</b>\nสาเหตุ: {err}")
                    else:
                        tg("❌ ไม่ได้รับการตอบกลับจาก Stake API")
            except ValueError:
                tg("❌ รูปแบบผิด! ตัวอย่าง: <code>/tip watt29 5.5</code>")
        else:
            tg(
                "💸 <b>คำสั่งโอนเหรียญ (Tip)</b>\n\n"
                "รูปแบบ: <code>/tip [username] [จำนวน]</code>\n\n"
                "ตัวอย่าง:\n"
                f"<code>/tip watt29 5.5</code>\n"
                f"<code>/tip Win29 10</code>\n"
                f"<code>/tip Gen45 2.5</code>"
            )
    
    elif cmd == "/report":
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        start_bal = _bot_state.get('start_balance', 0)
        curr_bal = _bot_state.get('balance', 0)
        profit = _bot_state.get('profit', 0)
        wagered = _bot_state.get('total_wagered', 0)
        bets = _bot_state.get('bets', 0)
        roi = (profit / start_bal * 100) if start_bal > 0 else 0
        
        core = s.get('core_capital', 900.0)
        locked = s.get('locked_profit', 0.0)
        reserve = s.get('reserve_fund', 0.0)
        operating = curr_bal - locked - reserve
        
        msg = (
            f"📄 <b>ACCOUNTING DAILY REPORT</b>\n"
            f"--------------------------------\n"
            f"📅 Date: {datetime.now().strftime('%d/%m/%Y')}\n"
            f"⏰ Time: {datetime.now().strftime('%H:%M')}\n"
            f"--------------------------------\n"
            f"💰 <b>Total Assets:</b> {curr_bal:.8f} TRX\n"
            f"📈 <b>Total Profit:</b> {profit:+.8f} TRX\n"
            f"📊 <b>Current ROI :</b> {roi:.2f}%\n"
            f"--------------------------------\n"
            f"🏢 <b>FUND BREAKDOWN</b>\n"
            f"💵 Operating  : {operating:.4f} TRX\n"
            f"🔒 Locked Prof: {locked:.4f} TRX\n"
            f"🛡️ Reserve    : {reserve:.4f} TRX\n"
            f"--------------------------------\n"
            f"🎰 Total Wagered: {wagered:.4f} TRX\n"
            f"🔢 Total Counts : {bets:,} bets\n"
            f"--------------------------------\n"
            f"<i>Reported by: Corporate Accountant Bot</i>"
        )
        tg(msg)
    else:
        _send_main_menu()

def _send_main_menu():
    tg(
        "🤖 <b>COMMANDER BRIAN — เมนูหลัก</b>\n"
        "กดปุ่มด้านล่างเพื่อดูข้อมูลหรือตั้งค่า",
        reply_markup=main_menu_markup()
    )

def _tg_listener():
    """Background thread: poll Telegram every 2s for commands."""
    global _tg_offset
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates"
    # Flush old messages on startup — skip anything already queued
    try:
        r = requests.get(url, params={"timeout": 0, "offset": -1}, timeout=5)
        updates = r.json().get("result", [])
        if updates:
            _tg_offset = updates[-1]["update_id"] + 1
    except Exception:
        pass
    while not _stop_event.is_set():
        try:
            r = requests.get(url, params={"timeout": 1, "offset": _tg_offset}, timeout=5)
            updates = r.json().get("result", [])
            for upd in updates:
                _tg_offset = upd["update_id"] + 1

                # ── ข้อความปกติ (text command) ──
                msg = upd.get("message", {})
                if msg:
                    chat_id = str(msg.get("chat", {}).get("id", ""))
                    text = msg.get("text", "").strip().lower() if msg.get("text") else ""
                    if chat_id == TELEGRAM_CHAT_ID:
                        if text in ("/start", "/menu"):
                            _send_main_menu()
                        elif text.startswith("/"):
                            _handle_command(text)

                # ── Callback query (กดปุ่ม inline keyboard) ──
                cb = upd.get("callback_query", {})
                if cb:
                    cb_id   = cb["id"]
                    cb_chat = str(cb["message"]["chat"]["id"])
                    cb_mid  = cb["message"]["message_id"]
                    data    = cb.get("data", "").strip().lower()
                    tg_answer_callback(cb_id)

                    if cb_chat != TELEGRAM_CHAT_ID:
                        continue

                    if data == "main_menu":
                        tg_edit(cb_chat, cb_mid,
                            "🤖 <b>COMMANDER BRIAN — เมนูหลัก</b>\nกดปุ่มด้านล่างเพื่อดูข้อมูลหรือตั้งค่า",
                            reply_markup=main_menu_markup())
                    elif data == "tp_menu":
                        tg_edit(cb_chat, cb_mid,
                            "🎯 <b>เลือก Take Profit</b>\nบอทจะหยุดเมื่อกำไรถึงเป้า",
                            reply_markup=tp_menu_markup())
                    elif data == "tip_menu":
                        tg_edit(cb_chat, cb_mid,
                            "💸 <b>เมนูโอนเหรียญ (Tip)</b>\n\nระบบจะโอนเงินอัตโนมัติเมื่อกำไรถึงเป้าหมาย\nหากต้องการโอนทันที พิมพ์:\n<code>/tip [username] [จำนวน]</code>\nตัวอย่าง: <code>/tip watt29 1.5</code>",
                            reply_markup={"inline_keyboard": [[{"text": "◀️ กลับเมนูหลัก", "callback_data": "main_menu"}]]})
                    elif data == "sl_menu":
                        tg_edit(cb_chat, cb_mid,
                            "🛑 <b>เลือก Stop Loss</b>\nบอทจะพัก 2 นาทีเมื่อขาดทุนถึงจุดนี้",
                            reply_markup=sl_menu_markup())
                    elif data.startswith("/"):
                        _handle_command(data)

        except Exception:
            pass
        time.sleep(1)

# ============================================================
#  STAKE DICE BOT - FIBONACCI STRATEGY + CMD DASHBOARD
# ============================================================

def clear():
    os.system('cls' if os.name == 'nt' else 'clear')

class ZScoreSeedRotator:
    def __init__(self, min_bets=200, z_threshold=-2.5, max_history=1000, on_rotate_callback=None):
        self.min_bets = min_bets
        self.z_threshold = z_threshold
        self.max_history = max_history
        self.on_rotate_callback = on_rotate_callback
        self.results = []  # List of tuples: (is_win, expected_prob)

    def add_result(self, is_win: bool, expected_prob: float):
        self.results.append((is_win, expected_prob))
        if len(self.results) > self.max_history:
            self.results.pop(0)
        if len(self.results) >= self.min_bets:
            self.evaluate_z_score()

    def evaluate_z_score(self):
        n = len(self.results)
        wins = sum(1 for is_win, _ in self.results if is_win)
        expected_wins = sum(prob for _, prob in self.results)
        variance = sum(prob * (1.0 - prob) for _, prob in self.results)
        std_dev = math.sqrt(variance)
        if std_dev == 0:
            return
        z_score = (wins - expected_wins) / std_dev
        
        if z_score <= self.z_threshold:
            print(f"\n [!] CRITICAL ALERT: Rolling Z-Score reached {z_score:.2f}!")
            print(f" [!] SYSTEM: Bad streak detected. Rotating client & server seeds immediately to reset RNG...\n")
            if self.on_rotate_callback:
                self.on_rotate_callback(z_score)
            self.results.clear()

class StakeDiceBot:
    def __init__(self, token, cookies, currency="trx", simulate=False, mirror_host="stake.games", proxy="", skill_manager=None):
        self.token = token
        self.skill_manager = skill_manager
        self.api_url = f"https://{mirror_host}/_api/graphql"
        self.currency = currency.lower()
        self.simulate = simulate
        self.history_file = HISTORY_FILE
        self.token = token
        
        options = uc.ChromeOptions()
        options.headless = False
        if proxy:
            options.add_argument(f'--proxy-server={proxy}')
            
        print(" [SYSTEM] Starting Browser for Cloudflare bypass...")
        self.driver = uc.Chrome(options=options, version_main=148)
        self.driver.set_script_timeout(10)
        self.driver.get(f"https://{mirror_host}/")
        time.sleep(5)  # Wait longer for Cloudflare to clear itself first
        try:
            self.driver.uc_gui_click_captcha()
            time.sleep(2)
        except Exception:
            pass

        # Only inject LONG-LIVED cookies (session token + preferences)
        # Do NOT inject Cloudflare cookies (_cf_bm, cf_clearance, _cfuvid)
        # because those expire in 30 min and Chrome will get new ones automatically
        SKIP_COOKIES = {'_cf_bm', '_cfuvid', 'cf_clearance', '__cfwaitingroom_stake_com', '_dd_s'}
        injected = 0
        for cookie in cookies.split("; "):
            if "=" in cookie:
                k, v = cookie.split("=", 1)
                k = k.strip()
                if k not in SKIP_COOKIES:
                    try:
                        self.driver.add_cookie({"name": k, "value": v.strip(), "domain": f".{mirror_host}", "path": "/"})
                        injected += 1
                    except Exception:
                        pass

        print(f" [SYSTEM] Injected {injected} session cookies (Cloudflare cookies auto-managed)")
        self.driver.refresh()
        time.sleep(5)
        try:
            self.driver.uc_gui_click_captcha()
            time.sleep(2)
        except Exception:
            pass
        print(" [SYSTEM] Browser initialized and cookies injected.")
        
        # Initialize Z-Score Seed Rotator
        self.z_rotator = ZScoreSeedRotator(
            min_bets=200,
            z_threshold=-2.5,
            max_history=1000,
            on_rotate_callback=self._handle_z_rotation
        )

    def _handle_z_rotation(self, z_score):
        import secrets
        new_seed = secrets.token_hex(16)
        changed = self.change_client_seed(new_seed)
        rotated = self.rotate_seed(f"Z-Score {z_score:.2f} Triggered")
        if changed and rotated:
            tg(f"🐉 <b>Z-Score Circuit Breaker Triggered ({z_score:.2f})</b>\n"
               f"ระบบเปลี่ยน Client Seed & Server Seed สำเร็จ!\n"
               f"Client Seed ใหม่: <code>{new_seed}</code>")

    def change_client_seed(self, new_seed):
        mutation = """
        mutation ChangeClientSeed($clientSeed: String!) {
          changeClientSeed(clientSeed: $clientSeed) {
            id
            clientSeed
          }
        }
        """
        try:
            res = self._execute_graphql(mutation, variables={"clientSeed": new_seed})
            data = res.get("data") if res else None
            if data and data.get("changeClientSeed"):
                self.log_event(f"Changed Client Seed to: {new_seed}")
                return True
            else:
                error_list = res.get("errors") if res else []
                error_msg = error_list[0].get("message", "Unknown API rejection") if error_list else "No response"
                self.log_event(f"Client Seed Change Rejected: {error_msg}")
        except Exception as e:
            self.log_event(f"Client Seed Change Error: {str(e)}")
        return False

    def __del__(self):
        try:
            self.driver.quit()
        except:
            pass

        if not os.path.exists(self.history_file):
            with open(self.history_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(["Timestamp", "Mode", "Step", "BetAmount", "Target", "Condition", "Result", "Payout", "Status", "Streak", "StreakType"])

    def log_event(self, message):
        log_event(message)

    def rotate_seed(self, reason="Adaptive"):
        import secrets
        new_client_seed = secrets.token_hex(16)
        # ใช้ rotateServerSeed ซึ่งเป็นวิธีมาตรฐานที่เว็บยอมรับ (หมุนทั้ง Server และ Client Seed)
        mutation = """
        mutation RotateServerSeed {
          rotateServerSeed {
            id
            seed
          }
        }
        """
        try:
            res = self.query(mutation)
            data = res.get("data") if res else None
            
            self.next_rotation_bet = self.get_total_bets_from_stats() + random.randint(800, 1500)
            if data and data.get("rotateServerSeed"):
                msg = f"🔄 <b>Seed Rotated ({reason})</b>\nระบบทำการหมุน Seed ใหม่เรียบร้อยแล้ว\n<i>*Server Seed Reset สำเร็จ</i>"
                self.log_event(f"🔄 Seed Rotated ({reason}): Server seed changed successfully.")
                tg(msg)
                return True
            else:
                error_list = res.get("errors") if res else []
                error_msg = error_list[0].get("message", "Unknown API rejection") if error_list else "No response from API"
                self.log_event(f"⚠️ Seed Rotation Rejected: {error_msg}")
                # tg(f"⚠️ <b>API Seed Rotation Rejected</b>\nเหตุผล: {error_msg}") # Don't spam TG for minor rotation failure
        except Exception as e:
            self.log_event(f"⚠️ Seed Rotation Error: {str(e)}")
        return False

    def get_total_bets_from_stats(self):
        """ดึงจำนวน Bet ปัจจุบันจากสถานะล่าสุด"""
        return _bot_state.get('bets', 0)

    def save_daily_report(self, start_bal, end_bal, profit, wagered, deposits=0, withdrawals=0):
        """บันทึกบัญชีรายวันสำหรับบริษัท (CSV)"""
        filename = _DAILY_REPORT
        file_exists = os.path.exists(filename)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        date_today = datetime.now().strftime("%Y-%m-%d")
        
        try:
            with open(filename, "a", newline="", encoding="utf-8-sig") as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(["Date", "Timestamp", "Opening Balance", "Closing Balance", "Net Profit", "Total Wagered", "Deposits", "Withdrawals"])
                writer.writerow([date_today, now, f"{start_bal:.8f}", f"{end_bal:.8f}", f"{profit:.8f}", f"{wagered:.8f}", f"{deposits:.8f}", f"{withdrawals:.8f}"])
            self.log_event(f"📈 Daily Accounting Report Saved: {date_today}")
        except Exception as e:
            self.log_event(f"⚠️ Failed to save daily report: {str(e)}")

    def _execute_graphql(self, query, variables=None, operation_name=None):
        payload = {"query": query}
        if variables: payload["variables"] = variables
        if operation_name: payload["operationName"] = operation_name
        script = """
        window.__gql_result = "PENDING";
        fetch('/_api/graphql', {
            method: 'POST',
            headers: {'content-type': 'application/json', 'x-access-token': '%s'},
            body: JSON.stringify(%s)
        }).then(r => r.json()).then(data => { window.__gql_result = JSON.stringify(data); }).catch(e => { window.__gql_result = "ERROR: " + e; });
        """ % (self.token, __import__('json').dumps(payload))
        import time as _time
        try:
            if "Just a moment" in self.driver.title or "Cloudflare" in self.driver.title:
                return {"errors": [{"message": "Cloudflare Challenge Active"}]}
            self.driver.execute_script(script)
            for _ in range(20):
                _time.sleep(0.5)
                res = self.driver.execute_script("return window.__gql_result;")
                if res != "PENDING":
                    if res is None: return {"errors": [{"message": "JS Fetch Timeout (Page Reloaded)"}]}
                    if isinstance(res, str) and res.startswith("ERROR:"): return {"errors": [{"message": res}]}
                    return __import__('json').loads(res) if isinstance(res, str) else res
            return {"errors": [{"message": "JS Fetch Timeout"}]}
        except Exception as e:
            return {"errors": [{"message": f"JS Fetch Timeout ({str(e)})"}]}

    def query(self, query, variables=None):
        return self._execute_graphql(query, variables)

    def get_wallet_balance(self):
        query = """
        query Balances {
          user {
            balances {
              available { amount currency }
            }
          }
        }
        """
        for attempt in range(5):
            try:
                print(f"   [NET] Sending Balance Query to Stake via Browser (Attempt {attempt+1})...")
                data = self._execute_graphql(query, operation_name="Balances")
                print(f"   [NET] Response Received")
                if "errors" in data:
                    err = data["errors"][0].get("message", "Unknown Error")
                    print(f"   [!] Stake API Error: {err}")
                    # If Stake asks to try again, wait 60 seconds automatically
                    if "try again" in err.lower() or "rate limit" in err.lower():
                        print("   [!] Auto-Cooling down for 60 seconds...")
                        time.sleep(60)
                    continue
                    
                if not data or "data" not in data or not data["data"]:
                    print("   [NET] Warning: No data in response.")
                    continue
                    
                user_data = data["data"].get("user")
                if not user_data: 
                    print("   [!] Session possibly EXPIRED (User is null). Please update COOKIES.")
                    time.sleep(10)
                    continue
                    
                balances = user_data.get("balances", [])
                for bal in balances:
                    if bal and bal.get("available") and bal["available"].get("currency") == self.currency:
                        return float(bal["available"]["amount"])
                
                print(f"   [!] Currency {self.currency} not found in balances.")
                return 0.0
            except Exception:
                time.sleep(2 ** attempt)
        return 0.0

    def claim_rakeback(self):
        query = """
        mutation ClaimRakeback {
          claimRakeback {
            amount
            currency
          }
        }
        """
        try:
            print(" [SYSTEM] Attempting to Auto-Claim Rakeback...")
            self.log_event("🔄 Attempting to Auto-Claim Rakeback...")
            res = self._execute_graphql(query, operation_name="ClaimRakeback")
            if res and "data" in res and res["data"]:
                print(" [SYSTEM] ✅ Rakeback Claimed Successfully!")
                self.log_event("✅ Rakeback Claimed Successfully!")
                tg("🎁 <b>ระบบ Auto-Claim Rakeback สำเร็จ!</b>\nรับเงินคืนเข้ากระเป๋าเรียบร้อยแล้ว")
                return True
            else:
                if res and "errors" in res:
                    err = res["errors"][0].get("message", "Unknown Error")
                    print(f" [SYSTEM] ⚠️ Rakeback claim error: {err}")
                    self.log_event(f"⚠️ Rakeback claim error: {err}")
                else:
                    print(" [SYSTEM] ⚠️ Rakeback claim returned empty response")
                    self.log_event("⚠️ Rakeback claim returned empty response")
        except Exception as e:
            print(f" [SYSTEM] ⚠️ Rakeback claim exception: {str(e)}")
            self.log_event(f"⚠️ Rakeback claim exception: {str(e)}")
        return False

    def place_dice_bet(self, amount, target, condition):
        operation_name = "DiceRoll"
        query = """
        mutation DiceRoll($amount: Float!, $target: Float!, $condition: CasinoGameDiceConditionEnum!, $currency: CurrencyEnum!, $identifier: String!) {
          diceRoll(amount: $amount, target: $target, condition: $condition, currency: $currency, identifier: $identifier) {
            id
            amount
            payout
            state {
              ... on CasinoGameDice {
                result
                target
                condition
              }
            }
          }
        }
        """
        variables = {
            "amount": round(amount, 8),
            "target": target,
            "condition": condition,
            "currency": self.currency,
            "identifier": uuid.uuid4().hex[:12]
        }

        if self.simulate:
            result = round(random.uniform(0, 100), 2)
            is_win = (condition == "above" and result > target) or (condition == "below" and result < target)
            payout = amount * 2 if is_win else 0
            return {"data": {"diceRoll": {"id": "simulated", "amount": amount, "payout": payout, "state": {"result": result}}}}

        for attempt in range(5):
            try:
                print(f"   [NET] Sending Bet Query (Attempt {attempt+1})...")
                result = self._execute_graphql(query, variables=variables, operation_name=operation_name)
                if result and "data" in result and result["data"]:
                    return result
                if result and "errors" in result:
                    err_msg = str(result["errors"][0].get("message", ""))
                    print(f"   [!] API Error (Attempt {attempt+1}): {err_msg}")
                    if "cloudflare" in err_msg.lower() or "challenge" in err_msg.lower():
                        print("   [🔒] Cloudflare challenge active! Please check the browser window and solve the captcha.")
                        time.sleep(5)
                    elif "rate limit" in err_msg.lower() or "too many" in err_msg.lower():
                        self.log_event("⏳ API Rate Limit detected. Cooling down...")
                        time.sleep(15)
                    else:
                        time.sleep(2)
            except Exception as e:
                print(f"   [!] Bet exception (Attempt {attempt+1}): {str(e)}")
                time.sleep(2 ** attempt)
        return None

    def _log_to_csv_worker(self, row):
        try:
            with open(self.history_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(row)
        except: pass

    def log_to_csv(self, row):
        threading.Thread(target=self._log_to_csv_worker, args=(row,), daemon=True).start()

    def start_dice_bot(self, base_bet, target=48.00, condition="below"):
        session_wins = 0
        balance = 0.0
        print(" [SYSTEM] Loading persistent stats...")
        persistent = load_stats()
        total_profit = persistent.get("total_profit", 0.0)
        total_bets = persistent.get("total_bets", 0)
        total_wagered = persistent.get("total_wagered", 0.0)
        wins = persistent.get("wins", 0)
        losses = persistent.get("losses", 0)
        max_loss_streak = persistent.get("max_loss_streak", 0)
        max_single_loss = persistent.get("max_single_loss", 0.0)
        fib_step = persistent.get("last_fib_step", 0)
        saved_condition = persistent.get("last_condition")
        current_condition = saved_condition if saved_condition else condition
        if current_condition == "above":
            target = 52.00
        else:
            target = 48.00
        total_withdrawn = persistent.get("total_withdrawn", 300.0)
        total_deposited = persistent.get("total_deposited", 0.0)
        max_fib_step = persistent.get("max_fib_step", 0)
        start_balance = persistent.get("initial_balance", 0.0)
        initial_capital = persistent.get("initial_capital", 1243.154)
        peak_equity = persistent.get("peak_equity", 0.0)
        max_drawdown = persistent.get("max_drawdown", 0.0)

        print(" [DEBUG] 1. Setting up strategy variables...")
        # Fibonacci system initialized
        
        print(" [DEBUG] 2. Initializing session parameters...")
        self.next_rotation_bet = random.randint(800, 1500)
        self.last_manual_rotation_alert = 0
        last_high_stress_rotation_time = 0
        recent = []
        last_result = "-"
        last_roll = 0.0
        last_net = 0.0
        streak = 0
        streak_type = None
        current_loss_streak = 0
        real_consecutive_wins = 0
        real_bets_without_ww = persistent.get("real_bets_without_ww", 0)
        
        virtual_state = "NONE"
        virtual_escape_pattern = ['W']
        virtual_entry_step = 0
        virtual_min_rolls = 0
        virtual_rolls_seen = 0
        
        cycle_start_balance = 0.0
        
        BET_ALERT_MULTIPLIERS = [1000, 2000, 5000, 10000]
        STREAK_MILESTONES    = {15, 20, 25, 30, 35} 
        condition_switches = 0
        BALANCE_REPORT_EVERY = 500
        current_highest_alert = 0 
        take_profit = persistent.get("take_profit", 0.0)
        stop_loss = persistent.get("stop_loss", 0.0)
        total_uptime_seconds = persistent.get("total_uptime_seconds", 0)
        
        print(" [DEBUG] 3. Starting Background Threads...")
        _bot_state['session_start'] = datetime.now()
        _bot_state['active'] = True
        global _active_bot
        _active_bot = self

        listener = threading.Thread(target=_tg_listener, daemon=True)
        listener.start()
        threading.Thread(target=corporate_heartbeat, daemon=True).start()

        # แจ้ง Telegram พร้อม inline menu
        tg(
            "🟢 <b>COMMANDER BRIAN เริ่มทำงานแล้ว!</b>\n"
            f"💱 Currency: <b>{self.currency.upper()}</b> | Mode: <b>{'SIMULATE' if self.simulate else 'LIVE'}</b>\n"
            "กดปุ่มด้านล่างเพื่อควบคุมบอท",
            reply_markup=main_menu_markup()
        )

        print(" [DEBUG] 4. Entering Main Betting Loop...")
        last_time = datetime.now()
        take_profit = persistent.get("take_profit", 0.0)
        stop_loss = persistent.get("stop_loss", 0.0)
        total_uptime_seconds = persistent.get("total_uptime_seconds", 0)
        first_run_time = persistent.get("first_run_time")
        if not first_run_time:
            first_run_time = datetime.now().strftime("%Y-%m-%d %H:%M")
            persistent["first_run_time"] = first_run_time
            save_stats(persistent)
        
        _bot_state['first_run_time'] = first_run_time
        _bot_state['total_uptime_seconds'] = total_uptime_seconds
        last_time = datetime.now()
        
        # Pre-initialize balance to avoid UnboundLocalError
        print(" [SYSTEM] Initializing balance...")
        balance = self.get_wallet_balance()
        if balance == 0:
            # Try one more time or wait
            time.sleep(2)
            balance = self.get_wallet_balance()

        # Removed recovery_mode

        while True:
            try:
                now = datetime.now()
                delta_sec = int((now - last_time).total_seconds())
                total_uptime_seconds += delta_sec
                last_time = now
                _bot_state['total_uptime_seconds'] = total_uptime_seconds
                
                take_profit = _bot_state.get('take_profit', 0.0)
                stop_loss = _bot_state.get('stop_loss', 0.0)

                if start_balance == 0:
                    print(" [SYSTEM] Fetching initial balance from Stake...")
                    balance = self.get_wallet_balance()
                    if balance == 0:
                        print(" [!] ERROR: Could not fetch balance. Check your COOKIES or Internet Connection.")
                        time.sleep(5)
                        continue
                    
                    # Auto claim rakeback at startup
                    self.claim_rakeback()
                    balance = self.get_wallet_balance()
                    # Successfully connected! Now clear and show dashboard
                    # Start the Heartbeat System (Paperclip Mode)
                    threading.Thread(target=corporate_heartbeat, daemon=True).start()
    
                    _bot_state['active'] = True
                    start_balance = balance
                    _bot_state['start_balance'] = balance
                    cycle_start_balance = balance
                    persistent["initial_balance"] = start_balance
                    if take_profit == 0:
                        take_profit = round(start_balance * 0.01, 2)
                        _bot_state['take_profit'] = take_profit
                    if stop_loss == 0:
                        stop_loss = -round(start_balance * 0.10, 2)
                        _bot_state['stop_loss'] = stop_loss
                    save_stats(persistent)
                else:
                    # Fast Mode: only fetch real balance every 100 bets to save time
                    if total_bets % 100 == 0 or _bot_state.get('force_balance_check'):
                        real_balance = self.get_wallet_balance()
                        if real_balance > 0:
                            balance = real_balance
                            _bot_state['force_balance_check'] = False

                # Calculate Session Profit
                session_profit = balance - _bot_state.get('start_balance', balance)

                # สลับสุ่มระหว่าง Over 52.00 และ Under 48.00 ทุกตา (โอกาสชนะ 48% เท่ากัน)
                current_condition = random.choice(["above", "below"])
                target = 52.00 if current_condition == "above" else 48.00

                # --- PULL HERMES AI SKILLS FROM RAM ---
                if hasattr(self, 'skill_manager') and self.skill_manager:
                    ai_skills = self.skill_manager.ai_skills
                else:
                    ai_skills = {"isolated_wins_threshold": 16, "loss_streak_threshold": 4, "sawtooth_length": 6}
                
                ai_sawtooth_len = ai_skills.get("sawtooth_length", 6)
                ai_isolated_wins = ai_skills.get("isolated_wins_threshold", 16)
                ai_loss_streak = ai_skills.get("loss_streak_threshold", 4)
                ai_loss_escape_wins = ai_skills.get("loss_streak_escape_wins", 2)
                ai_loss_mid_step = ai_skills.get("loss_streak_mid_step", 8)
                ai_loss_mid_threshold = ai_skills.get("loss_streak_mid_threshold", 3)
                ai_loss_mid_escape_wins = ai_skills.get("loss_streak_mid_escape_wins", 3)
                ai_loss_high_step = ai_skills.get("loss_streak_high_step", 14)
                ai_loss_high_threshold = ai_skills.get("loss_streak_high_threshold", 1)
                ai_loss_high_escape_wins = ai_skills.get("loss_streak_high_escape_wins", 3)
                ai_loss_high_min_virtual_rolls = ai_skills.get("loss_streak_high_min_virtual_rolls", 8)
                display_step = fib_step + 1
                if display_step >= ai_loss_high_step:
                    active_loss_limit = ai_loss_high_threshold
                    active_escape_wins = max(ai_loss_high_escape_wins, ai_loss_mid_escape_wins, ai_loss_escape_wins)
                    active_min_virtual_rolls = ai_loss_high_min_virtual_rolls
                elif display_step >= ai_loss_mid_step:
                    active_loss_limit = ai_loss_mid_threshold
                    active_escape_wins = max(ai_loss_mid_escape_wins, ai_loss_escape_wins)
                    active_min_virtual_rolls = 0
                else:
                    active_loss_limit = ai_loss_streak
                    active_escape_wins = ai_loss_escape_wins
                    active_min_virtual_rolls = 0

                # --- VIRTUAL PAUSE MODE (STREAK BREAKER) ---
                is_sawtooth = False
                if len(recent) >= ai_sawtooth_len:
                    last_n = recent[-ai_sawtooth_len:]
                    if last_n == ["W", "L"] * (ai_sawtooth_len // 2) or last_n == ["L", "W"] * (ai_sawtooth_len // 2):
                        is_sawtooth = True

                # แยกการทำงานของเงื่อนไขต่างๆ อย่างชัดเจน
                if virtual_state == "NONE":
                    if current_loss_streak >= active_loss_limit:
                        virtual_state = "LOSS_STREAK"
                        virtual_escape_pattern = ['W'] * active_escape_wins
                        virtual_entry_step = display_step
                        virtual_min_rolls = active_min_virtual_rolls
                        virtual_rolls_seen = 0
                        pattern_str = " - ".join(virtual_escape_pattern)
                        min_scan = f" และแทงลมอย่างน้อย {virtual_min_rolls} ตา" if virtual_min_rolls else ""
                        self.log_event(f"🐉 VIRTUAL PAUSE ENGAGED (แพ้ติด {current_loss_streak} ตา ที่ Step {display_step}; limit {active_loss_limit}. รอรูปแบบ {pattern_str}{min_scan})")

                    elif is_sawtooth:
                        virtual_state = "SAWTOOTH"
                        virtual_escape_pattern = ['W'] * active_escape_wins
                        virtual_entry_step = display_step
                        virtual_min_rolls = active_min_virtual_rolls
                        virtual_rolls_seen = 0
                        pattern_str = " - ".join(virtual_escape_pattern)
                        min_scan = f" + min {virtual_min_rolls} virtual rolls" if virtual_min_rolls else ""
                        self.log_event(f"🐉 VIRTUAL PAUSE ENGAGED (Sawtooth detected: {ai_sawtooth_len} alternating at Step {display_step}. Waiting for {pattern_str}{min_scan})")
                        if len(recent) >= ai_sawtooth_len:
                            recent[-ai_sawtooth_len] = "X" # Corrupt the pattern so it doesn't loop
                            
                    elif real_bets_without_ww >= ai_isolated_wins:
                        virtual_state = "ISOLATED_WINS"
                        virtual_escape_pattern = ['W'] * active_escape_wins
                        virtual_entry_step = display_step
                        virtual_min_rolls = active_min_virtual_rolls
                        virtual_rolls_seen = 0
                        pattern_str = " - ".join(virtual_escape_pattern)
                        min_scan = f" + min {virtual_min_rolls} virtual rolls" if virtual_min_rolls else ""
                        self.log_event(f"🐉 VIRTUAL PAUSE ENGAGED (Isolated Wins: {real_bets_without_ww} bets without W-W at Step {display_step}. AI Threshold: {ai_isolated_wins}. Waiting for {pattern_str}{min_scan})")
                        real_bets_without_ww = 0 # Reset so it doesn't re-trigger immediately
                
                # การหลุดพ้นจาก Virtual Mode
                if virtual_state != "NONE":
                    matched = False
                    pat = virtual_escape_pattern
                    enough_scan = virtual_rolls_seen >= virtual_min_rolls
                    if len(recent) >= len(pat) and recent[-len(pat):] == pat and enough_scan:
                        matched = True
                    
                    if matched:
                        old_state = virtual_state
                        virtual_state = "NONE"
                        pattern_str = "-".join(pat)
                        self.log_event(f"✂️ STREAK BREAKER MATCHED (Got {pattern_str} after {virtual_rolls_seen} virtual rolls)! Exited {old_state} from Step {virtual_entry_step}. Resuming real bet from current step.")
                        current_loss_streak = 0
                        streak = 0
                        streak_type = None
                        virtual_min_rolls = 0
                        virtual_rolls_seen = 0
                
                # --- BET SIZING ---
                if fib_step == 0:
                    # base_bet from config.json, with Stake TRX minimum guard
                    if base_bet < 0.0005:
                        base_bet = 0.0005
                        
                if virtual_state != "NONE":
                    current_bet = 0.0
                else:
                    current_bet = round(base_bet * get_fib_multiplier(fib_step), 8)

                # --- PROACTIVE BALANCE CHECK ---
                if virtual_state == "NONE" and current_bet > balance:
                    self.log_event(f"⚠️ ยอดเงินไม่พอทบไม้! ต้องการ {current_bet:.4f} TRX แต่มี {balance:.4f} TRX")
                    err_key = f"proactive_funds_{fib_step}"
                    if _bot_state.get('last_error') != err_key:
                        tg(f"⚠️ <b>ยอดเงินไม่พอทบไม้! (Proactive Check)</b>\nไม้ {fib_step+1} ต้องใช้ {current_bet:.4f} TRX แต่ยอดเงินคงเหลือ {balance:.4f} TRX\n<b>ระบบสลับกลับไปเริ่มไม้ 1 (0.005 TRX) และรอ 10 วินาที</b>")
                        _bot_state['last_error'] = err_key
                        _bot_state['error_count'] = _bot_state.get('error_count', 0) + 1
                    
                    _bot_state['api_status'] = "🔴 รอเติมเงิน (Proactive)"
                    fib_step = 0
                    current_loss_streak = 0
                    streak = 0
                    streak_type = None
                    time.sleep(10)
                
                if _stop_event.is_set(): return

                now_ts = time.time()
                stress_trigger = (
                    virtual_state == "NONE"
                    and fib_step >= 14
                    and (now_ts - last_high_stress_rotation_time) >= 60
                )
                time_trigger = (virtual_state == "NONE" and total_bets >= self.next_rotation_bet)
                if stress_trigger or time_trigger:
                    reason = "High Stress" if stress_trigger else "Adaptive"
                    if self.rotate_seed(reason) and stress_trigger:
                        last_high_stress_rotation_time = now_ts
                    elif stress_trigger:
                        last_high_stress_rotation_time = now_ts
                
                bet_res = self.place_dice_bet(current_bet, target, current_condition)
                
                if bet_res and "errors" in bet_res:
                    err_msg = bet_res["errors"][0].get("message", "")
                    if "balance" in err_msg.lower() or "funds" in err_msg.lower():
                        self.log_event("❌ INSUFFICIENT BALANCE! (API Error) Pausing bot.")
                        err_key = "insufficient_funds_api"
                        if _bot_state.get('last_error') != err_key:
                            tg(f"🚨 <b>ยอดเงินไม่พอ! (ตรวจพบจาก API)</b>\nเงินในกระเป๋าไม่พอสำหรับการแทงไม้ต่อไป\n<b>บอทจะหยุดพักจนกว่าคุณจะเติมเงิน หรือกดสั่งทำงานใหม่</b>")
                            _bot_state['last_error'] = err_key
                        
                        # Instead of looping wildly, pause and wait for user intervention
                        _bot_state['api_status'] = "🔴 รอเติมเงิน"
                        fib_step = 0
                        current_loss_streak = 0
                        time.sleep(15) # Wait 15 seconds before retrying so it doesn't spam
                        continue
                    else:
                        self.log_event(f"⚠️ API Error: {err_msg}")
                        time.sleep(5)
                        continue

                if not bet_res or "data" not in bet_res or not bet_res["data"] or not bet_res["data"].get("diceRoll"):
                    self.log_event("⚠️ Incomplete bet response. Retrying...")
                    time.sleep(5); continue

                roll_data = bet_res["data"]["diceRoll"]
                
                # Clear error state on successful bet
                _bot_state.pop('last_error', None)
                _bot_state['error_count'] = 0
                _bot_state['api_status'] = "🟢 ปกติ" 
                payout = float(roll_data.get("payout", 0))
                result_state = roll_data.get("state")
                if not result_state:
                    self.log_event("⚠️ Missing roll state. Retrying...")
                    time.sleep(5); continue
                result = float(result_state.get("result", 0))
                
                is_win = False
                if current_condition == "above" and result > target: is_win = True
                elif current_condition == "below" and result < target: is_win = True
                if virtual_state != "NONE":
                    virtual_rolls_seen += 1
                
                # Z-Score Real-Time Client Seed Rotation
                expected_prob = target / 100.0 if current_condition == "below" else (100.0 - target) / 100.0
                self.z_rotator.add_result(is_win, expected_prob)
                
                if total_bets % 100 == 0:
                    new_balance = self.get_wallet_balance()
                    if new_balance == 0: new_balance = balance - current_bet + payout
                else:
                    new_balance = balance - current_bet + payout
                
                # ── 3. GOAL & RISK MANAGEMENT ──
                # Check Daily Target (TP)
                target_tp = _bot_state.get('take_profit', 0.0)
                if target_tp > 0 and total_profit >= target_tp:
                    tg(f"🎯 <b>DAILY GOAL REACHED! (+{total_profit:.2f} TRX)</b>\n"
                       f"เป้าหมาย: {target_tp:+.2f} TRX\n"
                       f"บอททำการบันทึกบัญชีและพักเซสชั่นชั่วคราว...")
                    
                    self.save_daily_report(
                        start_bal=start_balance,
                        end_bal=balance,
                        profit=total_profit,
                        wagered=total_wagered,
                        deposits=total_deposited,
                        withdrawals=total_withdrawn
                    )
                    
                    self.log_event(f"🎯 Daily Goal Reached: {total_profit:.8f} TRX. Auto-pausing for safety.")
                    
                    # Reset for next potential session or wait for user
                    start_balance = balance
                    total_profit = 0
                    total_deposited = 0
                    total_withdrawn = 0
                    _bot_state['take_profit'] = 0 # Clear TP to prevent immediate re-trigger
                    
                    save_stats(persistent)
                    time.sleep(300) # Pause 5 mins before next automated cycle
                    continue 

                delta = new_balance - (balance - current_bet + payout)
                # ใช้ threshold 1.0 TRX เพื่อกรอง floating point error และ payout เล็กๆ
                if abs(delta) > 1.0:
                    type_str = "DEPOSIT" if delta > 0 else "WITHDRAWAL"
                    self.log_event(f"🏦 External Balance Change: {type_str} detected ({delta:+.8f} TRX)")
                    if delta < 0:
                        total_withdrawn += abs(delta)
                    else:
                        # ฝากเงินเพิ่ม → อัปเดตต้นทุนอัตโนมัติ
                        total_deposited += delta
                        initial_capital += delta
                        log_deposit_to_csv(delta, new_balance)
                        tg(
                            f"🏦 <b>ตรวจพบการฝากเงิน!</b>\n"
                            f"💵 ฝากเพิ่ม : <b>+{delta:.4f} TRX</b>\n"
                            f"📊 ต้นทุนรวม : <b>{initial_capital:.4f} TRX</b>\n"
                            f"<i>อัปเดตต้นทุนอัตโนมัติแล้ว</i>"
                        )
                    start_balance += delta
                    cycle_start_balance += delta
                
                total_bets += 1
                total_wagered += current_bet
                
                # Auto Claim Rakeback every 1000 bets
                if total_bets > 0 and total_bets % 1000 == 0:
                    self.claim_rakeback()
                    _bot_state['force_balance_check'] = True
                
                # COMPANY STYLE PROFIT CALCULATION
                # Real Net Profit = (Current Balance + Withdrawn) - Initial Capital
                total_profit = (new_balance + total_withdrawn) - initial_capital
                
                # Track Performance Metrics
                current_total_value = new_balance + total_withdrawn
                if current_total_value > peak_equity:
                    peak_equity = current_total_value
                
                drawdown = peak_equity - current_total_value
                if drawdown > max_drawdown:
                    max_drawdown = drawdown
                
                if virtual_state == "NONE":
                    real_bets_without_ww += 1
                
                if is_win:
                    if virtual_state != "NONE":
                        # If virtual mode won, reduce virtual losses (no real profit)
                        pass
                    else:
                        wins += 1
                        session_wins += 1
                        current_loss_streak = 0
                        real_consecutive_wins += 1
                        
                        fib_step -= 2
                        if fib_step < 0: fib_step = 0
                        
                        # Reset Fibonacci fully on 2 consecutive real wins (W-W)
                        if real_consecutive_wins >= 2:
                            self.log_event("🔄 Real W-W achieved: Resetting Fibonacci step to 0")
                            fib_step = 0
                            real_bets_without_ww = 0
                else:
                    if virtual_state != "NONE":
                        pass # Do nothing special for virtual loss
                    else:
                        losses += 1
                        current_loss_streak += 1
                        real_consecutive_wins = 0
                        if current_loss_streak > max_loss_streak: max_loss_streak = current_loss_streak
                        if fib_step > max_fib_step:
                            max_fib_step = fib_step
                            if max_fib_step >= 10:
                                self.log_event(f"🧗 Climber: Reached new high Step {max_fib_step+1}")
                        if current_bet > max_single_loss: max_single_loss = current_bet
                        fib_step += 1
                
                last_roll = result
                last_net = payout - current_bet
                last_result = "WIN" if is_win else "LOSS"
                recent.append("W" if is_win else "L")

                if len(recent) > 10:
                    recent.pop(0)
                # Removed fib limit check

                # ── 3. TP/SL AUTOMATION ──
                if take_profit > 0 and total_profit >= take_profit:
                    tg(f"🏁 <b>TAKE PROFIT REACHED!</b>\n"
                       f"Profit: <b>{total_profit:+.8f} TRX</b>\n"
                       f"เป้าหมาย: {take_profit:+.2f} TRX\n"
                       f"<b>บอททำการ Reset ยอดแทงและเริ่มนับกำไรใหม่ (No Stop)</b>")
                    self.log_event(f"🏁 Take Profit Reached: {total_profit:.8f} TRX. Resetting and continuing.")
                    
                    # Reset strategy and profit tracking for the next cycle
                    if fib_step >= 14: # Step 15 or higher
                        tg(f"⚠️ <b>HIGH-RISK RECOVERY DETECTED (Step {fib_step+1})</b>\n"
                       f"CEO สั่งการให้พักพนักงาน 15 นาที เพื่อความปลอดภัยของเงินทุนและเปลี่ยนจังหวะ Seed...")
                        self.log_event(f"Safety Pause triggered after Step {fib_step+1} recovery.")
                        # Rotate seed to be sure
                        self.rotate_seed("High-Risk Recovery")
                        time.sleep(900) # 15 minutes pause
                    
                    fib_step -= 2

                    
                    if fib_step < 0: fib_step = 0
                    current_loss_streak = 0
                    streak = 0
                    streak_type = None
                    virtual_state = "TAKE_PROFIT_RESET"
                    virtual_escape_pattern = ['W']
                    virtual_entry_step = fib_step + 1
                    virtual_min_rolls = 0
                    virtual_rolls_seen = 0
                    start_balance = new_balance # Reset start balance to current to track next TP goal
                    total_deposited = 0
                    total_withdrawn = 0
                    
                    # Optional: Rotate seed
                    self.rotate_seed("Take Profit Reset")
                    continue 
                # (Stop Loss feature has been removed as per user request)

                # (Dynamic condition switching has been replaced by per-roll random Over/Under)

                # ── 5. สรุปยอดเพื่อเตรียมตาถัดไป ──
                balance = new_balance

                # ── 4. บันทึกและอัปเดตสถานะ (State Sync) ──
                save_stats({
                    "total_profit": total_profit,
                    "total_bets": total_bets,
                    "total_wagered": total_wagered,
                    "wins": wins,
                    "losses": losses,
                    "max_loss_streak": max_loss_streak,
                    "max_single_loss": max_single_loss,
                    "last_fib_step": fib_step,
                    "last_condition": current_condition,
                    "initial_balance": start_balance,
                    "total_withdrawn": total_withdrawn,
                    "total_deposited": total_deposited,
                    "max_fib_step": max_fib_step,
                    "initial_capital": initial_capital,
                    "peak_equity": peak_equity,
                    "max_drawdown": max_drawdown,
                    "take_profit": take_profit,
                    "stop_loss": stop_loss,
                    "total_uptime_seconds": total_uptime_seconds,
                    "real_bets_without_ww": real_bets_without_ww
                })

                _bot_state.update({
                    'balance'       : balance,
                    'start_balance' : initial_capital, # ROI now tracks from initial_capital
                    'virtual_state' : virtual_state,
                    'profit'        : total_profit,
                    'total_withdrawn': total_withdrawn,
                    'initial_capital': initial_capital,
                    'peak_equity': peak_equity,
                    'max_drawdown': max_drawdown,
                    'bets'          : total_bets,
                    'wins'          : wins,
                    'max_loss_streak': max_loss_streak,
                    'max_single_loss': max_single_loss,
                    'max_fib_step'  : max_fib_step,
                    'fib_step'      : fib_step + 1,
                    'condition'     : current_condition,
                    'switches'      : condition_switches,
                    'streak'        : streak,
                    'streak_type'   : streak_type,
                    'current_bet'   : current_bet,
                    'total_wagered' : total_wagered
                })

                # ── 6. ระบบบันทึกบัญชีรายวันสำหรับบริษัท ──
                # บันทึกทุก 500 Bet หรือเมื่อมีการฝากเงิน
                if total_bets % 500 == 0:
                    self.save_daily_report(
                        start_bal=start_balance,
                        end_bal=balance,
                        profit=total_profit,
                        wagered=total_wagered,
                        deposits=total_deposited,
                        withdrawals=total_withdrawn
                    )

                # ── 5. การแจ้งเตือนพิเศษ (Telegram Alerts) ──
                if payout > 0:
                    if fib_step == 0 and current_highest_alert > 0: # กลับมาที่ step 1 หลังติดหล่ม
                        tg(f"✅ <b>ดึงทุนคืนสำเร็จ! (Full Recovery)</b>\nสถานะ: กลับเข้าสู่ภาวะปกติ\nProfit รวม : {total_profit:+.8f} TRX")
                        current_highest_alert = 0
                else:
                    # New Record Alert (Step / Streak)
                    # แจ้งเตือนเมื่อทำลายสถิติเดิม (16, 17, 18...)
                    if (fib_step + 1) > persistent.get("max_fib_step", 0) and (fib_step + 1) >= 15:
                         danger = "🔴 อันตราย!" if fib_step + 1 >= 18 else "🟠 ระวัง!"
                         tg(
                             f"🏆 <b>ทำลายสถิติใหม่! (Max Step)</b>\n"
                             f"━━━━━━━━━━━━━━━━\n"
                             f"📍 ขั้นที่     : <b>{fib_step+1}</b>  {danger}\n"
                             f"💸 Bet ปัจจุบัน : <b>{current_bet:.8f} TRX</b>\n"
                             f"💰 Balance     : <b>{new_balance:.4f} TRX</b>\n"
                             f"📉 P/L         : <b>{total_profit:+.4f} TRX</b>\n"
                             f"🔥 แพ้ติด      : <b>{current_loss_streak} ครั้ง</b>\n"
                             f"━━━━━━━━━━━━━━━━\n"
                             f"<i>⚠️ พิจารณาหยุดบอทถ้า Step สูงมาก</i>"
                         )
                         persistent["max_fib_step"] = (fib_step + 1)

                    if current_loss_streak > persistent.get("max_loss_streak", 0) and current_loss_streak >= 15:
                         tg(
                             f"🔥 <b>ทำลายสถิติใหม่! (Max Streak)</b>\n"
                             f"━━━━━━━━━━━━━━━━\n"
                             f"💥 แพ้ต่อเนื่อง : <b>{current_loss_streak} ครั้ง</b>\n"
                             f"📍 ขั้นที่      : <b>{fib_step+1}</b>\n"
                             f"💸 Bet ปัจจุบัน : <b>{current_bet:.8f} TRX</b>\n"
                             f"💰 Balance      : <b>{new_balance:.4f} TRX</b>\n"
                             f"📉 P/L          : <b>{total_profit:+.4f} TRX</b>"
                         )
                         persistent["max_loss_streak"] = current_loss_streak
                    
                    # High Risk Alert
                    bet_mult = int(current_bet / base_bet)
                    target_m = 0
                    for m in sorted(BET_ALERT_MULTIPLIERS, reverse=True):
                        if bet_mult >= m: target_m = m; break
                    if target_m > current_highest_alert:
                        current_highest_alert = target_m
                        tg(f"🚨 <b>Bet ใหญ่ถึง {target_m}x! (High Risk)</b>\nBet: {current_bet:.8f} TRX\nStep: {fib_step+1}")

                    # Milestone Streak
                    if current_loss_streak in STREAK_MILESTONES:
                        tg(f"💥 <b>แพ้ต่อเนื่อง {current_loss_streak} ครั้ง</b>\nStep: {fib_step+1}\nProfit: {total_profit:+.8f} TRX")

                # Health Check (ทุก 100 bets)
                if total_bets % BALANCE_REPORT_EVERY == 0:
                    win_rate_now = (wins / total_bets * 100)
                    p_icon = "🟢" if total_profit >= 0 else "🔴"
                    tg(
                        f"📈 <b>รายงานอัตโนมัติ ({total_bets:,} Bets)</b>\n"
                        f"━━━━━━━━━━━━━━━━\n"
                        f"💰 Balance  : <b>{balance:.4f} TRX</b>\n"
                        f"📊 Win Rate : <b>{win_rate_now:.1f}%</b>\n"
                        f"📍 Step     : <b>{fib_step+1}</b>\n"
                        f"⏱️ Uptime   : <b>{total_uptime_seconds//3600}h {(total_uptime_seconds%3600)//60}m</b>",
                        reply_markup=main_menu_markup()
                    )

                mode_str = f"VIRTUAL({virtual_state})" if virtual_state != "NONE" else "REAL"
                status_str = "WIN" if is_win else "LOSS"
                self.log_to_csv([
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    mode_str, fib_step+1, current_bet, target, current_condition, result, payout, status_str, streak, streak_type
                ])

                # ========== COMMANDER BRIAN | FULL DISCLOSURE DASHBOARD ==========
                clear()
                win_rate = (wins / total_bets * 100) if total_bets > 0 else 0
                mode = "SIMULATION" if self.simulate else "LIVE"
                p_sign = "+" if total_profit >= 0 else ""
                
                print("=" * 65)
                print(f" 🤖 COMMANDER BRIAN | MISSION CONTROL | {mode}")
                print("=" * 65)
                print(f" 💰 FINANCIAL STATEMENT:")
                print(f"  💵 Available Balance : {balance:.8f} TRX")
                print("-" * 65)
                print(f" 🎯 STRATEGIC STATUS & GUARD:")
                if virtual_state != "NONE":
                    pattern_str = " - ".join(virtual_escape_pattern)
                    scan_str = f" ({virtual_rolls_seen}/{virtual_min_rolls} scan)" if virtual_min_rolls else ""
                    print(f"  Current Step    : [SCANNING] Waiting for {pattern_str}{scan_str}")
                    print(f"  Bet Amount      : 0.00000000 TRX | Virtual Roll")
                else:
                    next_bet_amount = round(base_bet * get_fib_multiplier(fib_step), 8)
                    print(f"  Current Step    : Step {fib_step+1} (x{get_fib_multiplier(fib_step)})")
                    print(f"  Bet Amount      : {next_bet_amount:.8f} TRX | Roll {current_condition.upper()} {target}")
                
                # Progress Bar for Goal (Only if set)
                if take_profit > 0:
                    progress = min(100, max(0, (total_profit / take_profit * 100)))
                    bar_len = 20
                    filled = int(bar_len * progress / 100)
                    bar = "█" * filled + "▒" * (bar_len - filled)
                    print(f"  GOAL: [{bar}] {progress:.1f}%")
                
                print("-" * 65)
                # Minimalist Live Log
                last_result_str = '✅ WIN ' if last_result == 'WIN' else '❌ LOSS'
                print(f" 🎲 LAST ROLL : {last_roll:.2f} -> {last_result_str} ({last_net:+.8f} TRX)")
                print(f" ⚠️ STREAK    : {streak} {streak_type} | Recent: {''.join(recent[-6:])}")
                print("=" * 65)
                print(f" [BETS: {total_bets} | WR: {win_rate:.1f}%] | Uptime: {total_uptime_seconds//3600}h {(total_uptime_seconds%3600)//60}m")
                print("=" * 65)
                # Smart Speed: Max speed enabled

            except KeyboardInterrupt:
                clear()
                tg(f"🛑 <b>Bot Stopped (Manual)</b>\nFinal Profit: {total_profit:+.8f} TRX\nBets: {total_bets} ({wins}W/{losses}L)\nBalance: {balance:.8f} TRX")
                print("Bot stopped by user.")
                print(f"Final Profit: {total_profit:.8f} TRX | Bets: {total_bets} ({wins}W/{losses}L)")
                raise  # re-raise เพื่อให้ outer loop หยุดด้วย
            except Exception as e:
                clear()
                tg(f"❌ <b>Bot Error</b>\n{str(e)[:200]}\nRetrying in 5s...")
                print("=======================================================")
                print(f"  [ERROR] {str(e)[:60]}")
                print(f"  [RECOVER] Retrying in 5 seconds...")
                print(f"  [INFO] Profit so far: {total_profit:.8f} TRX")
                print("=======================================================")
                time.sleep(5)

if __name__ == "__main__":
    # ============================================================
    #  อ่านค่าจาก config.json (แก้ไขได้ที่ไฟล์ config.json)
    # ============================================================
    _stake = _CFG["stake"]
    _bots  = _CFG["bot_settings"]

    TOKEN       = _stake["access_token"]
    COOKIES     = _stake["cookies"]
    CURRENCY    = _stake.get("currency", "trx")
    MIRROR_HOST = _stake.get("mirror_host", "stake.games")
    PROXY       = _stake.get("proxy", "")
    SIMULATE    = _bots.get("simulate", False)

    print(f"[CONFIG] Mirror: {MIRROR_HOST} | Proxy: {PROXY or 'none'}")

    BASE_BET  = _bots.get("base_bet", 0.0005)
    TARGET    = _bots.get("target", 48.00)
    CONDITION = _bots.get("condition", "below")

    print(f"[CONFIG] Telegram Chat: {TELEGRAM_CHAT_ID}")
    print(f"[CONFIG] Currency: {CURRENCY} | Base Bet: {BASE_BET} | Mode: {'SIMULATE' if SIMULATE else 'LIVE'}")

    # ===== START WATCHDOG HOT RELOAD =====
    skill_manager = SkillManager(os.path.join(_BASE_DIR, "ai_skills.json"))
    observer = Observer()
    observer.schedule(skill_manager, path=_BASE_DIR, recursive=False)
    observer.start()

    bot = StakeDiceBot(TOKEN, COOKIES, currency=CURRENCY, simulate=SIMULATE,
                       mirror_host=MIRROR_HOST, proxy=PROXY, skill_manager=skill_manager)

    # ===== AUTO-HERMES AI LOOP =====
    def auto_hermes():
        while True:
            # Wait 60 minutes before running the AI brain
            time.sleep(3600)
            try:
                # Run the AI brain silently in the background
                subprocess.run(["python", "hermes_brain.py"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception as e:
                pass

    # Start the AI in a background daemon thread so it runs alongside the bot
    ai_thread = threading.Thread(target=auto_hermes, daemon=True)
    ai_thread.start()

    # ===== RESURRECTION LOOP =====
    while True:
        try:
            bot.start_dice_bot(base_bet=BASE_BET, target=TARGET, condition=CONDITION)
        except KeyboardInterrupt:
            print("Bot stopped by user.")
            break
        except Exception as e:
            tg(f"💀 <b>Bot Crashed! Restarting...</b>\n{str(e)[:200]}\nRestarting in 15s")
            print(f"[RESURRECTION] Crashed: {e}")
            print("[RESURRECTION] Restarting in 15 seconds...")
            time.sleep(15)






