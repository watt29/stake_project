import json
import os
import sys
import time
import subprocess
from datetime import datetime
import ctypes

from _account_paths import (
    ACCOUNT_ID_BY_CONFIG,
    account_file,
    ensure_account_dir,
)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACCOUNT_CONFIGS = list(ACCOUNT_ID_BY_CONFIG.keys())

ANSI_RESET = "\033[0m"
ANSI_BOLD = "\033[1m"
ANSI_DIM = "\033[2m"
ANSI_RED = "\033[31m"
ANSI_GREEN = "\033[32m"
ANSI_YELLOW = "\033[33m"
ANSI_BLUE = "\033[34m"
ANSI_MAGENTA = "\033[35m"
ANSI_CYAN = "\033[36m"
ANSI_WHITE = "\033[37m"
ANSI_BRIGHT_RED = "\033[91m"
ANSI_BRIGHT_GREEN = "\033[92m"
ANSI_BRIGHT_YELLOW = "\033[93m"
ANSI_BRIGHT_BLUE = "\033[94m"
ANSI_BRIGHT_MAGENTA = "\033[95m"
ANSI_BRIGHT_CYAN = "\033[96m"

ACCOUNT_COLOR_BY_ID = {
    "ACC01": ANSI_BRIGHT_CYAN,
    "ACC02": ANSI_BRIGHT_GREEN,
    "ACC03": ANSI_BRIGHT_YELLOW,
    "ACC04": ANSI_BRIGHT_BLUE,
    "ACC05": ANSI_BRIGHT_MAGENTA,
    "ACC06": ANSI_BRIGHT_RED,
    "ACC07": ANSI_CYAN,
    "ACC08": ANSI_WHITE,
}


def _enable_ansi_colors():
    if os.name != "nt":
        return True
    try:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)
        mode = ctypes.c_uint()
        if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            return False
        return bool(kernel32.SetConsoleMode(handle, mode.value | 0x0004))
    except Exception:
        return False


ENABLE_COLORS = _enable_ansi_colors()


def _color(text, code):
    if not ENABLE_COLORS:
        return str(text)
    return f"{code}{text}{ANSI_RESET}"


def _format_cell(text, width, color=None, align="left"):
    raw = str(text)
    if len(raw) > width:
        raw = raw[:width]
    if align == "right":
        raw = raw.rjust(width)
    elif align == "center":
        raw = raw.center(width)
    else:
        raw = raw.ljust(width)
    if color:
        return _color(raw, color)
    return raw


def _profit_color(value):
    if value > 0:
        return ANSI_BRIGHT_GREEN
    if value < 0:
        return ANSI_BRIGHT_RED
    return ANSI_BRIGHT_YELLOW


def _balance_color(balance, initial_capital):
    if balance > initial_capital:
        return ANSI_BRIGHT_GREEN
    if balance < initial_capital:
        return ANSI_BRIGHT_RED
    return ANSI_BRIGHT_YELLOW


def _state_color(is_stopped):
    return ANSI_BRIGHT_RED if is_stopped else ANSI_BRIGHT_GREEN


def _mode_color(mode):
    if mode == "VIRTUAL":
        return ANSI_BRIGHT_MAGENTA
    if mode == "REAL":
        return ANSI_BRIGHT_GREEN
    return ANSI_BRIGHT_YELLOW


def _account_color(account_id):
    return ACCOUNT_COLOR_BY_ID.get(account_id, ANSI_BRIGHT_CYAN)


def _parse_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _write_text(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def _remove_file(path):
    if os.path.exists(path):
        os.remove(path)


def _read_stop_reason(path):
    if not os.path.exists(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        if "|" in line:
            return line.split("|", 1)[1].strip()
        return line
    except Exception:
        return ""


def _get_min_bet(currency_str):
    return 0.0005


def _stats_path(config_name):
    return account_file("dice_stats.json", config_name)


def _stop_flag_path(config_name):
    return account_file("account_stop.flag", config_name)


def _summary_for_config(config_name):
    ensure_account_dir(config_name)
    config_path = os.path.join(BASE_DIR, config_name)
    stats_path = _stats_path(config_name)
    config_data = _read_json(config_path, {}) if os.path.exists(config_path) else {}
    stats = _read_json(stats_path, {})
    has_stats = isinstance(stats, dict) and bool(stats)

    account_name = config_data.get("account_name", "Unknown") if isinstance(config_data, dict) else "Unknown"
    config_financial = config_data.get("financial", {}) if isinstance(config_data, dict) else {}
    initial_capital = _parse_float(stats.get("initial_capital", 0.0), 0.0)
    if initial_capital <= 0:
        initial_capital = _parse_float(config_financial.get("initial_capital", 0.0), 0.0)
    currency = "trx"
    stake_data = config_data.get("stake", {}) if isinstance(config_data, dict) else {}
    if isinstance(stake_data, dict):
        currency = str(stake_data.get("currency", currency) or currency).lower()
    profit = _parse_float(stats.get("total_profit", 0.0), 0.0)
    saved_balance = _parse_float(stats.get("initial_balance", 0.0), 0.0)
    bets = int(_parse_float(stats.get("total_bets", 0), 0))
    wins = int(_parse_float(stats.get("wins", 0), 0))
    losses = int(_parse_float(stats.get("losses", 0), 0))
    win_rate = (wins / bets * 100.0) if bets > 0 else 0.0
    virtual_state = str(stats.get("virtual_state", "NONE") or "NONE").upper()
    recent_history = str(stats.get("recent_history", "") or "")
    mode = "REAL"
    min_balance = _get_min_bet(currency)
    low_balance = has_stats and saved_balance > 0 and saved_balance < min_balance
    stop_flag = os.path.exists(_stop_flag_path(config_name))
    stop_reason = _read_stop_reason(_stop_flag_path(config_name))
    balance = saved_balance if has_stats and saved_balance > 0 else 0.0
    if not has_stats:
        mode = "N/A"
        stop_reason = "NO DATA"
    elif not stop_flag and low_balance:
        stop_reason = f"LOW BALANCE {balance:.8f} < {min_balance:.8f}"

    return {
        "config_name": config_name,
        "account_id": ACCOUNT_ID_BY_CONFIG.get(config_name, "ACCXX"),
        "account_name": account_name,
        "currency": currency,
        "initial_capital": initial_capital,
        "balance": balance,
        "min_balance": min_balance,
        "low_balance": low_balance,
        "profit": profit,
        "bets": bets,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "has_stats": has_stats,
        "mode": mode,
        "recent_history": recent_history,
        "stop_flag": stop_flag,
        "stop_reason": stop_reason,
    }


def collect_summary():
    rows = [_summary_for_config(config_name) for config_name in ACCOUNT_CONFIGS]
    total_initial = sum(row["initial_capital"] for row in rows)
    total_profit = sum(row["profit"] for row in rows)
    total_bets = sum(row["bets"] for row in rows)
    total_wins = sum(row["wins"] for row in rows)
    total_losses = sum(row["losses"] for row in rows)
    return {
        "rows": rows,
        "total_initial": total_initial,
        "total_profit": total_profit,
        "total_bets": total_bets,
        "total_wins": total_wins,
        "total_losses": total_losses,
    }


def print_summary(report):
    if os.name == "nt":
        os.system("cls")
    elif ENABLE_COLORS:
        print("\033[2J\033[H", end="")

    title = _color("CENTRAL ACCOUNTING DASHBOARD", ANSI_BOLD + ANSI_BRIGHT_CYAN)
    print("============================================================")
    print(f"  {title}")
    print("============================================================")
    print(f"  Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(
        "  Accounts: "
        f"{len(report['rows'])} | "
        f"Active: {sum(1 for row in report['rows'] if row['has_stats'] and not row['stop_flag'])} | "
        f"Stopped: {sum(1 for row in report['rows'] if row['stop_flag'])} | "
        f"No Data: {sum(1 for row in report['rows'] if not row['has_stats'])}"
    )
    portfolio_flag = os.path.join(BASE_DIR, "portfolio_stop.flag")
    portfolio_state = "YES" if os.path.exists(portfolio_flag) else "NO"
    print(f"  Portfolio Stop: {_color(portfolio_state, ANSI_BRIGHT_RED if portfolio_state == 'YES' else ANSI_BRIGHT_GREEN)}")
    print("")
    print("  Account ID | Name       Balance        Profit         Bets   Win%   Mode      Recent 6  State")
    print("  -----------+-----------  ------------  ------------  -----  -----  --------  --------  ------------------------------")
    for row in report["rows"]:
        row_color = _account_color(row["account_id"])
        state = "STOP" if row["stop_flag"] else "RUN"
        if not row["has_stats"]:
            state = "NO DATA"
        elif row["low_balance"]:
            state = "LOW BALANCE"
        if row["stop_flag"] and row["stop_reason"]:
            state = f"STOP: {row['stop_reason'][:24]}"
        account_tag = f"{row['account_id']} | {row['account_name']}"
        account_text = _format_cell(account_tag, 23, ANSI_BOLD + row_color)
        mode_text = _format_cell(row["mode"], 8, _mode_color(row["mode"]))
        recent_text = _format_cell(row["recent_history"][-6:] if row["recent_history"] else "--", 8, ANSI_BRIGHT_YELLOW)
        if row["has_stats"]:
            balance_text = _format_cell(
                f"{row['balance']:.8f}",
                12,
                _balance_color(row["balance"], row["initial_capital"]),
                align="right",
            )
            profit_text = _format_cell(f"{row['profit']:+.8f}", 12, _profit_color(row["profit"]), align="right")
        else:
            balance_text = _format_cell("--", 12, ANSI_BRIGHT_YELLOW, align="right")
            profit_text = _format_cell("--", 12, ANSI_BRIGHT_YELLOW, align="right")
        bets_text = _format_cell(f"{row['bets']}", 5, ANSI_WHITE, align="right")
        win_text = _format_cell(f"{row['win_rate']:.1f}", 5, ANSI_BRIGHT_YELLOW, align="right")
        state_text = _format_cell(state, 30, _state_color(row["stop_flag"]))
        print(f"  {account_text}  {balance_text}  {profit_text}  {bets_text}  {win_text}  {mode_text}  {recent_text}  {state_text}")
    print("")
    total_initial_text = f"{report['total_initial']:.8f}"
    total_balance_text = f"{sum(row['balance'] for row in report['rows']):.8f}"
    total_profit_text = f"{report['total_profit']:+.8f}"
    total_bets_text = f"{report['total_bets']:,}"
    total_wins_text = f"{report['total_wins']:,}"
    total_losses_text = f"{report['total_losses']:,}"
    print(f"  Total Initial : {_color(total_initial_text, ANSI_BRIGHT_CYAN)}")
    total_balance_value = sum(row["balance"] for row in report["rows"])
    total_balance_color = ANSI_BRIGHT_GREEN if total_balance_value > report["total_initial"] else ANSI_BRIGHT_RED if total_balance_value < report["total_initial"] else ANSI_BRIGHT_YELLOW
    print(f"  Total Balance : {_color(total_balance_text, total_balance_color)}")
    print(f"  Total Profit  : {_color(total_profit_text, _profit_color(report['total_profit']))}")
    print(f"  Total Bets    : {_color(total_bets_text, ANSI_WHITE)}")
    print(f"  Total Wins    : {_color(total_wins_text, ANSI_BRIGHT_GREEN)}")
    print(f"  Total Losses  : {_color(total_losses_text, ANSI_BRIGHT_RED)}")
    print("============================================================")
    print("============================================================")


def clear_all_stops():
    _remove_file(os.path.join(BASE_DIR, "portfolio_stop.flag"))
    _remove_file(os.path.join(BASE_DIR, "portfolio_state.json"))
    for config_name in ACCOUNT_CONFIGS:
        _remove_file(_stop_flag_path(config_name))


def stop_all_account_bots():
    script = (
        "$target='stake_project_3'; "
        "Get-CimInstance Win32_Process | Where-Object { "
        "$_.CommandLine -match $target -and "
        "($_.CommandLine -match 'dice_bot_utf8\\.py|hermes_brain\\.py') -and "
        "$_.CommandLine -notmatch 'accounting_bot\\.py' "
        "} | ForEach-Object { "
        "Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue "
        "}"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            cwd=BASE_DIR,
            check=False,
        )
    except Exception:
        pass


def stop_all_and_clear_history():
    stop_all_account_bots()
    time.sleep(1.5)
    clear_all_stops()
    try:
        subprocess.run([sys.executable, "reset_history.py"], cwd=BASE_DIR, check=False)
    except Exception:
        pass


def apply_controls(report, stop_loss_pct=0.0, portfolio_profit_pct=0.0):
    actions = []
    for row in report["rows"]:
        if row["low_balance"] and not row["stop_flag"]:
            actions.append(f"{row['account_id']} low balance (kept running)")
        if row["initial_capital"] <= 0 or stop_loss_pct <= 0:
            continue
        loss_limit = row["initial_capital"] * (stop_loss_pct / 100.0)
        if row["profit"] <= -loss_limit and not row["stop_flag"]:
            message = f"{datetime.now().isoformat(timespec='seconds')} | Auto stop: loss reached {row['profit']:+.8f}"
            _write_text(_stop_flag_path(row["config_name"]), message + "\n")
            actions.append(f"{row['account_id']} stopped (loss limit reached)")

    if portfolio_profit_pct > 0 and report["total_initial"] > 0:
        target_profit = report["total_initial"] * (portfolio_profit_pct / 100.0)
        if report["total_profit"] >= target_profit:
            _write_text(
                os.path.join(BASE_DIR, "portfolio_stop.flag"),
                f"{datetime.now().isoformat(timespec='seconds')} | Portfolio target reached\n",
            )
            actions.append("portfolio stop requested (profit target reached)")

    return actions


def parse_args(argv):
    options = {
        "watch": False,
        "interval": 30,
        "stop_loss_pct": 0.0,
        "portfolio_profit_pct": 0.0,
        "clear_stops": False,
    }

    idx = 1
    while idx < len(argv):
        arg = argv[idx]
        if arg == "--watch":
            options["watch"] = True
        elif arg == "--clear-stops":
            options["clear_stops"] = True
        elif arg == "--interval" and idx + 1 < len(argv):
            try:
                options["interval"] = max(5, int(argv[idx + 1]))
            except ValueError:
                pass
            idx += 1
        elif arg == "--stop-loss-pct" and idx + 1 < len(argv):
            options["stop_loss_pct"] = _parse_float(argv[idx + 1], 0.0)
            idx += 1
        elif arg == "--portfolio-profit-pct" and idx + 1 < len(argv):
            options["portfolio_profit_pct"] = _parse_float(argv[idx + 1], 0.0)
            idx += 1
        idx += 1
    return options


def run_once(options):
    report = collect_summary()
    print_summary(report)
    actions = apply_controls(
        report,
        stop_loss_pct=options["stop_loss_pct"],
        portfolio_profit_pct=options["portfolio_profit_pct"],
    )
    if actions:
        print("")
        for action in actions:
            print(f"[ACTION] {action}")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    options = parse_args(sys.argv)

    if options["clear_stops"]:
        clear_all_stops()
        print("[OK] All stop flags cleared.")

    if options["watch"]:
        try:
            while True:
                run_once(options)
                time.sleep(options["interval"])
        finally:
            print("[OK] Stopping all bots and clearing all history...")
            stop_all_and_clear_history()
    else:
        run_once(options)


if __name__ == "__main__":
    raise SystemExit(main())
