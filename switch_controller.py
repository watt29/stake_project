"""
switch_controller.py - Runs 2 accounts at a time, cycling across all four groups.

Group A: config.json, config_account2.json
Group B: config_account3.json, config_account4.json
Group C: config_account5.json, config_account6.json
Group D: config_account7.json, config_account8.json

Usage:
  python switch_controller.py [--duration MINUTES] [--cycles N] [--simulate]

  --duration  : Minutes each group runs per cycle (default: 10)
  --cycles    : How many full A+B cycles to run (default: 0 = infinite)
"""

import subprocess
import sys
import os
import time
import json

# ─── Config ──────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROTATION_STATE_FILE = os.path.join(BASE_DIR, "rotation_controller_state.json")

PYTHON_EXE = sys.executable
if not os.path.exists(PYTHON_EXE):
    PYTHON_EXE = sys.executable

def disable_quickedit():
    """Disable Windows QuickEdit mode to prevent accidental terminal freezes."""
    if os.name == 'nt':
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.GetStdHandle(-10) # STD_INPUT_HANDLE
            mode = ctypes.c_uint32()
            kernel32.GetConsoleMode(handle, ctypes.byref(mode))
            mode.value &= ~0x0040 # ENABLE_QUICK_EDIT_MODE
            kernel32.SetConsoleMode(handle, mode)
        except Exception:
            pass

GROUPS = [
    ("Group A", ["config.json", "config_account2.json"]),
    ("Group B", ["config_account3.json", "config_account4.json"]),
    ("Group C", ["config_account5.json", "config_account6.json"]),
    ("Group D", ["config_account7.json", "config_account8.json"]),
]

# ─── Helpers ─────────────────────────────────────────────────────────────────

def account_label(config_name):
    """Return the configured account name without reading sensitive fields."""
    config_path = os.path.join(BASE_DIR, config_name)
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        # Check root first, then fallback to stake dictionary
        return config.get("account_name") or config.get("stake", {}).get("account_name") or config_name
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return config_name


def load_next_group_index():
    """Resume from the group after the one most recently launched."""
    try:
        with open(ROTATION_STATE_FILE, "r", encoding="utf-8") as f:
            saved_index = int(json.load(f).get("next_group_index", 0))
        return saved_index % len(GROUPS)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return 0


def save_next_group_index(group_index):
    """Persist the next group before launching the current group."""
    try:
        with open(ROTATION_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"next_group_index": group_index % len(GROUPS)}, f)
    except OSError:
        pass

def mark_account_starting(config_name):
    """Clear a previous no-funds marker before checking this account again."""
    suffix = config_name.replace("config", "").replace(".json", "")
    stats_path = os.path.join(BASE_DIR, f"dice_stats{suffix}.json")
    try:
        with open(stats_path, "r", encoding="utf-8") as f:
            stats = json.load(f)
        stats["rotation_status"] = "STARTING"
        with open(stats_path, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass

def start_group(configs, duration, simulate=False):
    """Launch each bot in its own console window. Returns Popen objects."""
    procs = []
    for i, cfg in enumerate(configs):
        mark_account_starting(cfg)
        cmd = [PYTHON_EXE, "-u", "dice_bot_utf8.py", "--config", cfg]
        if simulate:
            cmd.append("--simulate")

        # A dedicated console keeps each account's dashboard independent.
        # CREATE_NEW_PROCESS_GROUP is retained so stop_group can end this bot
        # and only the browser processes it owns.
        creationflags = (
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NEW_CONSOLE
            if os.name == "nt" else 0
        )
        p = subprocess.Popen(
            cmd,
            cwd=BASE_DIR,
            stdout=None,
            stderr=None,
            creationflags=creationflags,
        )
        print(f"  [START] {account_label(cfg)} ({cfg}, PID {p.pid}) - separate dashboard window")
        procs.append(p)
        if i < len(configs) - 1:
            print(f"  [WAIT ] Waiting 15s before next account to avoid Chrome port conflicts...")
            time.sleep(15)  # stagger launches to avoid Chrome profile conflict
    
    return procs


def stop_group(procs):
    """Terminate all processes in the group and wait for them to exit."""
    for p in procs:
        try:
            if os.name == 'nt':
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(p.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                p.terminate()
        except Exception:
            pass
    for p in procs:
        try:
            p.wait(timeout=10)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    print(f"  [STOP ] {len(procs)} bot(s) terminated.")

    # Chrome children are terminated with their owning bot process only.
    time.sleep(2)  # give Chrome a moment to fully close


def group_has_insufficient_funds(configs):
    """Return accounts that intentionally stopped because no bet can be funded."""
    paused = []
    for config_name in configs:
        suffix = config_name.replace("config", "").replace(".json", "")
        stats_path = os.path.join(BASE_DIR, f"dice_stats{suffix}.json")
        try:
            with open(stats_path, "r", encoding="utf-8") as f:
                if json.load(f).get("rotation_status") == "INSUFFICIENT_FUNDS":
                    paused.append(config_name)
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            pass
    return paused


def read_account_summary(config_name):
    """Read the bot's visible health and completed real-bet count."""
    suffix = config_name.replace("config", "").replace(".json", "")
    stats_path = os.path.join(BASE_DIR, f"dice_stats{suffix}.json")
    try:
        with open(stats_path, "r", encoding="utf-8") as f:
            stats = json.load(f)
        return stats.get("rotation_status", "UNKNOWN"), int(stats.get("total_bets", 0))
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return "WAITING FOR STATUS", 0


def wait_with_countdown(duration_min, label, configs):
    """Wait for a group, or end early when an account has no usable funds."""
    total_sec = duration_min * 60
    elapsed = 0
    interval = 5
    while elapsed < total_sec:
        paused_accounts = group_has_insufficient_funds(configs)
        if paused_accounts:
            print(f"  [SKIP ] No usable funds: {', '.join(paused_accounts)}. Moving to next group.")
            return True
        remaining = total_sec - elapsed
        mins = remaining // 60
        secs = remaining % 60
        if elapsed % 30 == 0:
            health = ", ".join(
                f"{account_label(cfg)} ({cfg}): {status} | Real Bets: {bets:,}"
                for cfg in configs
                for status, bets in [read_account_summary(cfg)]
            )
            print(f"  [{label}] {mins}m {secs:02d}s remaining | {health}", flush=True)
        sleep_for = min(interval, remaining)
        time.sleep(sleep_for)
        elapsed += sleep_for
    return False


def parse_args(argv):
    duration = 10
    cycles = 0  # 0 = infinite
    simulate = False
    i = 1
    while i < len(argv):
        if argv[i] == "--duration" and i + 1 < len(argv):
            duration = int(argv[i + 1])
            i += 2
        elif argv[i] == "--cycles" and i + 1 < len(argv):
            cycles = int(argv[i + 1])
            i += 2
        elif argv[i] == "--simulate":
            simulate = True
            i += 1
        else:
            i += 1
    return duration, cycles, simulate


# ─── Main Loop ────────────────────────────────────────────────────────────────

def main():
    disable_quickedit()
    duration, max_cycles, simulate = parse_args(sys.argv)
    cycle = 0
    active_procs = []
    next_group_index = load_next_group_index()

    print("=" * 62)
    print("  SWITCH CONTROLLER - 2 Accounts at a Time")
    for g_name, g_configs in GROUPS:
        members = ", ".join(f"{account_label(cfg)} ({cfg})" for cfg in g_configs)
        print(f"  {g_name}: {members}")
    print(f"  Duration per group : {duration} min | Max cycles: {'inf' if max_cycles == 0 else max_cycles}")
    print(f"  Mode               : {'SIMULATE' if simulate else 'LIVE'}")
    print(f"  Resume from        : {GROUPS[next_group_index][0]}")
    print("=" * 62)
    print()

    try:
        while max_cycles == 0 or cycle < max_cycles:
            cycle += 1

            for _ in range(len(GROUPS)):
                group_index = next_group_index
                g_name, g_configs = GROUPS[group_index]
                next_group_index = (group_index + 1) % len(GROUPS)
                save_next_group_index(next_group_index)
                print(f"[CYCLE {cycle}] Starting {g_name} ({len(g_configs)} accounts)...")
                active_procs = start_group(g_configs, duration, simulate=simulate)
                group_paused = wait_with_countdown(duration, f"CYCLE {cycle} {g_name}", g_configs)
                if group_paused:
                    print(f"[CYCLE {cycle}] Insufficient-funds account detected - stopping {g_name}...")
                else:
                    print(f"[CYCLE {cycle}] Time limit reached - stopping {g_name}...")
                stop_group(active_procs)
                active_procs = []
                print("  [PAUSE] Waiting 3 seconds before next group...")
                time.sleep(3)

    except KeyboardInterrupt:
        print("\n[CTRL+C] Stopping all active bots...")
        if active_procs:
            stop_group(active_procs)
        print("[DONE] All bots stopped.")

    print("[DONE] Switch controller finished.")


if __name__ == "__main__":
    main()
