"""
Reset all bot history/stats to start fresh for all config profiles.
"""
import glob
import os
import shutil
import sys
import subprocess
from pathlib import Path

from _account_paths import ACCOUNT_HISTORY_ROOT

sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
ACCOUNT_ROOT = Path(ACCOUNT_HISTORY_ROOT).resolve()


def _is_safe_child(path_obj):
    resolved = path_obj.resolve()
    try:
        return resolved == BASE_DIR or resolved.is_relative_to(BASE_DIR)
    except AttributeError:
        base = str(BASE_DIR)
        target = str(resolved)
        return target == base or target.startswith(base + os.sep)


def _delete_file(filepath):
    if os.path.exists(filepath):
        os.remove(filepath)
        print(f"[OK] {filepath} deleted", flush=True)


def _delete_tree(path_obj):
    if not path_obj.exists():
        return
    if not _is_safe_child(path_obj):
        print(f"[SKIP] Unsafe path: {path_obj}", flush=True)
        return
    shutil.rmtree(path_obj, ignore_errors=True)
    print(f"[OK] {path_obj} deleted (or partially deleted if locked)", flush=True)


def _stop_bot_processes():
    script = (
        "$target='stake_project_3'; "
        "Get-CimInstance Win32_Process | Where-Object { "
        "$_.CommandLine -match $target -and "
        "($_.CommandLine -match 'dice_bot_utf8\\.py|hermes_brain\\.py|accounting_bot\\.py') -and "
        "$_.CommandLine -notmatch 'reset_history\\.py' "
        "} | ForEach-Object { "
        "Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue "
        "}"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            cwd=str(BASE_DIR),
            check=False,
        )
    except Exception:
        pass


# 0. Remove per-account history folders first
_stop_bot_processes()
try:
    shutil.rmtree(ACCOUNT_ROOT, ignore_errors=True)
    print(f"[OK] {ACCOUNT_ROOT} deleted", flush=True)
except Exception:
    pass

# 1. Remove legacy root-level stats/history files if any remain
for filepath in glob.glob("dice_stats*.json"):
    _delete_file(filepath)

for filepath in glob.glob("dice_history*.csv"):
    _delete_file(filepath)

for filepath in glob.glob("daily_accounting_report*.csv"):
    _delete_file(filepath)

for filepath in glob.glob("deposit_history*.csv"):
    _delete_file(filepath)

for filepath in glob.glob("dice_events*.log"):
    _delete_file(filepath)

for filepath in glob.glob("hot_reload_audit*.log"):
    _delete_file(filepath)

for filepath in glob.glob("hermes_brain*.log"):
    _delete_file(filepath)

_delete_file("hermes_model_state.json")
_delete_file("MARKET_MEMORY.md")

# 2. Reset portfolio stop/state files
for filepath in ["portfolio_stop.flag", "portfolio_state.json"]:
    _delete_file(filepath)

print("\n[DONE] Bot history for all profiles deleted and reset. Ready to start fresh!", flush=True)
