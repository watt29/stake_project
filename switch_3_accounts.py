"""
switch_3_accounts.py - Runs 3 accounts one at a time, cycling endlessly.
Accounts: config.json (watt29) -> config_account2.json (Win29) -> config_account3.json (Gen45)

Usage:
  python switch_3_accounts.py [--duration MINUTES]

  --duration  : Minutes each account runs per cycle (default: 30)
"""

import subprocess
import sys
import os
import time
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON_EXE = sys.executable

ACCOUNTS = [
    "config.json",
    "config_account2.json",
    "config_account3.json"
]

def disable_quickedit():
    if os.name == 'nt':
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.GetStdHandle(-10)
            mode = ctypes.c_uint32()
            kernel32.GetConsoleMode(handle, ctypes.byref(mode))
            mode.value &= ~0x0040
            kernel32.SetConsoleMode(handle, mode)
        except Exception:
            pass

def account_label(config_name):
    config_path = os.path.join(BASE_DIR, config_name)
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        return config.get("account_name") or config.get("stake", {}).get("account_name") or config_name
    except:
        return config_name

def mark_account_starting(config_name):
    suffix = config_name.replace("config", "").replace(".json", "")
    stats_path = os.path.join(BASE_DIR, f"dice_stats{suffix}.json")
    try:
        with open(stats_path, "r", encoding="utf-8") as f:
            stats = json.load(f)
        stats["rotation_status"] = "STARTING"
        with open(stats_path, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
    except:
        pass

def start_bot(config_name):
    mark_account_starting(config_name)
    cmd = [PYTHON_EXE, "-u", "dice_bot_utf8.py", "--config", config_name]
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
    p = subprocess.Popen(cmd, cwd=BASE_DIR, creationflags=creationflags)
    print(f"  [START] {account_label(config_name)} ({config_name}) started in new window.")
    return p

def stop_bot(config_name, p):
    # Graceful stop for tipping
    with open(f"stop_{config_name}.flag", "w") as f:
        f.write("stop")
    print(f"  [STOP ] Sent graceful stop signal to {account_label(config_name)}. Waiting up to 20s for Auto-Tip and Chrome closure...")
    
    try:
        p.wait(timeout=20)
    except:
        pass
        
    flag_file = f"stop_{config_name}.flag"
    if os.path.exists(flag_file):
        try: os.remove(flag_file)
        except: pass
        
    if p.poll() is None:
        try:
            if os.name == 'nt':
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                p.terminate()
        except:
            pass
    print(f"  [STOP ] {account_label(config_name)} terminated.")
    time.sleep(3)

def read_status(config_name):
    suffix = config_name.replace("config", "").replace(".json", "")
    stats_path = os.path.join(BASE_DIR, f"dice_stats{suffix}.json")
    try:
        with open(stats_path, "r", encoding="utf-8") as f:
            stats = json.load(f)
        return stats.get("rotation_status", "UNKNOWN")
    except:
        return "UNKNOWN"

def wait_with_countdown(duration_min, config_name):
    total_sec = duration_min * 60
    elapsed = 0
    while elapsed < total_sec:
        status = read_status(config_name)
        if status == "INSUFFICIENT_FUNDS":
            print(f"  [SKIP ] Insufficient funds for {account_label(config_name)}. Moving to next.")
            return True
            
        remaining = total_sec - elapsed
        if elapsed % 30 == 0:
            print(f"  [{account_label(config_name)}] {remaining//60}m {remaining%60:02d}s remaining | Status: {status}")
            
        sleep_for = min(5, remaining)
        time.sleep(sleep_for)
        elapsed += sleep_for
    return False

def main():
    disable_quickedit()
    duration = 30
    args = sys.argv
    if "--duration" in args:
        duration = int(args[args.index("--duration") + 1])

    print("=" * 60)
    print("  3-ACCOUNT ROTATION CONTROLLER WITH AUTO-TIP")
    print(f"  Accounts: {' -> '.join([account_label(c) for c in ACCOUNTS])}")
    print(f"  Duration: {duration} minutes per account")
    print("=" * 60)

    try:
        while True:
            for cfg in ACCOUNTS:
                print(f"\n[>>] Switching to {account_label(cfg)}")
                proc = start_bot(cfg)
                wait_with_countdown(duration, cfg)
                stop_bot(cfg, proc)
                print("  [PAUSE] Waiting 5 seconds before next account...")
                time.sleep(5)
    except KeyboardInterrupt:
        print("\n[CTRL+C] Stopping controller...")

if __name__ == "__main__":
    main()
