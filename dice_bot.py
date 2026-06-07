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
from datetime import datetime

# Force UTF-8 for Windows console
if os.name == 'nt':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

# ============================================================
#  LOAD USER CONFIG (Ã Â¸Â£Ã Â¸Â­Ã Â¸â€¡Ã Â¸Â£Ã Â¸Â±Ã Â¸Å¡ --config profile)
# ============================================================
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Ã Â¸Â£Ã Â¸Â±Ã Â¸Å¡ --config argument Ã Â¹â‚¬Ã Â¸Å Ã Â¹Ë†Ã Â¸â„¢: python dice_bot.py --config config_user2.json
_config_arg = "config.json"
if "--config" in sys.argv:
    idx = sys.argv.index("--config")
    if idx + 1 < len(sys.argv):
        _config_arg = sys.argv[idx + 1]

_CONFIG_FILE = os.path.join(_BASE_DIR, _config_arg)

# Stats file Ã Â¹ÂÃ Â¸Â¢Ã Â¸ÂÃ Â¸â€¢Ã Â¸Â²Ã Â¸Â¡ profile Ã Â¹â‚¬Ã Â¸Å Ã Â¹Ë†Ã Â¸â„¢ config_user2.json -> dice_stats_user2.json
_profile_suffix = _config_arg.replace("config", "").replace(".json", "") or ""
_STATS_FILE   = os.path.join(_BASE_DIR, f"dice_stats{_profile_suffix}.json")
_HISTORY_FILE = os.path.join(_BASE_DIR, f"dice_history{_profile_suffix}.csv")
_EVENT_LOG    = os.path.join(_BASE_DIR, f"dice_events{_profile_suffix}.log")
_DAILY_REPORT = os.path.join(_BASE_DIR, f"daily_accounting_report{_profile_suffix}.csv")

def _load_config():
    if not os.path.exists(_CONFIG_FILE):
        print(f"[ERROR] Ã Â¹â€žÃ Â¸Â¡Ã Â¹Ë†Ã Â¸Å¾Ã Â¸Å¡Ã Â¹â€žÃ Â¸Å¸Ã Â¸Â¥Ã Â¹Å’ {_config_arg} Ã Â¸ÂÃ Â¸Â£Ã Â¸Â¸Ã Â¸â€œÃ Â¸Â²Ã Â¸ÂªÃ Â¸Â£Ã Â¹â€°Ã Â¸Â²Ã Â¸â€¡Ã Â¹â€žÃ Â¸Å¸Ã Â¸Â¥Ã Â¹Å’Ã Â¸ÂÃ Â¹Ë†Ã Â¸Â­Ã Â¸â„¢Ã Â¸Â£Ã Â¸Â±Ã Â¸â„¢")
        sys.exit(1)
    with open(_CONFIG_FILE, "r", encoding="utf-8-sig") as f:
        return json.load(f)

_CFG = _load_config()
print(f"[CONFIG] Profile: {_config_arg}")

TELEGRAM_TOKEN   = _CFG["telegram"]["token"]
TELEGRAM_CHAT_ID = _CFG["telegram"]["chat_id"]
STATS_FILE   = _STATS_FILE
HISTORY_FILE = _HISTORY_FILE
EVENT_LOG    = _EVENT_LOG

_fin = _CFG.get("financial", {})
LIFETIME_DEFICIT = _fin.get("lifetime_deficit", 0.0)

# Global state sharing between threads
_bot_state = {}
_stop_event = threading.Event()

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
        "last_martingale_step": 0,
        "last_condition": None,
        "initial_balance": 0.0,
        "total_withdrawn": _fin.get("total_withdrawn", 0.0),
        "total_deposited": 0.0,
        "max_martingale_step": 0,
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
    """Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¶Ã Â¸ÂÃ Â¹â‚¬Ã Â¸Â«Ã Â¸â€¢Ã Â¸Â¸Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸â€œÃ Â¹Å’Ã Â¸ÂªÃ Â¸Â³Ã Â¸â€žÃ Â¸Â±Ã Â¸ÂÃ Â¸Â¥Ã Â¸â€¡Ã Â¹â€žÃ Â¸Å¸Ã Â¸Â¥Ã Â¹Å’Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¹Æ’Ã Â¸Â«Ã Â¹â€°Ã Â¸â€žÃ Â¸â„¢Ã Â¸Â­Ã Â¹Ë†Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â¢Ã Â¹â€°Ã Â¸Â­Ã Â¸â„¢Ã Â¸Â«Ã Â¸Â¥Ã Â¸Â±Ã Â¸â€¡Ã Â¹â€žÃ Â¸â€Ã Â¹â€°Ã Â¸â€¡Ã Â¹Ë†Ã Â¸Â²Ã Â¸Â¢"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(EVENT_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except:
        pass

def _tg_worker(url, payload):
    try: requests.post(url, json=payload, timeout=10)
    except: pass

def tg(msg, reply_markup=None):
    """Corporate Reporting System (CEO to Board)"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "HTML"}
    if reply_markup: payload["reply_markup"] = reply_markup
    threading.Thread(target=_tg_worker, args=(url, payload), daemon=True).start()

def tg_edit(chat_id, message_id, msg, reply_markup=None):
    """Edit existing message (for callback updates)"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/editMessageText"
    payload = {"chat_id": chat_id, "message_id": message_id, "text": msg, "parse_mode": "HTML"}
    if reply_markup: payload["reply_markup"] = reply_markup
    threading.Thread(target=_tg_worker, args=(url, payload), daemon=True).start()

def tg_answer_callback(callback_query_id):
    """Acknowledge callback query to remove loading spinner"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerCallbackQuery"
    threading.Thread(target=_tg_worker, args=(url, {"callback_query_id": callback_query_id}), daemon=True).start()

def main_menu_markup():
    """Main menu inline keyboard"""
    return {
        "inline_keyboard": [
            [
                {"text": "Ã°Å¸â€œÅ  Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â°", "callback_data": "/status"},
                {"text": "Ã°Å¸â€™Â° Ã Â¸ÂÃ Â¸Â³Ã Â¹â€žÃ Â¸Â£/Ã Â¸â€šÃ Â¸Â²Ã Â¸â€Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢", "callback_data": "/profit"}
            ],
            [
                {"text": "Ã¢â€žÂ¹Ã¯Â¸Â Ã Â¸â€šÃ Â¹â€°Ã Â¸Â­Ã Â¸Â¡Ã Â¸Â¹Ã Â¸Â¥Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”", "callback_data": "/info"},
                {"text": "Ã°Å¸ÂÂ¥ Ã Â¸ÂªÃ Â¸Â¸Ã Â¸â€šÃ Â¸Â Ã Â¸Â²Ã Â¸Å¾Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”", "callback_data": "/check"}
            ],
            [
                {"text": "Ã¢Å¡â„¢Ã¯Â¸Â Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸â€¢Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡Ã Â¸â€žÃ Â¹Ë†Ã Â¸Â²", "callback_data": "/config"},
                {"text": "Ã°Å¸â€œâ€ž Ã Â¸Â£Ã Â¸Â²Ã Â¸Â¢Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸Å¡Ã Â¸Â±Ã Â¸ÂÃ Â¸Å Ã Â¸Âµ", "callback_data": "/report"}
            ],
            [
                {"text": "Ã°Å¸Å½Â¯ Ã Â¸â€¢Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡ Take Profit", "callback_data": "tp_menu"}
            ],
            [
                {"text": "Ã°Å¸â€Â´ Ã Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”", "callback_data": "/stop"}
            ]
        ]
    }

def tp_menu_markup():
    """Take Profit preset buttons"""
    return {
        "inline_keyboard": [
            [
                {"text": "Ã°Å¸Å½Â¯ +5 TRX",  "callback_data": "/tp 5"},
                {"text": "Ã°Å¸Å½Â¯ +10 TRX", "callback_data": "/tp 10"},
                {"text": "Ã°Å¸Å½Â¯ +20 TRX", "callback_data": "/tp 20"}
            ],
            [
                {"text": "Ã°Å¸Å½Â¯ +50 TRX",  "callback_data": "/tp 50"},
                {"text": "Ã°Å¸Å½Â¯ +100 TRX", "callback_data": "/tp 100"},
                {"text": "Ã°Å¸Å½Â¯ +200 TRX", "callback_data": "/tp 200"}
            ],
            [{"text": "Ã¢â€”â‚¬Ã¯Â¸Â Ã Â¸ÂÃ Â¸Â¥Ã Â¸Â±Ã Â¸Å¡Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸â„¢Ã Â¸Â¹Ã Â¸Â«Ã Â¸Â¥Ã Â¸Â±Ã Â¸Â", "callback_data": "main_menu"}]
        ]
    }

def sl_menu_markup():
    """Stop Loss preset buttons"""
    return {
        "inline_keyboard": [
            [
                {"text": "Ã°Å¸â€ºâ€˜ -5 TRX",  "callback_data": "/sl 5"},
                {"text": "Ã°Å¸â€ºâ€˜ -10 TRX", "callback_data": "/sl 10"},
                {"text": "Ã°Å¸â€ºâ€˜ -20 TRX", "callback_data": "/sl 20"}
            ],
            [
                {"text": "Ã°Å¸â€ºâ€˜ -50 TRX",  "callback_data": "/sl 50"},
                {"text": "Ã°Å¸â€ºâ€˜ -100 TRX", "callback_data": "/sl 100"},
                {"text": "Ã°Å¸â€ºâ€˜ -200 TRX", "callback_data": "/sl 200"}
            ],
            [{"text": "Ã¢â€”â‚¬Ã¯Â¸Â Ã Â¸ÂÃ Â¸Â¥Ã Â¸Â±Ã Â¸Å¡Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸â„¢Ã Â¸Â¹Ã Â¸Â«Ã Â¸Â¥Ã Â¸Â±Ã Â¸Â", "callback_data": "main_menu"}]
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
            p_icon = "Ã°Å¸Å¸Â¢" if profit >= 0 else "Ã°Å¸â€Â´"
            uptime = _bot_state.get('total_uptime_seconds', 0)

            tg(
                f"Ã°Å¸â€™â€œ <b>Ã Â¸Â£Ã Â¸Â²Ã Â¸Â¢Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â° (Ã Â¸â€”Ã Â¸Â¸Ã Â¸Â 30 Ã Â¸â„¢Ã Â¸Â²Ã Â¸â€”Ã Â¸Âµ)</b>\n"
                f"Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â\n"
                f"Ã°Å¸â€™Â° Balance  : <b>{balance:.4f} TRX</b>\n"
                f"{p_icon} P/L     : <b>{profit:+.4f} TRX</b>\n"
                f"Ã°Å¸â€œÅ  Win Rate : <b>{wr:.1f}%</b>\n"
                f"Ã°Å¸Å½Â° Bets     : <b>{bets:,}</b>\n"
                f"Ã°Å¸â€œÂ Step     : <b>{_bot_state.get('martingale_step', 1)}</b>\n"
                f"Ã¢ÂÂ±Ã¯Â¸Â Uptime   : <b>{uptime//3600}h {(uptime%3600)//60}m</b>",
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
            f"Ã°Å¸â€œÅ  <b>COMPANY STYLE PORTFOLIO</b>\n"
            f"--------------------------------\n"
            f"Ã°Å¸ÂÂ¦ <b>CAPITAL ACCOUNT</b>\n"
            f"Ã¢â‚¬Â¢ Initial Deposit : {initial_cap:.3f} TRX\n"
            f"--------------------------------\n"
            f"Ã°Å¸â€™Âµ <b>TREASURY</b>\n"
            f"Ã¢â‚¬Â¢ Current Equity  : {balance:.8f} TRX\n"
            f"Ã¢â‚¬Â¢ Realized Profit : {withdrawn:.2f} TRX\n"
            f"Ã¢â‚¬Â¢ Unrealized Prof : {unrealized:+.4f} TRX\n"
            f"--------------------------------\n"
            f"Ã°Å¸â€œË† <b>PERFORMANCE</b>\n"
            f"Ã¢â‚¬Â¢ Real Net Profit : {real_net_profit:+.4f} TRX\n"
            f"Ã¢â‚¬Â¢ ROI             : {roi:+.2f}%\n"
            f"Ã¢â‚¬Â¢ Peak Equity     : {s.get('peak_equity', 0):.2f} TRX\n"
            f"Ã¢â‚¬Â¢ Max Drawdown    : {s.get('max_drawdown', 0):.2f} TRX\n"
            f"--------------------------------\n"
            f"Ã°Å¸Å½Â° Bets: {s.get('bets', 0):,} | WR: {wr:.1f}%\n"
            f"<i>Reported by: Board of Directors Bot</i>"
        )
    elif cmd == "/profit":
        p = s.get('profit', 0)
        icon = "Ã°Å¸Å¸Â¢" if p >= 0 else "Ã°Å¸â€Â´"
        tg(
            f"{icon} <b>PROFIT & LOSS REPORT</b>\n"
            f"Gross Profit : {p:+.8f} TRX\n"
            f"Withdrawn    : {s.get('total_withdrawn', 0):.8f} TRX\n"
            f"Deposited    : {s.get('total_deposited', 0):.8f} TRX\n"
            f"Initial Cap  : {s.get('start_balance', 0):.8f} TRX\n"
            f"Time Period  : Live Session"
        )
    elif cmd == "/info":
        # Ã Â¹â‚¬Ã Â¸Â§Ã Â¸Â¥Ã Â¸Â²Ã Â¸â€šÃ Â¸Â­Ã Â¸â€¡ Session Ã Â¸â€ºÃ Â¸Â±Ã Â¸Ë†Ã Â¸Ë†Ã Â¸Â¸Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢
        session_start = s.get('session_start', datetime.now())
        session_dur = datetime.now() - session_start
        s_h, s_rem = divmod(int(session_dur.total_seconds()), 3600)
        s_m, _ = divmod(s_rem, 60)
        
        # Ã Â¹â‚¬Ã Â¸Â§Ã Â¸Â¥Ã Â¸Â²Ã Â¸ÂªÃ Â¸Â°Ã Â¸ÂªÃ Â¸Â¡Ã Â¸â€”Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡Ã Â¸Â«Ã Â¸Â¡Ã Â¸â€ (Total Uptime)
        total_sec = s.get('total_uptime_seconds', 0)
        t_h, t_rem = divmod(total_sec, 3600)
        t_m, _ = divmod(t_rem, 60)
        
        first_start = s.get('first_run_time', 'N/A')
        wr = (s.get('wins', 0) / s['bets'] * 100) if s.get('bets', 0) > 0 else 0
        
        tg(
            f"Ã¢â€žÂ¹Ã¯Â¸Â <b>BOT HISTORICAL REPORT</b>\n"
            f"--------------------------------\n"
            f"Ã°Å¸â€”â€œÃ¯Â¸Â <b>First Started</b> : {first_start}\n"
            f"Ã¢ÂÂ³ <b>Total Uptime</b>  : {t_h}h {t_m}m (All-time)\n"
            f"Ã¢ÂÂ° <b>This Session</b>  : {s_h}h {s_m}m\n"
            f"Ã°Å¸Å½Â° <b>Total Bets</b>    : {s.get('bets', 0):,}\n"
            f"--------------------------------\n"
            f"Ã°Å¸Ââ€  <b>ALL-TIME RECORDS</b>\n"
            f"Max Loss Streak: {s.get('max_loss_streak', 0)} Ã Â¸â€žÃ Â¸Â£Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡\n"
            f"Max Step   : Ã Â¸â€šÃ Â¸Â±Ã Â¹â€°Ã Â¸â„¢Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë† {s.get('max_martingale_step', 0)}\n"
            f"Max Single Bet : {s.get('max_single_loss', 0):.8f} TRX\n"
            f"--------------------------------\n"
            f"Ã¢Å¡â„¢Ã¯Â¸Â <b>STRATEGY STATS</b>\n"
            f"Win Rate      : {wr:.1f}%\n"
            f"Step      : {s.get('martingale_step', 1)}\n"
            f"Condition Sw  : {s.get('switches', 0)} Ã Â¸â€žÃ Â¸Â£Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡\n"
            f"Last Result   : {s.get('streak', 0)} {s.get('streak_type', '-')}\n"
            f"Current Bet   : {s.get('current_bet', 0):.8f} TRX\n"
            f"--------------------------------\n"
            f"Ã°Å¸Å½Â¯ <b>TARGETS</b>\n"
            f"Take Profit   : {s.get('take_profit', 0):+.2f} TRX\n"
            f"Auto-Reset at : {s.get('stop_loss', 0):.2f} TRX"
        )
    elif cmd == "/stop":
        tg("Ã°Å¸â€ºâ€˜ <b>Ã Â¸Â£Ã Â¸Â±Ã Â¸Å¡Ã Â¸â€žÃ Â¸Â³Ã Â¸ÂªÃ Â¸Â±Ã Â¹Ë†Ã Â¸â€¡ /stop Ã¢â‚¬â€ Ã Â¸ÂÃ Â¸Â³Ã Â¸Â¥Ã Â¸Â±Ã Â¸â€¡Ã Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”...</b>")
        _stop_event.set()
    elif cmd.startswith("/tp"):
        try:
            val = float(cmd.split()[1])
            _bot_state['take_profit'] = val
            tg(f"Ã°Å¸Å½Â¯ <b>Ã Â¸â€¢Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸â€ºÃ Â¹â€°Ã Â¸Â²Ã Â¸ÂÃ Â¸Â³Ã Â¹â€žÃ Â¸Â£ (Take Profit)</b>\nÃ Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸ÂÃ Â¸Â³Ã Â¹â€žÃ Â¸Â£Ã Â¸â€“Ã Â¸Â¶Ã Â¸â€¡: <b>{val:+.2f} TRX</b>")
        except:
            tg("Ã¢ÂÅ’ Ã Â¸Â£Ã Â¸Â¹Ã Â¸â€ºÃ Â¹ÂÃ Â¸Å¡Ã Â¸Å¡Ã Â¸Å“Ã Â¸Â´Ã Â¸â€! Ã Â¹Æ’Ã Â¸Å Ã Â¹â€°: <code>/tp 50</code>")
    elif cmd.startswith("/reset_at") or cmd.startswith("/sl"):
        try:
            val = float(cmd.split()[1])
            _bot_state['stop_loss'] = -abs(val)
            tg(f"Ã°Å¸â€â€ž <b>Ã Â¸â€¢Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡Ã Â¸Ë†Ã Â¸Â¸Ã Â¸â€Ã Â¸Å¾Ã Â¸Â±Ã Â¸ÂÃ Â¸Â¢Ã Â¸ÂÃ Â¸Â­Ã Â¸Â±Ã Â¸â€¢Ã Â¹â€šÃ Â¸â„¢Ã Â¸Â¡Ã Â¸Â±Ã Â¸â€¢Ã Â¸Â´ (Auto-Reset)</b>\nÃ Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸Ë†Ã Â¸Â°Ã Â¸Å¾Ã Â¸Â±Ã Â¸Â 2 Ã Â¸â„¢Ã Â¸Â²Ã Â¸â€”Ã Â¸ÂµÃ Â¹â‚¬Ã Â¸Â¡Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€¢Ã Â¸Â´Ã Â¸â€Ã Â¸Â¥Ã Â¸Å¡Ã Â¸â€“Ã Â¸Â¶Ã Â¸â€¡: <b>-{abs(val):.2f} TRX</b>")
        except:
            tg("Ã¢ÂÅ’ Ã Â¸Â£Ã Â¸Â¹Ã Â¸â€ºÃ Â¹ÂÃ Â¸Å¡Ã Â¸Å¡Ã Â¸Å“Ã Â¸Â´Ã Â¸â€! Ã Â¹Æ’Ã Â¸Å Ã Â¹â€°: <code>/reset_at 100</code>")
    elif cmd == "/check":
        wr = (s.get('wins', 0) / s['bets'] * 100) if s.get('bets', 0) > 0 else 0
        step = s.get('martingale_step', 1)
        profit = s.get('profit', 0)
        status = "Ã°Å¸Å¸Â¢ <b>Ã Â¹ÂÃ Â¸â€šÃ Â¹â€¡Ã Â¸â€¡Ã Â¹ÂÃ Â¸Â£Ã Â¸â€¡Ã Â¸Â¡Ã Â¸Â²Ã Â¸Â (Healthy)</b>"
        advice = "Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸â€”Ã Â¸Â³Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸â€ºÃ Â¸ÂÃ Â¸â€¢Ã Â¸Â´ Ã Â¹â‚¬Ã Â¸â€Ã Â¸Â´Ã Â¸â„¢Ã Â¸Â«Ã Â¸â„¢Ã Â¹â€°Ã Â¸Â²Ã Â¸â€¢Ã Â¹Ë†Ã Â¸Â­Ã Â¹â€žÃ Â¸â€Ã Â¹â€°Ã Â¸Â¢Ã Â¸Â²Ã Â¸Â§Ã Â¹â€  Ã Â¸â€žÃ Â¸Â£Ã Â¸Â±Ã Â¸Å¡"
        if wr < 47:
            status = "Ã°Å¸Å¸Â¡ <b>Ã Â¹â‚¬Ã Â¸ÂÃ Â¹â€°Ã Â¸Â²Ã Â¸Â£Ã Â¸Â°Ã Â¸Â§Ã Â¸Â±Ã Â¸â€¡ (Warning)</b>"
            advice = "Ã Â¸Å Ã Â¹Ë†Ã Â¸Â§Ã Â¸â€¡Ã Â¸â„¢Ã Â¸ÂµÃ Â¹â€°Ã Â¸â€Ã Â¸Â§Ã Â¸â€¡Ã Â¸â€¢Ã Â¸ÂÃ Â¹â‚¬Ã Â¸Â¥Ã Â¹â€¡Ã Â¸ÂÃ Â¸â„¢Ã Â¹â€°Ã Â¸Â­Ã Â¸Â¢ Ã Â¹ÂÃ Â¸Å¾Ã Â¹â€°Ã Â¸Å¡Ã Â¹Ë†Ã Â¸Â­Ã Â¸Â¢Ã Â¸ÂÃ Â¸Â§Ã Â¹Ë†Ã Â¸Â²Ã Â¸â€ºÃ Â¸ÂÃ Â¸â€¢Ã Â¸Â´"
        if step >= 10:
            status = "Ã°Å¸Å¸Â  <b>Ã Â¸â€žÃ Â¸Â§Ã Â¸Â²Ã Â¸Â¡Ã Â¸â€Ã Â¸Â±Ã Â¸â„¢Ã Â¸ÂªÃ Â¸Â¹Ã Â¸â€¡ (Caution)</b>"
            advice = "Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸ÂÃ Â¸Â³Ã Â¸Â¥Ã Â¸Â±Ã Â¸â€¡Ã Â¸ÂªÃ Â¸Â¹Ã Â¹â€°Ã Â¸Â«Ã Â¸â„¢Ã Â¸Â±Ã Â¸Â (Step 10+) Ã Â¸â€žÃ Â¸Â§Ã Â¸Â£Ã Â¸Ë†Ã Â¸Â±Ã Â¸Å¡Ã Â¸â€¢Ã Â¸Â²Ã Â¸â€Ã Â¸Â¹Ã Â¹Æ’Ã Â¸ÂÃ Â¸Â¥Ã Â¹â€°Ã Â¸Å Ã Â¸Â´Ã Â¸â€"
        if step >= 18:
            status = "Ã°Å¸â€Â´ <b>Ã Â¸Â­Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€¢Ã Â¸Â£Ã Â¸Â²Ã Â¸Â¢ (Critical)</b>"
            advice = "Ã Â¹â‚¬Ã Â¸ÂªÃ Â¸ÂµÃ Â¹Ë†Ã Â¸Â¢Ã Â¸â€¡Ã Â¸Å¾Ã Â¸Â­Ã Â¸Â£Ã Â¹Å’Ã Â¸â€¢Ã Â¹ÂÃ Â¸â€¢Ã Â¸Â! Ã Â¸Å¾Ã Â¸Â´Ã Â¸Ë†Ã Â¸Â²Ã Â¸Â£Ã Â¸â€œÃ Â¸Â²Ã Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸Å Ã Â¸Â±Ã Â¹Ë†Ã Â¸Â§Ã Â¸â€žÃ Â¸Â£Ã Â¸Â²Ã Â¸Â§"
        if profit < 0:
            advice += "\n<i>*Ã Â¸â€¢Ã Â¸Â­Ã Â¸â„¢Ã Â¸â„¢Ã Â¸ÂµÃ Â¹â€°Ã Â¸Â¢Ã Â¸Â±Ã Â¸â€¡Ã Â¸Â­Ã Â¸Â¢Ã Â¸Â¹Ã Â¹Ë†Ã Â¹Æ’Ã Â¸â„¢Ã Â¸Å Ã Â¹Ë†Ã Â¸Â§Ã Â¸â€¡Ã Â¸â€”Ã Â¸Â§Ã Â¸â€¡Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢Ã Â¸â€žÃ Â¸Â·Ã Â¸â„¢</i>"

        tg(
            f"Ã°Å¸ÂÂ¥ <b>Ã Â¸Å“Ã Â¸Â¥Ã Â¸â€¢Ã Â¸Â£Ã Â¸Â§Ã Â¸Ë†Ã Â¸ÂªÃ Â¸Â¸Ã Â¸â€šÃ Â¸Â Ã Â¸Â²Ã Â¸Å¾Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”</b>\n"
            f"Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â°: {status}\n"
            f"------------------------\n"
            f"Win Rate : {wr:.1f}% (Ã Â¹â‚¬Ã Â¸â€ºÃ Â¹â€°Ã Â¸Â²Ã Â¸Â«Ã Â¸Â¡Ã Â¸Â²Ã Â¸Â¢ 49%)\n"
            f"Step : Ã Â¸â€šÃ Â¸Â±Ã Â¹â€°Ã Â¸â„¢Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë† {step}\n"
            f"Profit   : {profit:+.8f} TRX\n"
            f"------------------------\n"
            f"Ã°Å¸Â©Âº <b>Ã Â¸â€žÃ Â¸Â³Ã Â¹ÂÃ Â¸â„¢Ã Â¸Â°Ã Â¸â„¢Ã Â¸Â³:</b>\n{advice}"
        )
    elif cmd == "/config":
        tp = s.get('take_profit', 0)
        sl = s.get('stop_loss', 0)
        curr_cond = s.get('condition', 'N/A').upper()
        bet = s.get('current_bet', 0)
        tg(
            f"Ã¢Å¡â„¢Ã¯Â¸Â <b>BOT CONFIGURATION</b>\n"
            f"------------------------\n"
            f"Ã°Å¸Å½Â¯ <b>Take Profit</b> : {tp:+.2f} TRX\n"
            f"Ã°Å¸â€ºâ€˜ <b>Stop Loss</b>   : {sl:.2f} TRX\n"
            f"Ã°Å¸Å½Â² <b>Condition</b>   : {curr_cond}\n"
            f"Ã°Å¸â€™Âµ <b>Current Bet</b> : {bet:.8f} TRX\n"
            f"Ã°Å¸â€â€ž <b>Auto-Reset</b>  : Enabled (2m Pause)"
        )
    elif cmd == "/reset_stats":
        if os.path.exists(STATS_FILE):
            os.remove(STATS_FILE)
        tg("Ã°Å¸Â§Â¹ <b>Ã Â¸Â¥Ã Â¹â€°Ã Â¸Â²Ã Â¸â€¡Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â´Ã Â¸â€¢Ã Â¸Â´Ã Â¸ÂªÃ Â¸Â°Ã Â¸ÂªÃ Â¸Â¡Ã Â¹â‚¬Ã Â¸Â£Ã Â¸ÂµÃ Â¸Â¢Ã Â¸Å¡Ã Â¸Â£Ã Â¹â€°Ã Â¸Â­Ã Â¸Â¢Ã Â¹ÂÃ Â¸Â¥Ã Â¹â€°Ã Â¸Â§!</b>\nÃ Â¸ÂÃ Â¸Â£Ã Â¸Â¸Ã Â¸â€œÃ Â¸Â²Ã Â¸Â£Ã Â¸ÂµÃ Â¸ÂªÃ Â¸â€¢Ã Â¸Â²Ã Â¸Â£Ã Â¹Å’Ã Â¸â€”Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¹â‚¬Ã Â¸Â£Ã Â¸Â´Ã Â¹Ë†Ã Â¸Â¡Ã Â¸â„¢Ã Â¸Â±Ã Â¸Å¡Ã Â¹Æ’Ã Â¸Â«Ã Â¸Â¡Ã Â¹Ë†")
    
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
            f"Ã°Å¸â€œâ€ž <b>ACCOUNTING DAILY REPORT</b>\n"
            f"--------------------------------\n"
            f"Ã°Å¸â€œâ€¦ Date: {datetime.now().strftime('%d/%m/%Y')}\n"
            f"Ã¢ÂÂ° Time: {datetime.now().strftime('%H:%M')}\n"
            f"--------------------------------\n"
            f"Ã°Å¸â€™Â° <b>Total Assets:</b> {curr_bal:.8f} TRX\n"
            f"Ã°Å¸â€œË† <b>Total Profit:</b> {profit:+.8f} TRX\n"
            f"Ã°Å¸â€œÅ  <b>Current ROI :</b> {roi:.2f}%\n"
            f"--------------------------------\n"
            f"Ã°Å¸ÂÂ¢ <b>FUND BREAKDOWN</b>\n"
            f"Ã°Å¸â€™Âµ Operating  : {operating:.4f} TRX\n"
            f"Ã°Å¸â€â€™ Locked Prof: {locked:.4f} TRX\n"
            f"Ã°Å¸â€ºÂ¡Ã¯Â¸Â Reserve    : {reserve:.4f} TRX\n"
            f"--------------------------------\n"
            f"Ã°Å¸Å½Â° Total Wagered: {wagered:.4f} TRX\n"
            f"Ã°Å¸â€Â¢ Total Counts : {bets:,} bets\n"
            f"--------------------------------\n"
            f"<i>Reported by: Corporate Accountant Bot</i>"
        )
        tg(msg)
    else:
        _send_main_menu()

def _send_main_menu():
    tg(
        "Ã°Å¸Â¤â€“ <b>COMMANDER BRIAN Ã¢â‚¬â€ Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸â„¢Ã Â¸Â¹Ã Â¸Â«Ã Â¸Â¥Ã Â¸Â±Ã Â¸Â</b>\n"
        "Ã Â¸ÂÃ Â¸â€Ã Â¸â€ºÃ Â¸Â¸Ã Â¹Ë†Ã Â¸Â¡Ã Â¸â€Ã Â¹â€°Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â¥Ã Â¹Ë†Ã Â¸Â²Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€Ã Â¸Â¹Ã Â¸â€šÃ Â¹â€°Ã Â¸Â­Ã Â¸Â¡Ã Â¸Â¹Ã Â¸Â¥Ã Â¸Â«Ã Â¸Â£Ã Â¸Â·Ã Â¸Â­Ã Â¸â€¢Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡Ã Â¸â€žÃ Â¹Ë†Ã Â¸Â²",
        reply_markup=main_menu_markup()
    )

def _tg_listener():
    """Background thread: poll Telegram every 2s for commands."""
    global _tg_offset
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates"
    # Flush old messages on startup Ã¢â‚¬â€ skip anything already queued
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

                # Ã¢â€â‚¬Ã¢â€â‚¬ Ã Â¸â€šÃ Â¹â€°Ã Â¸Â­Ã Â¸â€žÃ Â¸Â§Ã Â¸Â²Ã Â¸Â¡Ã Â¸â€ºÃ Â¸ÂÃ Â¸â€¢Ã Â¸Â´ (text command) Ã¢â€â‚¬Ã¢â€â‚¬
                msg = upd.get("message", {})
                if msg:
                    chat_id = str(msg.get("chat", {}).get("id", ""))
                    text = msg.get("text", "").strip().lower() if msg.get("text") else ""
                    if chat_id == TELEGRAM_CHAT_ID:
                        if text in ("/start", "/menu"):
                            _send_main_menu()
                        elif text.startswith("/"):
                            _handle_command(text)

                # Ã¢â€â‚¬Ã¢â€â‚¬ Callback query (Ã Â¸ÂÃ Â¸â€Ã Â¸â€ºÃ Â¸Â¸Ã Â¹Ë†Ã Â¸Â¡ inline keyboard) Ã¢â€â‚¬Ã¢â€â‚¬
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
                            "Ã°Å¸Â¤â€“ <b>COMMANDER BRIAN Ã¢â‚¬â€ Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸â„¢Ã Â¸Â¹Ã Â¸Â«Ã Â¸Â¥Ã Â¸Â±Ã Â¸Â</b>\nÃ Â¸ÂÃ Â¸â€Ã Â¸â€ºÃ Â¸Â¸Ã Â¹Ë†Ã Â¸Â¡Ã Â¸â€Ã Â¹â€°Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â¥Ã Â¹Ë†Ã Â¸Â²Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€Ã Â¸Â¹Ã Â¸â€šÃ Â¹â€°Ã Â¸Â­Ã Â¸Â¡Ã Â¸Â¹Ã Â¸Â¥Ã Â¸Â«Ã Â¸Â£Ã Â¸Â·Ã Â¸Â­Ã Â¸â€¢Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡Ã Â¸â€žÃ Â¹Ë†Ã Â¸Â²",
                            reply_markup=main_menu_markup())
                    elif data == "tp_menu":
                        tg_edit(cb_chat, cb_mid,
                            "Ã°Å¸Å½Â¯ <b>Ã Â¹â‚¬Ã Â¸Â¥Ã Â¸Â·Ã Â¸Â­Ã Â¸Â Take Profit</b>\nÃ Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸Ë†Ã Â¸Â°Ã Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸ÂÃ Â¸Â³Ã Â¹â€žÃ Â¸Â£Ã Â¸â€“Ã Â¸Â¶Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸â€ºÃ Â¹â€°Ã Â¸Â²",
                            reply_markup=tp_menu_markup())
                    elif data == "sl_menu":
                        tg_edit(cb_chat, cb_mid,
                            "Ã°Å¸â€ºâ€˜ <b>Ã Â¹â‚¬Ã Â¸Â¥Ã Â¸Â·Ã Â¸Â­Ã Â¸Â Stop Loss</b>\nÃ Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸Ë†Ã Â¸Â°Ã Â¸Å¾Ã Â¸Â±Ã Â¸Â 2 Ã Â¸â„¢Ã Â¸Â²Ã Â¸â€”Ã Â¸ÂµÃ Â¹â‚¬Ã Â¸Â¡Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€šÃ Â¸Â²Ã Â¸â€Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢Ã Â¸â€“Ã Â¸Â¶Ã Â¸â€¡Ã Â¸Ë†Ã Â¸Â¸Ã Â¸â€Ã Â¸â„¢Ã Â¸ÂµÃ Â¹â€°",
                            reply_markup=sl_menu_markup())
                    elif data.startswith("/"):
                        _handle_command(data)

        except Exception:
            pass
        time.sleep(1)

# ============================================================
#  STAKE DICE BOT - MARTINGALE STRATEGY + CMD DASHBOARD
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
    def __init__(self, token, cookies, currency="trx", simulate=False, mirror_host="stake.games", proxy=""):
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
        # Ã Â¹Æ’Ã Â¸Å Ã Â¹â€° rotateServerSeed Ã Â¸â€¹Ã Â¸Â¶Ã Â¹Ë†Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸â€ºÃ Â¹â€¡Ã Â¸â„¢Ã Â¸Â§Ã Â¸Â´Ã Â¸ËœÃ Â¸ÂµÃ Â¸Â¡Ã Â¸Â²Ã Â¸â€¢Ã Â¸Â£Ã Â¸ÂÃ Â¸Â²Ã Â¸â„¢Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë†Ã Â¹â‚¬Ã Â¸Â§Ã Â¹â€¡Ã Â¸Å¡Ã Â¸Â¢Ã Â¸Â­Ã Â¸Â¡Ã Â¸Â£Ã Â¸Â±Ã Â¸Å¡ (Ã Â¸Â«Ã Â¸Â¡Ã Â¸Â¸Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡ Server Ã Â¹ÂÃ Â¸Â¥Ã Â¸Â° Client Seed)
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
                msg = f"Ã°Å¸â€â€ž <b>Seed Rotated ({reason})</b>\nÃ Â¸Â£Ã Â¸Â°Ã Â¸Å¡Ã Â¸Å¡Ã Â¸â€”Ã Â¸Â³Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸Â«Ã Â¸Â¡Ã Â¸Â¸Ã Â¸â„¢ Seed Ã Â¹Æ’Ã Â¸Â«Ã Â¸Â¡Ã Â¹Ë†Ã Â¹â‚¬Ã Â¸Â£Ã Â¸ÂµÃ Â¸Â¢Ã Â¸Å¡Ã Â¸Â£Ã Â¹â€°Ã Â¸Â­Ã Â¸Â¢Ã Â¹ÂÃ Â¸Â¥Ã Â¹â€°Ã Â¸Â§\n<i>*Server Seed Reset Ã Â¸ÂªÃ Â¸Â³Ã Â¹â‚¬Ã Â¸Â£Ã Â¹â€¡Ã Â¸Ë†</i>"
                self.log_event(f"Ã°Å¸â€â€ž Seed Rotated ({reason}): Server seed changed successfully.")
                tg(msg)
                return True
            else:
                error_list = res.get("errors") if res else []
                error_msg = error_list[0].get("message", "Unknown API rejection") if error_list else "No response from API"
                self.log_event(f"Ã¢Å¡Â Ã¯Â¸Â Seed Rotation Rejected: {error_msg}")
                # tg(f"Ã¢Å¡Â Ã¯Â¸Â <b>API Seed Rotation Rejected</b>\nÃ Â¹â‚¬Ã Â¸Â«Ã Â¸â€¢Ã Â¸Â¸Ã Â¸Å“Ã Â¸Â¥: {error_msg}") # Don't spam TG for minor rotation failure
        except Exception as e:
            self.log_event(f"Ã¢Å¡Â Ã¯Â¸Â Seed Rotation Error: {str(e)}")
        return False

    def get_total_bets_from_stats(self):
        """Ã Â¸â€Ã Â¸Â¶Ã Â¸â€¡Ã Â¸Ë†Ã Â¸Â³Ã Â¸â„¢Ã Â¸Â§Ã Â¸â„¢ Bet Ã Â¸â€ºÃ Â¸Â±Ã Â¸Ë†Ã Â¸Ë†Ã Â¸Â¸Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢Ã Â¸Ë†Ã Â¸Â²Ã Â¸ÂÃ Â¸ÂªÃ Â¸â€“Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â°Ã Â¸Â¥Ã Â¹Ë†Ã Â¸Â²Ã Â¸ÂªÃ Â¸Â¸Ã Â¸â€"""
        return _bot_state.get('bets', 0)

    def save_daily_report(self, start_bal, end_bal, profit, wagered, deposits=0, withdrawals=0):
        """Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¶Ã Â¸ÂÃ Â¸Å¡Ã Â¸Â±Ã Â¸ÂÃ Â¸Å Ã Â¸ÂµÃ Â¸Â£Ã Â¸Â²Ã Â¸Â¢Ã Â¸Â§Ã Â¸Â±Ã Â¸â„¢Ã Â¸ÂªÃ Â¸Â³Ã Â¸Â«Ã Â¸Â£Ã Â¸Â±Ã Â¸Å¡Ã Â¸Å¡Ã Â¸Â£Ã Â¸Â´Ã Â¸Â©Ã Â¸Â±Ã Â¸â€” (CSV)"""
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
            self.log_event(f"Ã°Å¸â€œË† Daily Accounting Report Saved: {date_today}")
        except Exception as e:
            self.log_event(f"Ã¢Å¡Â Ã¯Â¸Â Failed to save daily report: {str(e)}")

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
                print(f"   [NET] Sending Bet Query (Attempt {attempt+1})...", end="\r")
                result = self._execute_graphql(query, variables=variables, operation_name=operation_name)
                if result and "data" in result and result["data"]:
                    return result
                if "errors" in result:
                    err_msg = str(result["errors"][0].get("message", ""))
                    if "JS Fetch Timeout" in err_msg:
                        print(f"   [!] Cloudflare blocked the bet. Retrying...", end="\r")
                        time.sleep(2)
                        continue
                    if "rate limit" in err_msg.lower() or "too many" in err_msg.lower():
                        self.log_event("Ã¢ÂÂ³ API Rate Limit detected. Cooling down...")
                        time.sleep(15) # Wait longer on rate limit
            except Exception as e:
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

    def start_dice_bot(self, base_bet, target=49.00, condition="below"):
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
        martingale_step = persistent.get("last_martingale_step", 0)
        saved_condition = persistent.get("last_condition")
        current_condition = saved_condition if saved_condition else condition
        if current_condition == "above":
            target = 51.00
        else:
            target = 49.00
        total_withdrawn = persistent.get("total_withdrawn", 300.0)
        total_deposited = persistent.get("total_deposited", 0.0)
        max_martingale_step = persistent.get("max_martingale_step", 0)
        start_balance = persistent.get("initial_balance", 0.0)
        initial_capital = persistent.get("initial_capital", 1243.154)
        peak_equity = persistent.get("peak_equity", 0.0)
        max_drawdown = persistent.get("max_drawdown", 0.0)

        print(" [DEBUG] 1. Setting up strategy variables...")
        # Martingale system initialized
        
        print(" [DEBUG] 2. Initializing session parameters...")
        self.next_rotation_bet = random.randint(800, 1500)
        self.last_manual_rotation_alert = 0
        recent = []
        last_result = "-"
        last_roll = 0.0
        last_net = 0.0
        streak = 0
        streak_type = None
        current_loss_streak = 0
        
        virtual_mode = False
        
        cycle_start_balance = 0.0
        
        BET_ALERT_MULTIPLIERS = [100, 250, 500, 1000]
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
        listener = threading.Thread(target=_tg_listener, daemon=True)
        listener.start()
        threading.Thread(target=corporate_heartbeat, daemon=True).start()

        # Ã Â¹ÂÃ Â¸Ë†Ã Â¹â€°Ã Â¸â€¡ Telegram Ã Â¸Å¾Ã Â¸Â£Ã Â¹â€°Ã Â¸Â­Ã Â¸Â¡ inline menu
        tg(
            "Ã°Å¸Å¸Â¢ <b>COMMANDER BRIAN Ã Â¹â‚¬Ã Â¸Â£Ã Â¸Â´Ã Â¹Ë†Ã Â¸Â¡Ã Â¸â€”Ã Â¸Â³Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¹ÂÃ Â¸Â¥Ã Â¹â€°Ã Â¸Â§!</b>\n"
            f"Ã°Å¸â€™Â± Currency: <b>{self.currency.upper()}</b> | Mode: <b>{'SIMULATE' if self.simulate else 'LIVE'}</b>\n"
            "Ã Â¸ÂÃ Â¸â€Ã Â¸â€ºÃ Â¸Â¸Ã Â¹Ë†Ã Â¸Â¡Ã Â¸â€Ã Â¹â€°Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â¥Ã Â¹Ë†Ã Â¸Â²Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€žÃ Â¸Â§Ã Â¸Å¡Ã Â¸â€žÃ Â¸Â¸Ã Â¸Â¡Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”",
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

                # --- VIRTUAL PAUSE MODE (3-LOSS) ---
                if current_loss_streak >= 3 and not virtual_mode:
                    virtual_mode = True
                    self.log_event(f"🐉 VIRTUAL PAUSE ENGAGED (แพ้ติด 3 ตา รอมังกรขาด)")
                    # tg(f"🐉 <b>STREAK BREAKER (VIRTUAL)</b>\nแพ้ติด 3 ตา! บอทเข้าโหมดแทงลม รอมังกรขาด (ชนะ 1 ตา) เพื่อความปลอดภัย")
                
                if virtual_mode:
                    target_patterns = [
                        ['W']
                    ]
                    matched = None
                    for pat in target_patterns:
                        if len(recent) >= len(pat) and recent[-len(pat):] == pat:
                            matched = "-".join(pat)
                            break
                    
                    if matched:
                        virtual_mode = False
                        self.log_event(f"✂️ STREAK BREAKER MATCHED (Got W)! Resuming real bet.")
                        # tg(f"✂️ <b>มังกรขาดแล้ว! (STREAK BREAKER)</b>\nระบบตัดมังกรแดงสำเร็จ บอทกลับมาแทงด้วยเงินจริงแล้ว!")
                
                # --- BET SIZING ---
                if martingale_step == 0:
                    # base_bet from config.json
                    if base_bet < 0.0005:
                        base_bet = 0.0005
                        
                if virtual_mode:
                    current_bet = 0.0
                else:
                    current_bet = round(base_bet * (2 ** martingale_step), 8)
                
                if _stop_event.is_set(): return

                stress_trigger = (martingale_step >= 14)
                time_trigger = (total_bets >= self.next_rotation_bet)
                if stress_trigger or time_trigger:
                    reason = "High Stress" if stress_trigger else "Adaptive"
                    self.rotate_seed(reason)
                
                bet_res = self.place_dice_bet(current_bet, target, current_condition)
                if not bet_res or "data" not in bet_res or not bet_res["data"] or not bet_res["data"].get("diceRoll"):
                    self.log_event("Ã¢Å¡Â Ã¯Â¸Â Incomplete bet response. Retrying...")
                    time.sleep(5); continue

                roll_data = bet_res["data"]["diceRoll"]
                payout = float(roll_data.get("payout", 0))
                result_state = roll_data.get("state")
                if not result_state:
                    self.log_event("Ã¢Å¡Â Ã¯Â¸Â Missing roll state. Retrying...")
                    time.sleep(5); continue
                result = float(result_state.get("result", 0))
                
                is_win = False
                if current_condition == "above" and result > target: is_win = True
                elif current_condition == "below" and result < target: is_win = True
                
                # Z-Score Real-Time Client Seed Rotation
                expected_prob = target / 100.0 if current_condition == "below" else (100.0 - target) / 100.0
                self.z_rotator.add_result(is_win, expected_prob)
                
                if total_bets % 100 == 0:
                    new_balance = self.get_wallet_balance()
                    if new_balance == 0: new_balance = balance - current_bet + payout
                else:
                    new_balance = balance - current_bet + payout
                
                # Ã¢â€â‚¬Ã¢â€â‚¬ 3. GOAL & RISK MANAGEMENT Ã¢â€â‚¬Ã¢â€â‚¬
                # Check Daily Target (TP)
                target_tp = _bot_state.get('take_profit', 0.0)
                if target_tp > 0 and total_profit >= target_tp:
                    tg(f"Ã°Å¸Å½Â¯ <b>DAILY GOAL REACHED! (+{total_profit:.2f} TRX)</b>\n"
                       f"Ã Â¹â‚¬Ã Â¸â€ºÃ Â¹â€°Ã Â¸Â²Ã Â¸Â«Ã Â¸Â¡Ã Â¸Â²Ã Â¸Â¢: {target_tp:+.2f} TRX\n"
                       f"Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸â€”Ã Â¸Â³Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¶Ã Â¸ÂÃ Â¸Å¡Ã Â¸Â±Ã Â¸ÂÃ Â¸Å Ã Â¸ÂµÃ Â¹ÂÃ Â¸Â¥Ã Â¸Â°Ã Â¸Å¾Ã Â¸Â±Ã Â¸ÂÃ Â¹â‚¬Ã Â¸â€¹Ã Â¸ÂªÃ Â¸Å Ã Â¸Â±Ã Â¹Ë†Ã Â¸â„¢Ã Â¸Å Ã Â¸Â±Ã Â¹Ë†Ã Â¸Â§Ã Â¸â€žÃ Â¸Â£Ã Â¸Â²Ã Â¸Â§...")
                    
                    self.save_daily_report(
                        start_bal=start_balance,
                        end_bal=balance,
                        profit=total_profit,
                        wagered=total_wagered,
                        deposits=total_deposited,
                        withdrawals=total_withdrawn
                    )
                    
                    self.log_event(f"Ã°Å¸Å½Â¯ Daily Goal Reached: {total_profit:.8f} TRX. Auto-pausing for safety.")
                    
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
                # Ã Â¹Æ’Ã Â¸Å Ã Â¹â€° threshold 1.0 TRX Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸ÂÃ Â¸Â£Ã Â¸Â­Ã Â¸â€¡ floating point error Ã Â¹ÂÃ Â¸Â¥Ã Â¸Â° payout Ã Â¹â‚¬Ã Â¸Â¥Ã Â¹â€¡Ã Â¸ÂÃ Â¹â€ 
                if abs(delta) > 1.0:
                    type_str = "DEPOSIT" if delta > 0 else "WITHDRAWAL"
                    self.log_event(f"Ã°Å¸ÂÂ¦ External Balance Change: {type_str} detected ({delta:+.8f} TRX)")
                    if delta < 0:
                        total_withdrawn += abs(delta)
                    else:
                        # Ã Â¸ÂÃ Â¸Â²Ã Â¸ÂÃ Â¹â‚¬Ã Â¸â€¡Ã Â¸Â´Ã Â¸â„¢Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â´Ã Â¹Ë†Ã Â¸Â¡ Ã¢â€ â€™ Ã Â¸Â­Ã Â¸Â±Ã Â¸â€ºÃ Â¹â‚¬Ã Â¸â€Ã Â¸â€¢Ã Â¸â€¢Ã Â¹â€°Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢Ã Â¸Â­Ã Â¸Â±Ã Â¸â€¢Ã Â¹â€šÃ Â¸â„¢Ã Â¸Â¡Ã Â¸Â±Ã Â¸â€¢Ã Â¸Â´
                        total_deposited += delta
                        initial_capital += delta
                        tg(
                            f"Ã°Å¸ÂÂ¦ <b>Ã Â¸â€¢Ã Â¸Â£Ã Â¸Â§Ã Â¸Ë†Ã Â¸Å¾Ã Â¸Å¡Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸ÂÃ Â¸Â²Ã Â¸ÂÃ Â¹â‚¬Ã Â¸â€¡Ã Â¸Â´Ã Â¸â„¢!</b>\n"
                            f"Ã°Å¸â€™Âµ Ã Â¸ÂÃ Â¸Â²Ã Â¸ÂÃ Â¹â‚¬Ã Â¸Å¾Ã Â¸Â´Ã Â¹Ë†Ã Â¸Â¡ : <b>+{delta:.4f} TRX</b>\n"
                            f"Ã°Å¸â€œÅ  Ã Â¸â€¢Ã Â¹â€°Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢Ã Â¸Â£Ã Â¸Â§Ã Â¸Â¡ : <b>{initial_capital:.4f} TRX</b>\n"
                            f"<i>Ã Â¸Â­Ã Â¸Â±Ã Â¸â€ºÃ Â¹â‚¬Ã Â¸â€Ã Â¸â€¢Ã Â¸â€¢Ã Â¹â€°Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢Ã Â¸Â­Ã Â¸Â±Ã Â¸â€¢Ã Â¹â€šÃ Â¸â„¢Ã Â¸Â¡Ã Â¸Â±Ã Â¸â€¢Ã Â¸Â´Ã Â¹ÂÃ Â¸Â¥Ã Â¹â€°Ã Â¸Â§</i>"
                        )
                    start_balance += delta
                    cycle_start_balance += delta
                
                total_bets += 1
                total_wagered += current_bet
                
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
                
                if is_win:
                    if virtual_mode:
                        pass # Do nothing special for virtual win
                    else:
                        wins += 1
                        session_wins += 1
                        current_loss_streak = 0
                        if streak_type == "W": streak += 1
                        else: streak, streak_type = 1, "W"
                        
                        martingale_step = 0
                else:
                    if virtual_mode:
                        pass # Do nothing special for virtual loss
                    else:
                        losses += 1
                        current_loss_streak += 1
                        if current_loss_streak > max_loss_streak: max_loss_streak = current_loss_streak
                        if martingale_step > max_martingale_step:
                            max_martingale_step = martingale_step
                        if max_martingale_step >= 10:
                            self.log_event(f"Ã°Å¸Â§â€” Climber: Reached new high Step {max_martingale_step+1}")
                        if current_bet > max_single_loss: max_single_loss = current_bet
                        martingale_step += 1
                    
                    if streak_type == "L": streak += 1
                    else: streak, streak_type = 1, "L"
                
                last_roll = result
                last_net = payout - current_bet
                last_result = "WIN" if is_win else "LOSS"
                recent.append("W" if is_win else "L")

                if len(recent) > 10:
                    recent.pop(0)
                # Removed fib limit check

                # Ã¢â€â‚¬Ã¢â€â‚¬ 3. TP/SL AUTOMATION Ã¢â€â‚¬Ã¢â€â‚¬
                if take_profit > 0 and total_profit >= take_profit:
                    tg(f"Ã°Å¸ÂÂ <b>TAKE PROFIT REACHED!</b>\n"
                       f"Profit: <b>{total_profit:+.8f} TRX</b>\n"
                       f"Ã Â¹â‚¬Ã Â¸â€ºÃ Â¹â€°Ã Â¸Â²Ã Â¸Â«Ã Â¸Â¡Ã Â¸Â²Ã Â¸Â¢: {take_profit:+.2f} TRX\n"
                       f"<b>Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸â€”Ã Â¸Â³Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£ Reset Ã Â¸Â¢Ã Â¸Â­Ã Â¸â€Ã Â¹ÂÃ Â¸â€”Ã Â¸â€¡Ã Â¹ÂÃ Â¸Â¥Ã Â¸Â°Ã Â¹â‚¬Ã Â¸Â£Ã Â¸Â´Ã Â¹Ë†Ã Â¸Â¡Ã Â¸â„¢Ã Â¸Â±Ã Â¸Å¡Ã Â¸ÂÃ Â¸Â³Ã Â¹â€žÃ Â¸Â£Ã Â¹Æ’Ã Â¸Â«Ã Â¸Â¡Ã Â¹Ë† (No Stop)</b>")
                    self.log_event(f"Ã°Å¸ÂÂ Take Profit Reached: {total_profit:.8f} TRX. Resetting and continuing.")
                    
                    # Reset strategy and profit tracking for the next cycle
                    if martingale_step >= 14: # Step 15 or higher
                        tg(f"Ã¢Å¡Â Ã¯Â¸Â <b>HIGH-RISK RECOVERY DETECTED (Step {martingale_step+1})</b>\n"
                       f"CEO Ã Â¸ÂªÃ Â¸Â±Ã Â¹Ë†Ã Â¸â€¡Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¹Æ’Ã Â¸Â«Ã Â¹â€°Ã Â¸Å¾Ã Â¸Â±Ã Â¸ÂÃ Â¸Å¾Ã Â¸â„¢Ã Â¸Â±Ã Â¸ÂÃ Â¸â€¡Ã Â¸Â²Ã Â¸â„¢ 15 Ã Â¸â„¢Ã Â¸Â²Ã Â¸â€”Ã Â¸Âµ Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€žÃ Â¸Â§Ã Â¸Â²Ã Â¸Â¡Ã Â¸â€ºÃ Â¸Â¥Ã Â¸Â­Ã Â¸â€Ã Â¸Â Ã Â¸Â±Ã Â¸Â¢Ã Â¸â€šÃ Â¸Â­Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸â€¡Ã Â¸Â´Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢Ã Â¹ÂÃ Â¸Â¥Ã Â¸Â°Ã Â¹â‚¬Ã Â¸â€ºÃ Â¸Â¥Ã Â¸ÂµÃ Â¹Ë†Ã Â¸Â¢Ã Â¸â„¢Ã Â¸Ë†Ã Â¸Â±Ã Â¸â€¡Ã Â¸Â«Ã Â¸Â§Ã Â¸Â° Seed...")
                        self.log_event(f"Safety Pause triggered after Step {martingale_step+1} recovery.")
                        # Rotate seed to be sure
                        self.rotate_seed("High-Risk Recovery")
                        time.sleep(900) # 15 minutes pause
                    
                    martingale_step = 0
                    current_loss_streak = 0
                    streak = 0
                    streak_type = None
                    virtual_mode = True
                    start_balance = new_balance # Reset start balance to current to track next TP goal
                    total_deposited = 0
                    total_withdrawn = 0
                    
                    # Optional: Rotate seed
                    self.rotate_seed("Take Profit Reset")
                    continue 
                # (Stop Loss feature has been removed as per user request)

                # Ã¢â€â‚¬Ã¢â€â‚¬ 4. DYNAMIC CONDITION SWITCHING Ã¢â€â‚¬Ã¢â€â‚¬
                # Switch between below 49 <-> above 51 (both = 49% win chance)
                if (streak_type == "L" and streak >= 3) or (streak_type == "W" and streak >= 5):
                    old_cond = current_condition
                    current_condition = "above" if current_condition == "below" else "below"
                    target = round(100 - target, 2)  # 49 -> 51, 51 -> 49
                    condition_switches += 1
                    reason = "Loss Streak" if streak_type == "L" else "Win Streak"
                    self.log_event(f"Ã°Å¸â€â€ž Condition Switched ({reason}): {old_cond.upper()} -> {current_condition.upper()} {target} (49% side)")
                    streak = 0

                # Ã¢â€â‚¬Ã¢â€â‚¬ 5. Ã Â¸ÂªÃ Â¸Â£Ã Â¸Â¸Ã Â¸â€ºÃ Â¸Â¢Ã Â¸Â­Ã Â¸â€Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¹â‚¬Ã Â¸â€¢Ã Â¸Â£Ã Â¸ÂµÃ Â¸Â¢Ã Â¸Â¡Ã Â¸â€¢Ã Â¸Â²Ã Â¸â€“Ã Â¸Â±Ã Â¸â€Ã Â¹â€žÃ Â¸â€º Ã¢â€â‚¬Ã¢â€â‚¬
                balance = new_balance

                # Ã¢â€â‚¬Ã¢â€â‚¬ 4. Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¶Ã Â¸ÂÃ Â¹ÂÃ Â¸Â¥Ã Â¸Â°Ã Â¸Â­Ã Â¸Â±Ã Â¸â€ºÃ Â¹â‚¬Ã Â¸â€Ã Â¸â€¢Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â° (State Sync) Ã¢â€â‚¬Ã¢â€â‚¬
                save_stats({
                    "total_profit": total_profit,
                    "total_bets": total_bets,
                    "total_wagered": total_wagered,
                    "wins": wins,
                    "losses": losses,
                    "max_loss_streak": max_loss_streak,
                    "max_single_loss": max_single_loss,
                    "last_martingale_step": martingale_step,
                    "last_condition": current_condition,
                    "initial_balance": start_balance,
                    "total_withdrawn": total_withdrawn,
                    "total_deposited": total_deposited,
                    "max_martingale_step": max_martingale_step,
                    "initial_capital": initial_capital,
                    "peak_equity": peak_equity,
                    "max_drawdown": max_drawdown,
                    "take_profit": take_profit,
                    "stop_loss": stop_loss,
                    "total_uptime_seconds": total_uptime_seconds
                })

                _bot_state.update({
                    'balance'       : balance,
                    'start_balance' : initial_capital, # ROI now tracks from initial_capital
                    'profit'        : total_profit,
                    'total_withdrawn': total_withdrawn,
                    'initial_capital': initial_capital,
                    'peak_equity': peak_equity,
                    'max_drawdown': max_drawdown,
                    'bets'          : total_bets,
                    'wins'          : wins,
                    'max_loss_streak': max_loss_streak,
                    'max_single_loss': max_single_loss,
                    'max_martingale_step'  : max_martingale_step,
                    'martingale_step'      : martingale_step + 1,
                    'condition'     : current_condition,
                    'switches'      : condition_switches,
                    'streak'        : streak,
                    'streak_type'   : streak_type,
                    'current_bet'   : current_bet,
                    'total_wagered' : total_wagered
                })

                # Ã¢â€â‚¬Ã¢â€â‚¬ 6. Ã Â¸Â£Ã Â¸Â°Ã Â¸Å¡Ã Â¸Å¡Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¶Ã Â¸ÂÃ Â¸Å¡Ã Â¸Â±Ã Â¸ÂÃ Â¸Å Ã Â¸ÂµÃ Â¸Â£Ã Â¸Â²Ã Â¸Â¢Ã Â¸Â§Ã Â¸Â±Ã Â¸â„¢Ã Â¸ÂªÃ Â¸Â³Ã Â¸Â«Ã Â¸Â£Ã Â¸Â±Ã Â¸Å¡Ã Â¸Å¡Ã Â¸Â£Ã Â¸Â´Ã Â¸Â©Ã Â¸Â±Ã Â¸â€” Ã¢â€â‚¬Ã¢â€â‚¬
                # Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€”Ã Â¸Â¶Ã Â¸ÂÃ Â¸â€”Ã Â¸Â¸Ã Â¸Â 500 Bet Ã Â¸Â«Ã Â¸Â£Ã Â¸Â·Ã Â¸Â­Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸Â¡Ã Â¸ÂµÃ Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¸ÂÃ Â¸Â²Ã Â¸ÂÃ Â¹â‚¬Ã Â¸â€¡Ã Â¸Â´Ã Â¸â„¢
                if total_bets % 500 == 0:
                    self.save_daily_report(
                        start_bal=start_balance,
                        end_bal=balance,
                        profit=total_profit,
                        wagered=total_wagered,
                        deposits=total_deposited,
                        withdrawals=total_withdrawn
                    )

                # Ã¢â€â‚¬Ã¢â€â‚¬ 5. Ã Â¸ÂÃ Â¸Â²Ã Â¸Â£Ã Â¹ÂÃ Â¸Ë†Ã Â¹â€°Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸â€¢Ã Â¸Â·Ã Â¸Â­Ã Â¸â„¢Ã Â¸Å¾Ã Â¸Â´Ã Â¹â‚¬Ã Â¸Â¨Ã Â¸Â© (Telegram Alerts) Ã¢â€â‚¬Ã¢â€â‚¬
                if payout > 0:
                    if martingale_step == 0 and current_highest_alert > 0: # Ã Â¸ÂÃ Â¸Â¥Ã Â¸Â±Ã Â¸Å¡Ã Â¸Â¡Ã Â¸Â²Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë† step 1 Ã Â¸Â«Ã Â¸Â¥Ã Â¸Â±Ã Â¸â€¡Ã Â¸â€¢Ã Â¸Â´Ã Â¸â€Ã Â¸Â«Ã Â¸Â¥Ã Â¹Ë†Ã Â¸Â¡
                        tg(f"Ã¢Å“â€¦ <b>Ã Â¸â€Ã Â¸Â¶Ã Â¸â€¡Ã Â¸â€”Ã Â¸Â¸Ã Â¸â„¢Ã Â¸â€žÃ Â¸Â·Ã Â¸â„¢Ã Â¸ÂªÃ Â¸Â³Ã Â¹â‚¬Ã Â¸Â£Ã Â¹â€¡Ã Â¸Ë†! (Full Recovery)</b>\nÃ Â¸ÂªÃ Â¸â€“Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â°: Ã Â¸ÂÃ Â¸Â¥Ã Â¸Â±Ã Â¸Å¡Ã Â¹â‚¬Ã Â¸â€šÃ Â¹â€°Ã Â¸Â²Ã Â¸ÂªÃ Â¸Â¹Ã Â¹Ë†Ã Â¸Â Ã Â¸Â²Ã Â¸Â§Ã Â¸Â°Ã Â¸â€ºÃ Â¸ÂÃ Â¸â€¢Ã Â¸Â´\nProfit Ã Â¸Â£Ã Â¸Â§Ã Â¸Â¡ : {total_profit:+.8f} TRX")
                        current_highest_alert = 0
                else:
                    # New Record Alert (Step / Streak)
                    # Ã Â¹ÂÃ Â¸Ë†Ã Â¹â€°Ã Â¸â€¡Ã Â¹â‚¬Ã Â¸â€¢Ã Â¸Â·Ã Â¸Â­Ã Â¸â„¢Ã Â¹â‚¬Ã Â¸Â¡Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€”Ã Â¸Â³Ã Â¸Â¥Ã Â¸Â²Ã Â¸Â¢Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â´Ã Â¸â€¢Ã Â¸Â´Ã Â¹â‚¬Ã Â¸â€Ã Â¸Â´Ã Â¸Â¡ (16, 17, 18...)
                    if (martingale_step + 1) > persistent.get("max_martingale_step", 0) and (martingale_step + 1) >= 15:
                         danger = "Ã°Å¸â€Â´ Ã Â¸Â­Ã Â¸Â±Ã Â¸â„¢Ã Â¸â€¢Ã Â¸Â£Ã Â¸Â²Ã Â¸Â¢!" if martingale_step + 1 >= 18 else "Ã°Å¸Å¸Â  Ã Â¸Â£Ã Â¸Â°Ã Â¸Â§Ã Â¸Â±Ã Â¸â€¡!"
                         tg(
                             f"Ã°Å¸Ââ€  <b>Ã Â¸â€”Ã Â¸Â³Ã Â¸Â¥Ã Â¸Â²Ã Â¸Â¢Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â´Ã Â¸â€¢Ã Â¸Â´Ã Â¹Æ’Ã Â¸Â«Ã Â¸Â¡Ã Â¹Ë†! (Max Step)</b>\n"
                             f"Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â\n"
                             f"Ã°Å¸â€œÂ Ã Â¸â€šÃ Â¸Â±Ã Â¹â€°Ã Â¸â„¢Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë†     : <b>{martingale_step+1}</b>  {danger}\n"
                             f"Ã°Å¸â€™Â¸ Bet Ã Â¸â€ºÃ Â¸Â±Ã Â¸Ë†Ã Â¸Ë†Ã Â¸Â¸Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢ : <b>{current_bet:.8f} TRX</b>\n"
                             f"Ã°Å¸â€™Â° Balance     : <b>{new_balance:.4f} TRX</b>\n"
                             f"Ã°Å¸â€œâ€° P/L         : <b>{total_profit:+.4f} TRX</b>\n"
                             f"Ã°Å¸â€Â¥ Ã Â¹ÂÃ Â¸Å¾Ã Â¹â€°Ã Â¸â€¢Ã Â¸Â´Ã Â¸â€      : <b>{current_loss_streak} Ã Â¸â€žÃ Â¸Â£Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡</b>\n"
                             f"Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â\n"
                             f"<i>Ã¢Å¡Â Ã¯Â¸Â Ã Â¸Å¾Ã Â¸Â´Ã Â¸Ë†Ã Â¸Â²Ã Â¸Â£Ã Â¸â€œÃ Â¸Â²Ã Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¸Å¡Ã Â¸Â­Ã Â¸â€”Ã Â¸â€“Ã Â¹â€°Ã Â¸Â² Step Ã Â¸ÂªÃ Â¸Â¹Ã Â¸â€¡Ã Â¸Â¡Ã Â¸Â²Ã Â¸Â</i>"
                         )
                         persistent["max_martingale_step"] = (martingale_step + 1)

                    if current_loss_streak > persistent.get("max_loss_streak", 0) and current_loss_streak >= 15:
                         tg(
                             f"Ã°Å¸â€Â¥ <b>Ã Â¸â€”Ã Â¸Â³Ã Â¸Â¥Ã Â¸Â²Ã Â¸Â¢Ã Â¸ÂªÃ Â¸â€“Ã Â¸Â´Ã Â¸â€¢Ã Â¸Â´Ã Â¹Æ’Ã Â¸Â«Ã Â¸Â¡Ã Â¹Ë†! (Max Streak)</b>\n"
                             f"Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â\n"
                             f"Ã°Å¸â€™Â¥ Ã Â¹ÂÃ Â¸Å¾Ã Â¹â€°Ã Â¸â€¢Ã Â¹Ë†Ã Â¸Â­Ã Â¹â‚¬Ã Â¸â„¢Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€¡ : <b>{current_loss_streak} Ã Â¸â€žÃ Â¸Â£Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡</b>\n"
                             f"Ã°Å¸â€œÂ Ã Â¸â€šÃ Â¸Â±Ã Â¹â€°Ã Â¸â„¢Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë†      : <b>{martingale_step+1}</b>\n"
                             f"Ã°Å¸â€™Â¸ Bet Ã Â¸â€ºÃ Â¸Â±Ã Â¸Ë†Ã Â¸Ë†Ã Â¸Â¸Ã Â¸Å¡Ã Â¸Â±Ã Â¸â„¢ : <b>{current_bet:.8f} TRX</b>\n"
                             f"Ã°Å¸â€™Â° Balance      : <b>{new_balance:.4f} TRX</b>\n"
                             f"Ã°Å¸â€œâ€° P/L          : <b>{total_profit:+.4f} TRX</b>"
                         )
                         persistent["max_loss_streak"] = current_loss_streak
                    
                    # High Risk Alert
                    bet_mult = int(current_bet / base_bet)
                    target_m = 0
                    for m in sorted(BET_ALERT_MULTIPLIERS, reverse=True):
                        if bet_mult >= m: target_m = m; break
                    if target_m > current_highest_alert:
                        current_highest_alert = target_m
                        tg(f"Ã°Å¸Å¡Â¨ <b>Bet Ã Â¹Æ’Ã Â¸Â«Ã Â¸ÂÃ Â¹Ë†Ã Â¸â€“Ã Â¸Â¶Ã Â¸â€¡ {target_m}x! (High Risk)</b>\nBet: {current_bet:.8f} TRX\nStep: {martingale_step+1}")

                    # Milestone Streak
                    if current_loss_streak in STREAK_MILESTONES:
                        tg(f"Ã°Å¸â€™Â¥ <b>Ã Â¹ÂÃ Â¸Å¾Ã Â¹â€°Ã Â¸â€¢Ã Â¹Ë†Ã Â¸Â­Ã Â¹â‚¬Ã Â¸â„¢Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¸â€¡ {current_loss_streak} Ã Â¸â€žÃ Â¸Â£Ã Â¸Â±Ã Â¹â€°Ã Â¸â€¡</b>\nStep: {martingale_step+1}\nProfit: {total_profit:+.8f} TRX")

                # Health Check (Ã Â¸â€”Ã Â¸Â¸Ã Â¸Â 100 bets)
                if total_bets % BALANCE_REPORT_EVERY == 0:
                    win_rate_now = (wins / total_bets * 100)
                    p_icon = "Ã°Å¸Å¸Â¢" if total_profit >= 0 else "Ã°Å¸â€Â´"
                    tg(
                        f"Ã°Å¸â€œË† <b>Ã Â¸Â£Ã Â¸Â²Ã Â¸Â¢Ã Â¸â€¡Ã Â¸Â²Ã Â¸â„¢Ã Â¸Â­Ã Â¸Â±Ã Â¸â€¢Ã Â¹â€šÃ Â¸â„¢Ã Â¸Â¡Ã Â¸Â±Ã Â¸â€¢Ã Â¸Â´ ({total_bets:,} Bets)</b>\n"
                        f"Ã¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€ÂÃ¢â€Â\n"
                        f"Ã°Å¸â€™Â° Balance  : <b>{balance:.4f} TRX</b>\n"
                        f"Ã°Å¸â€œÅ  Win Rate : <b>{win_rate_now:.1f}%</b>\n"
                        f"Ã°Å¸â€œÂ Step     : <b>{martingale_step+1}</b>\n"
                        f"Ã¢ÂÂ±Ã¯Â¸Â Uptime   : <b>{total_uptime_seconds//3600}h {(total_uptime_seconds%3600)//60}m</b>",
                        reply_markup=main_menu_markup()
                    )

                mode_str = "VIRTUAL" if virtual_mode else "REAL"
                status_str = "WIN" if is_win else "LOSS"
                self.log_to_csv([
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    mode_str, martingale_step+1, current_bet, target, current_condition, result, payout, status_str, streak, streak_type
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
                if virtual_mode:
                    print(f"  Current Step    : [SCANNING] Waiting for Safe Pattern")
                    print(f"  Bet Amount      : 0.00000000 TRX | Virtual Roll")
                else:
                    next_bet_amount = round(base_bet * (2 ** martingale_step), 8)
                    print(f"  Current Step    : Step {martingale_step+1} (x{(2 ** martingale_step)})")
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
                tg(f"Ã°Å¸â€ºâ€˜ <b>Bot Stopped (Manual)</b>\nFinal Profit: {total_profit:+.8f} TRX\nBets: {total_bets} ({wins}W/{losses}L)\nBalance: {balance:.8f} TRX")
                print("Bot stopped by user.")
                print(f"Final Profit: {total_profit:.8f} TRX | Bets: {total_bets} ({wins}W/{losses}L)")
                raise  # re-raise Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Â·Ã Â¹Ë†Ã Â¸Â­Ã Â¹Æ’Ã Â¸Â«Ã Â¹â€° outer loop Ã Â¸Â«Ã Â¸Â¢Ã Â¸Â¸Ã Â¸â€Ã Â¸â€Ã Â¹â€°Ã Â¸Â§Ã Â¸Â¢
            except Exception as e:
                clear()
                tg(f"Ã¢ÂÅ’ <b>Bot Error</b>\n{str(e)[:200]}\nRetrying in 5s...")
                print("=======================================================")
                print(f"  [ERROR] {str(e)[:60]}")
                print(f"  [RECOVER] Retrying in 5 seconds...")
                print(f"  [INFO] Profit so far: {total_profit:.8f} TRX")
                print("=======================================================")
                time.sleep(5)

if __name__ == "__main__":
    # ============================================================
    #  Ã Â¸Â­Ã Â¹Ë†Ã Â¸Â²Ã Â¸â„¢Ã Â¸â€žÃ Â¹Ë†Ã Â¸Â²Ã Â¸Ë†Ã Â¸Â²Ã Â¸Â config.json (Ã Â¹ÂÃ Â¸ÂÃ Â¹â€°Ã Â¹â€žÃ Â¸â€šÃ Â¹â€žÃ Â¸â€Ã Â¹â€°Ã Â¸â€”Ã Â¸ÂµÃ Â¹Ë†Ã Â¹â€žÃ Â¸Å¸Ã Â¸Â¥Ã Â¹Å’ config.json)
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

    BASE_BET  = _bots.get("base_bet", 0.001)
    TARGET    = _bots.get("target", 49.00)
    CONDITION = _bots.get("condition", "below")

    print(f"[CONFIG] Telegram Chat: {TELEGRAM_CHAT_ID}")
    print(f"[CONFIG] Currency: {CURRENCY} | Base Bet: {BASE_BET} | Mode: {'SIMULATE' if SIMULATE else 'LIVE'}")

    bot = StakeDiceBot(TOKEN, COOKIES, currency=CURRENCY, simulate=SIMULATE,
                       mirror_host=MIRROR_HOST, proxy=PROXY)

    # ===== RESURRECTION LOOP =====
    while True:
        try:
            bot.start_dice_bot(base_bet=BASE_BET, target=TARGET, condition=CONDITION)
        except KeyboardInterrupt:
            print("Bot stopped by user.")
            break
        except Exception as e:
            tg(f"Ã°Å¸â€™â‚¬ <b>Bot Crashed! Restarting...</b>\n{str(e)[:200]}\nRestarting in 15s")
            print(f"[RESURRECTION] Crashed: {e}")
            print("[RESURRECTION] Restarting in 15 seconds...")
            time.sleep(15)






