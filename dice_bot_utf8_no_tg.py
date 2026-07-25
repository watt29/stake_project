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

#  LOAD USER CONFIG ( --config profile)

# ============================================================

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))



#  --config argument : python dice_bot.py --config config_user2.json

_config_arg = "config.json"

_DURATION = 0
_SESSION_START_TIME = time.time()
if "--duration" in sys.argv:
    try:
        idx = sys.argv.index("--duration")
        if idx + 1 < len(sys.argv):
            _DURATION = int(sys.argv[idx + 1])
    except:
        pass

if "--config" in sys.argv:

    idx = sys.argv.index("--config")

    if idx + 1 < len(sys.argv):

        _config_arg = sys.argv[idx + 1]



_CONFIG_FILE = os.path.join(_BASE_DIR, _config_arg)



# Stats file  profile  config_user2.json -> dice_stats_user2.json

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

# 1.  Logging

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

        self.default_skills = {

            "isolated_wins_threshold": 16,

            "sawtooth_length": 6,

        }

        # Default fallback skills

        self.ai_skills = self.default_skills.copy()

        self.load_skills()



    def load_skills(self):

        try:

            #  I/O Race Condition

            time.sleep(0.1)

            with open(self.config_path, 'r', encoding="utf-8") as f:

                new_skills = json.load(f)

            merged_skills = self.default_skills.copy()

            merged_skills.update(new_skills)

            new_skills = merged_skills

                

            # ==========================================

            #  Schema Validation

            # ==========================================

            expected_schema = {

                "isolated_wins_threshold": int,

                "sawtooth_length": int

            }

            

            #  Key Existence  Type Checking

            for key, expected_type in expected_schema.items():

                if key not in new_skills:

                    raise ValueError(f": '{key}'")

                if not isinstance(new_skills[key], expected_type) or isinstance(new_skills[key], bool):

                    raise TypeError(f" '{key}'  ({expected_type.__name__}) ")

            #  Value Constraints
            if new_skills["sawtooth_length"] < 2:

                raise ValueError("sawtooth_length  2")

            



            

            # ==========================================

            # 2.  Logging  Hot Reload 

            # ==========================================

            old_skills = self.ai_skills.copy() # 

            

            # Atomic Replacement

            self.ai_skills = new_skills

            

            if old_skills != self.ai_skills:

                logging.info(

                    f" [Hot Reload Success] AI Skills updated!\n"

                    f"   --> Old: {old_skills}\n"

                    f"   --> New: {self.ai_skills}"

                )

            else:

                logging.debug(" [Hot Reload] File modified but values remain unchanged.")

            

        except json.JSONDecodeError:

            logging.error("  [JSON Error]  JSON  () ")

        except (ValueError, TypeError) as validate_err:

            logging.warning(f" [Validation Failed]  Config  : {validate_err} -> ")

        except Exception:

            logging.exception("  [Unknown Error]  AI Skills ")



    def on_modified(self, event):

        # normalize paths to prevent cross-platform issues

        if os.path.normpath(self.config_path) in os.path.normpath(event.src_path):

            self.load_skills()



def _load_config():

    if not os.path.exists(_CONFIG_FILE):

        print(f"[ERROR]  {_config_arg} ")

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



def get_currency():

    global _active_bot

    if _active_bot and hasattr(_active_bot, 'currency') and _active_bot.currency:

        return _active_bot.currency.upper()

    return "BTC"



def get_min_bet(currency_str):
    return 0.0005







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

        "last_condition": None,

        "initial_balance": 0.0,

        "total_withdrawn": _fin.get("total_withdrawn", 0.0),

        "total_deposited": 0.0,

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

    """"""

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:

        with open(EVENT_LOG, "a", encoding="utf-8") as f:

            f.write(f"[{timestamp}] {message}\n")

    except:

        pass



def _tg_worker(url, payload):

    try: requests.post(url, json=payload, timeout=10)

    except: pass













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

            p_icon = "" if profit >= 0 else ""

            uptime = _bot_state.get('total_uptime_seconds', 0)






# ============================================================

#  TELEGRAM COMMAND MENU (Background Thread)

# ============================================================

_tg_offset   = 0      # last update_id processed






def _send_main_menu():




def _tg_listener():

    """Background thread: poll Telegram every 2s for commands."""

    global _tg_offset

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates"

    # Flush old messages on startup  skip anything already queued

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



                #   (text command) 

                msg = upd.get("message", {})

                if msg:

                    chat_id = str(msg.get("chat", {}).get("id", ""))

                    text = msg.get("text", "").strip().lower() if msg.get("text") else ""

                    if chat_id == TELEGRAM_CHAT_ID:

                        if text in ("/start", "/menu"):

                            _send_main_menu()

                        elif text.startswith("/"):

                            _handle_command(text)



                #  Callback query ( inline keyboard) 

                cb = upd.get("callback_query", {})

                if cb:

                    cb_id   = cb["id"]

                    cb_chat = str(cb["message"]["chat"]["id"])

                    cb_mid  = cb["message"]["message_id"]

                    data    = cb.get("data", "").strip().lower()




                    if cb_chat != TELEGRAM_CHAT_ID:

                        continue



                    if data == "main_menu":


                    elif data == "tp_menu":


                    elif data == "tip_menu":


                    elif data == "sl_menu":


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

    def __init__(self, token, cookies, currency="btc", simulate=False, mirror_host="stake.games", proxy="", skill_manager=None, account_name=None):

        self.token = token

        self.skill_manager = skill_manager

        self.api_url = f"https://{mirror_host}/_api/graphql"

        self.currency = currency.lower()
        self.simulate = simulate
        self.history_file = HISTORY_FILE
        self.token = token
        self.account_name = account_name or "Unknown"
        
        options = uc.ChromeOptions()

        options.headless = False

        browser_profile_name = _profile_suffix.lstrip("_") or "default"
        browser_profile_dir = os.path.join(_BASE_DIR, "browser_profiles", browser_profile_name)
        os.makedirs(browser_profile_dir, exist_ok=True)
        options.add_argument(f"--user-data-dir={browser_profile_dir}")

        if proxy:

            options.add_argument(f'--proxy-server={proxy}')

            

        print(" [SYSTEM] Starting Browser for Cloudflare bypass...")

        self.driver = uc.Chrome(options=options, version_main=150)

        self.driver.set_script_timeout(10)
        self.driver.set_page_load_timeout(30)

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

        #  rotateServerSeed  ( Server  Client Seed)

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

                # msg = f" <b>Seed Rotated ({reason})</b>\n Seed \n<i>*Server Seed Reset </i>"

                self.log_event(f" Seed Rotated ({reason}): Server seed changed successfully.")

                # tg(msg) # Disabled per user request

                return True

            else:

                error_list = res.get("errors") if res else []

                error_msg = error_list[0].get("message", "Unknown API rejection") if error_list else "No response from API"

                self.log_event(f"  Seed Rotation Rejected: {error_msg}")

        except Exception as e:

            self.log_event(f"  Seed Rotation Error: {str(e)}")

        return False



    def get_total_bets_from_stats(self):

        """ Bet """

        stats = load_stats()

        return stats.get("total_bets", 0)



    def save_daily_report(self, start_bal, end_bal, profit, wagered, deposits=0, withdrawals=0):

        """ (CSV)"""

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

            self.log_event(f" Daily Accounting Report Saved: {date_today}")

        except Exception as e:

            self.log_event(f"  Failed to save daily report: {str(e)}")



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

                _time.sleep(0.35)

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

        # 1. First, try reading directly from the UI (faster and no GraphQL rate limit)

        if hasattr(self, 'driver') and self.driver:

            try:

                # Enforce that the scraped currency matches the active bot currency

                target_currency = self.currency.lower()

                js_script = """

                    var btn = document.querySelector('button[data-testid="coin-toggle"]');

                    if (btn && btn.getAttribute('data-active-currency') === 'TARGET_CURRENCY') {

                        // Try Method 1: The exact user-provided path

                        var span = document.querySelector('#navigation-container-header > div.w-full.flex.justify-center > div > div > div > div > button > div > div > span.content > span');

                        if (span && span.innerText) {

                            var val = span.innerText.replace(/,/g, '').trim();

                            if (val !== "" && !isNaN(val)) return val;

                        }

                        

                        // Method 2: Resilient search inside the matching coin-toggle button

                        var spans = btn.querySelectorAll('span');

                        for (var i = 0; i < spans.length; i++) {

                            var text = spans[i].innerText;

                            if (text) {

                                text = text.replace(/,/g, '').trim();

                                if (text !== "" && !isNaN(text) && text.length > 2) {

                                    return text;

                                    break;

                                }

                            }

                        }

                    }

                    return null;

                """.replace("TARGET_CURRENCY", target_currency)

                

                for _ in range(3): # Try 3 times quickly if DOM is still rendering

                    bal_text = self.driver.execute_script(js_script)

                    if bal_text is not None:

                        try:

                            return float(bal_text)

                        except ValueError:

                            pass

                    time.sleep(0.5)

            except Exception as e:

                print(f"   [!] UI Balance Scrape Error: {e}")



        # 2. Fallback to GraphQL

        query = """
        query Balances {
          user {
            name
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
                    
                self.account_name = user_data.get("name", "Unknown")
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

            self.log_event(" Attempting to Auto-Claim Rakeback...")

            res = self._execute_graphql(query, operation_name="ClaimRakeback")

            if res and "data" in res and res["data"]:

                print(" [SYSTEM]  Rakeback Claimed Successfully!")

                self.log_event(" Rakeback Claimed Successfully!")


                return True

            else:

                if res and "errors" in res:

                    err = res["errors"][0].get("message", "Unknown Error")

                    print(f" [SYSTEM]   Rakeback claim error: {err}")

                    self.log_event(f"  Rakeback claim error: {err}")

                else:

                    print(" [SYSTEM]   Rakeback claim returned empty response")

                    self.log_event("  Rakeback claim returned empty response")

        except Exception as e:

            print(f" [SYSTEM]   Rakeback claim exception: {str(e)}")

            self.log_event(f"  Rakeback claim exception: {str(e)}")

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

                        print("   [] Cloudflare challenge active! Please check the browser window and solve the captcha.")

                        time.sleep(5)

                    elif "rate limit" in err_msg.lower() or "too many" in err_msg.lower():

                        self.log_event(" API Rate Limit detected. Cooling down...")

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



    def start_dice_bot(self, base_bet, dynamic_percent=0.0, target=65.00, condition="below", strategy="default"):

        session_wins = 0

        balance = 0.0

        print(" [SYSTEM] Loading persistent stats...")

        persistent = load_stats()

        total_profit = persistent.get("total_profit", 0.0)

        total_bets = persistent.get("total_bets", 0)

        total_wagered = persistent.get("total_wagered", 0.0)

        wins = persistent.get("wins", 0)

        losses = persistent.get("losses", 0)
        
        win_rate = (wins / total_bets * 100.0) if total_bets > 0 else 0.0

        max_loss_streak = persistent.get("max_loss_streak", 0)

        max_single_loss = persistent.get("max_single_loss", 0.0)

        if strategy in [None, "", "random", "default"]:
            active_strategy = random.choice(["default", "matchmaker"]) if strategy == "random" else (strategy or "default")
        else:
            active_strategy = strategy

        current_win_chance = persistent.get("current_win_chance", 66.00)
        base_win_chance = 66.00

        print(f" [STRATEGY] Active Strategy Mode: {active_strategy.upper()}")

        current_condition = condition

        target = target

        total_withdrawn = persistent.get("total_withdrawn", 300.0)

        total_deposited = persistent.get("total_deposited", 0.0)

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

        isolated_win_count = persistent.get("isolated_win_count", 0)

        

        shadow_bet_enabled = bool(_bots.get("shadow_bet_enabled", True))
        shadow_escape_wins = max(1, int(_bots.get("shadow_escape_wins", 2)))
        shadow_sawtooth_skip_rolls = max(0, int(_bots.get("shadow_sawtooth_skip_rolls", 10)))
        virtual_state = persistent.get("virtual_state", "NONE")
        if not shadow_bet_enabled or virtual_state in ("LOSS_STREAK", "WARMUP", "WAIT_WW"):
            virtual_state = "NONE"

        virtual_escape_pattern = ['W'] * shadow_escape_wins

        virtual_entry_step = 0

        virtual_rolls_seen = persistent.get("virtual_rolls_seen", 0)

        

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



        #  Telegram  inline menu




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

        # A zero balance is not a betting condition.  End this account cleanly
        # so the rotation controller can move on without sending any bet.
        if balance <= 0:
            persistent["rotation_status"] = "INSUFFICIENT_FUNDS"
            persistent["rotation_session_start_balance"] = 0.0
            persistent["rotation_session_profit"] = 0.0
            save_stats(persistent)
            _bot_state['active'] = False
            _bot_state['api_status'] = "Insufficient funds - account paused"
            self.log_event("INSUFFICIENT FUNDS: account paused; no bet was sent.")
            print(" [SYSTEM] Insufficient balance. Account paused; no bet was sent.")
            return

        rotation_session_start_balance = balance
        persistent["rotation_session_start_balance"] = rotation_session_start_balance
        persistent["rotation_session_profit"] = 0.0
        persistent["rotation_status"] = "RUNNING"
        save_stats(persistent)
        _bot_state['api_status'] = "RUNNING - connected"



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

                session_profit = balance - rotation_session_start_balance



                #  (BELOW / ABOVE)

                current_condition = random.choice(["above", "below"])

                if active_strategy == "matchmaker":
                    target = (100.0 - current_win_chance) if current_condition == "above" else current_win_chance
                else:
                    target = 35.00 if current_condition == "above" else 65.00



                # --- PULL HERMES AI SKILLS FROM RAM ---

                if hasattr(self, 'skill_manager') and self.skill_manager:

                    ai_skills = self.skill_manager.ai_skills

                else:

                    ai_skills = {"isolated_wins_threshold": 16, "sawtooth_length": 6}

                

                ai_sawtooth_len = ai_skills.get("sawtooth_length", 6)

                ai_isolated_wins = ai_skills.get("isolated_wins_threshold", 16)

                display_step = 1



                # --- VIRTUAL PAUSE MODE (STREAK BREAKER) ---

                is_sawtooth = False

                if len(recent) >= ai_sawtooth_len:

                    last_n = recent[-ai_sawtooth_len:]

                    if last_n == ["W", "L"] * (ai_sawtooth_len // 2) or last_n == ["L", "W"] * (ai_sawtooth_len // 2):

                        is_sawtooth = True



                #  

                # --- BET SIZING ---
                if True:
                    min_bet_allowed = get_min_bet(self.currency)

                    # base_bet from config.json, with Stake minimum guard
                    if base_bet < min_bet_allowed:
                        base_bet = min_bet_allowed

                current_bet = persistent.get("current_bet", base_bet)
                if current_bet < min_bet_allowed:
                    current_bet = min_bet_allowed
                planned_bet = current_bet


                # --- PROACTIVE BALANCE CHECK ---

                if virtual_state == "NONE" and current_bet > balance:

                    self.log_event(f"  !  {current_bet:.8f} {self.currency.upper()}  {balance:.8f} {self.currency.upper()}")

                    err_key = "proactive_funds"

                    if _bot_state.get('last_error') != err_key:


                        _bot_state['last_error'] = err_key

                        _bot_state['error_count'] = _bot_state.get('error_count', 0) + 1

                    

                    _bot_state['api_status'] = "  (Proactive)"

                    current_loss_streak = 0

                    streak = 0

                    streak_type = None

                    persistent["rotation_status"] = "INSUFFICIENT_FUNDS"
                    save_stats(persistent)
                    self.log_event("INSUFFICIENT FUNDS: account paused before a bet was sent.")
                    print(" [SYSTEM] Insufficient balance. Account paused before placing a bet.")
                    return

                

                if _stop_event.is_set(): return



                now_ts = time.time()

                stress_trigger = (

                    virtual_state == "NONE"

                    and (now_ts - last_high_stress_rotation_time) >= 60

                )

                time_trigger = (total_bets >= self.next_rotation_bet)

                if stress_trigger or time_trigger:

                    reason = "High Stress" if stress_trigger else "Adaptive"

                    if self.rotate_seed(reason) and stress_trigger:

                        last_high_stress_rotation_time = now_ts

                    elif stress_trigger:

                        last_high_stress_rotation_time = now_ts

                

                real_escape_turn = virtual_state == "NONE"
                is_virtual_bet = not real_escape_turn

                if real_escape_turn:
                    current_bet = planned_bet
                    bet_res = self.place_dice_bet(current_bet, target, current_condition)
                else:
                    current_bet = 0.0
                    virtual_result = round(random.uniform(0, 100), 2)
                    self.log_event(f"Virtual bet active: current_bet = 0.0 ({virtual_state})")
                    bet_res = {"data": {"diceRoll": {"id": "virtual", "amount": 0.0,
                              "payout": 0.0, "state": {"result": virtual_result}}}}

                

                if bet_res and "errors" in bet_res:

                    err_msg = bet_res["errors"][0].get("message", "")

                    if "balance" in err_msg.lower() or "funds" in err_msg.lower():

                        self.log_event(" INSUFFICIENT BALANCE! (API Error) Account paused.")

                        err_key = "insufficient_funds_api"

                        if _bot_state.get('last_error') != err_key:


                            _bot_state['last_error'] = err_key

                        

                        # Do not retry an insufficient-funds request.  Persist a
                        # terminal status so the rotation controller can advance.
                        _bot_state['api_status'] = "Insufficient funds - account paused"

                        current_loss_streak = 0

                        persistent["rotation_status"] = "INSUFFICIENT_FUNDS"
                        save_stats(persistent)
                        print(" [SYSTEM] Insufficient balance from Stake. Account paused.")
                        return

                    else:

                        self.log_event(f"  API Error: {err_msg}")

                        time.sleep(5)

                        continue



                if not bet_res or "data" not in bet_res or not bet_res["data"] or not bet_res["data"].get("diceRoll"):

                    self.log_event("  Incomplete bet response. Retrying...")

                    time.sleep(5); continue



                roll_data = bet_res["data"]["diceRoll"]

                

                # Clear error state on successful bet

                _bot_state.pop('last_error', None)

                _bot_state['error_count'] = 0

                _bot_state['api_status'] = "RUNNING - last bet confirmed"

                payout = float(roll_data.get("payout", 0))

                result_state = roll_data.get("state")

                if not result_state:

                    self.log_event("  Missing roll state. Retrying...")

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

                

                #  3. GOAL & RISK MANAGEMENT 

                # Automatic take-profit pause is disabled.

                target_tp = _bot_state.get('take_profit', 0.0)

                if False:


                    

                    self.save_daily_report(

                        start_bal=start_balance,

                        end_bal=balance,

                        profit=total_profit,

                        wagered=total_wagered,

                        deposits=total_deposited,

                        withdrawals=total_withdrawn

                    )

                    

                    self.log_event(f" Daily Goal Reached: {total_profit:.8f} {self.currency.upper()}. Auto-pausing for safety.")

                    

                    # Reset for next potential session or wait for user

                    start_balance = balance

                    total_profit = 0

                    total_deposited = 0

                    total_withdrawn = 0

                    _bot_state['take_profit'] = 0 # Clear TP to prevent immediate re-trigger

                    pause_seconds = 300
                    pause_until = time.time() + pause_seconds
                    persistent["rotation_status"] = "SAFETY_PAUSE"
                    persistent["pause_until"] = pause_until
                    _bot_state['api_status'] = "SAFETY PAUSE - daily goal reached"

                    

                    save_stats(persistent)

                    print("\n=======================================================")
                    print("  BOT STATUS: SAFETY PAUSE (NOT STUCK)")
                    print("  Reason    : Daily goal reached")
                    print("  Action    : No bets for 5 minutes; then resumes")
                    print("=======================================================")
                    while time.time() < pause_until:
                        pause_left = int(max(0, pause_until - time.time()))
                        print(f"  [PAUSED] {pause_left // 60}m {pause_left % 60:02d}s remaining", flush=True)
                        time.sleep(min(30, max(1, pause_left)))

                    persistent["rotation_status"] = "RUNNING"
                    persistent.pop("pause_until", None)
                    _bot_state['api_status'] = "RUNNING - safety pause complete"
                    save_stats(persistent)

                    continue 



                delta = new_balance - (balance - current_bet + payout)

                #  threshold 1.0 BTC  floating point error  payout 

                if abs(delta) > 1.0:

                    type_str = "DEPOSIT" if delta > 0 else "WITHDRAWAL"

                    self.log_event(f" External Balance Change: {type_str} detected ({delta:+.8f} {self.currency.upper()})")

                    if delta < 0:

                        total_withdrawn += abs(delta)

                    else:

                        #   

                        total_deposited += delta

                        initial_capital += delta

                        log_deposit_to_csv(delta, new_balance)


                    start_balance += delta

                    cycle_start_balance += delta

                


                if _DURATION and time.time() - _SESSION_START_TIME >= _DURATION * 60:
                    self.log_event(f"AUTO-STOP: Reached duration limit of {_DURATION} minutes.")
                    sys.exit(0)
                if not is_virtual_bet:
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

                    if not is_virtual_bet:
                        wins += 1
                        session_wins += 1
                    current_loss_streak = 0
                    real_consecutive_wins += 1
                    isolated_win_count += 1

                    if active_strategy == "matchmaker":
                        persistent["current_bet"] = round(base_bet, 8)
                        current_win_chance = max(0.01, round(current_win_chance - 4.00, 2))
                        persistent["current_win_chance"] = current_win_chance
                    elif real_consecutive_wins >= 3:
                        self.log_event("3 Wins Streak: Resetting Martingale bet")
                        persistent["current_bet"] = base_bet
                        real_bets_without_ww = 0
                        isolated_win_count = 0

                else:

                    if not is_virtual_bet:
                        losses += 1

                    current_loss_streak += 1
                    real_consecutive_wins = 0

                    if active_strategy == "matchmaker":
                        persistent["current_bet"] = round(planned_bet * 2.90, 8)
                        current_win_chance = base_win_chance
                        persistent["current_win_chance"] = current_win_chance
                    else:
                        persistent["current_bet"] = round(planned_bet * 1.45, 8)

                    if current_loss_streak > max_loss_streak: max_loss_streak = current_loss_streak

                    if planned_bet > max_single_loss: max_single_loss = planned_bet

                    if current_loss_streak > persistent.get("max_loss_streak", 0) and current_loss_streak >= 15:


                        persistent["max_loss_streak"] = current_loss_streak



                    # High Risk Alert

                    bet_mult = int(planned_bet / base_bet)

                    target_m = 0

                    for m in sorted(BET_ALERT_MULTIPLIERS, reverse=True):

                        if bet_mult >= m: target_m = m; break

                    if target_m > current_highest_alert:

                        current_highest_alert = target_m




                    # Milestone Streak

                    if current_loss_streak in STREAK_MILESTONES:






                

                last_roll = result

                last_net = payout - current_bet

                last_result = "WIN" if is_win else "LOSS"

                recent.append("W" if is_win else "L")



                if len(recent) > 10:

                    recent.pop(0)

                if virtual_state == "NONE" and is_sawtooth:
                    virtual_state = "SAWTOOTH"
                    virtual_escape_pattern = ['W'] * shadow_escape_wins
                    virtual_rolls_seen = 0
                    self.log_event(f"Entering virtual mode: {virtual_state}")
                elif virtual_state == "SAWTOOTH":
                    if (virtual_rolls_seen >= shadow_sawtooth_skip_rolls
                            and recent[-shadow_escape_wins:] == virtual_escape_pattern):
                        virtual_state = "NONE"
                        virtual_rolls_seen = 0
                        self.log_event("Virtual sawtooth skip complete: returning to real betting")

                # Removed fib limit check



                # (Stop Loss feature has been removed as per user request)



                # (Dynamic condition switching has been replaced by per-roll random Over/Under)



                #  5.  

                balance = new_balance
                session_profit = balance - rotation_session_start_balance
                win_rate = (wins / total_bets * 100.0) if total_bets > 0 else 0.0



                #  4.  (State Sync) 

                save_stats({

                    "total_profit": total_profit,

                    "total_bets": total_bets,

                    "total_wagered": total_wagered,

                    "wins": wins,

                    "losses": losses,

                    "max_loss_streak": max_loss_streak,

                    "max_single_loss": max_single_loss,

                    "last_condition": current_condition,

                    "initial_balance": start_balance,

                    "total_withdrawn": total_withdrawn,

                    "total_deposited": total_deposited,

                    "initial_capital": initial_capital,

                    "peak_equity": peak_equity,

                    "max_drawdown": max_drawdown,

                    "take_profit": take_profit,

                    "stop_loss": stop_loss,

                    "total_uptime_seconds": total_uptime_seconds,

                    "rotation_session_start_balance": rotation_session_start_balance,

                    "rotation_session_profit": session_profit,

                    "real_bets_without_ww": real_bets_without_ww,

                    "isolated_win_count": isolated_win_count,

                    "virtual_state": virtual_state,

                    "virtual_rolls_seen": virtual_rolls_seen,

                    "current_strategy": persistent.get("current_strategy", active_strategy),

                    "labouchere_base_bet": persistent.get("labouchere_base_bet", base_bet),

                    "labouchere_list": labouchere_list,

                    "current_bet": persistent.get("current_bet", 0.0),

                    "rotation_status": persistent.get("rotation_status", "RUNNING"),

                    "pause_until": persistent.get("pause_until", None)

                })

                if total_profit >= take_profit:
                    persistent.update({
                        "total_profit": total_profit,
                        "total_bets": total_bets,
                        "total_wagered": total_wagered,
                        "wins": wins,
                        "losses": losses,
                        "initial_balance": start_balance,
                        "initial_capital": initial_capital,
                        "take_profit": take_profit,
                        "rotation_status": "TAKE_PROFIT_REACHED",
                    })
                    save_stats(persistent)
                    _bot_state['active'] = False
                    _bot_state['api_status'] = "Stopped - take profit reached"
                    self.log_event(
                        f"TAKE PROFIT REACHED: {total_profit:.8f} "
                        f"{self.currency.upper()}. Bot stopped."
                    )
                    print(
                        f" [SYSTEM] Take profit reached: {total_profit:.8f} "
                        f"{self.currency.upper()}. Bot stopped."
                    )
                    return



                _bot_state.update({

                    'balance'       : balance,

                    'start_balance' : initial_capital, # ROI now tracks from initial_capital

                    'virtual_state' : virtual_state,

                    'profit'        : total_profit,

                    'total_withdrawn': total_withdrawn,

                    'initial_capital': initial_capital,

                })
                clear()
                print("======================================================================")
                print(f"                  COMMANDER BRIAN | MISSION CONTROL - {self.account_name}")
                print("======================================================================")
                if _DURATION > 0:
                    elapsed_session = time.time() - _SESSION_START_TIME
                    left_sec = int(max(0, _DURATION * 60 - elapsed_session))
                    time_left_str = f"{left_sec // 60}m {left_sec % 60}s"
                else:
                    time_left_str = "∞ (No limit)"

                print("  FINANCIALS:")
                print(f"    Bot Status: {_bot_state.get('api_status', 'RUNNING')}")
                print(f"    Balance   : {balance:.8f} {self.currency.upper()}")
                print(f"    Session P/L: {session_profit:+.8f} {self.currency.upper()}")
                print(f"    Profit    : {total_profit:+.8f} {self.currency.upper()}")
                print(f"    Uptime    : {total_uptime_seconds//3600}h {(total_uptime_seconds%3600)//60}m")
                print(f"    Time Left : {time_left_str}")
                print("")
                print("  STATISTICS:")
                print(f"    Total Real Bets : {total_bets}")
                print(f"    Win Rate   : {win_rate:.1f}% ({wins} W / {losses} L)")
                print(f"    Streak     : {streak} {streak_type}")
                print(f"    Loss Streak: {current_loss_streak} | Max: {max_loss_streak}")
                print(f"    Recent     : {''.join(recent[-6:])}")
                print("")
                print("  STRATEGY & GUARD:")
                next_bet_amount = persistent.get("current_bet", base_bet)
                if next_bet_amount < min_bet_allowed: next_bet_amount = min_bet_allowed
                print(f"    Bet Amount   : {next_bet_amount:.8f} {self.currency.upper()} | Roll {'ABOVE' if current_condition == 'above' else 'BELOW'} {target:.2f}")

                print("")
                print("  LAST ROLL:")
                last_result_str = 'WIN' if last_result == 'WIN' else 'LOSS'
                print(f"    Result : {last_roll:.2f} -> {last_result_str} ({last_net:+.8f} {self.currency.upper()})")
                print("======================================================================")

                # Smart Speed: Max speed enabled

 

            except KeyboardInterrupt:

                clear()


                print("Bot stopped by user.")

                print(f"Final Profit: {total_profit:.8f} {self.currency.upper()} | Bets: {total_bets} ({wins}W/{losses}L)")

                raise  # re-raise  outer loop 

            except Exception as e:

                clear()


                print("=======================================================")

                print(f"  [ERROR] {str(e)[:60]}")

                print(f"  [RECOVER] Retrying in 5 seconds...")

                print(f"  [INFO] Profit so far: {total_profit:.8f} {self.currency.upper()}")
                time.sleep(5)
                continue



                # Health Check ( 100 bets)

                if total_bets % BALANCE_REPORT_EVERY == 0:

                    win_rate_now = (wins / total_bets * 100)

                    p_icon = "" if total_profit >= 0 else ""




                mode_str = "REAL"

                status_str = "WIN" if is_win else "LOSS"

                self.log_to_csv([

                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

                    mode_str, 1, current_bet, target, current_condition, result, payout, status_str, streak, streak_type

                ])



                # ========== COMMANDER BRIAN | FULL DISCLOSURE DASHBOARD ==========

                clear()

                win_rate = (wins / total_bets * 100) if total_bets > 0 else 0

                mode = "SIMULATION" if self.simulate else "LIVE"

                p_sign = "+" if total_profit >= 0 else ""

                

                print("======================================================================")
                print(f"                  COMMANDER BRIAN | MISSION CONTROL - {self.account_name} | {mode}")
                print("======================================================================")
                if _DURATION > 0:
                    elapsed_session = time.time() - _SESSION_START_TIME
                    left_sec = int(max(0, _DURATION * 60 - elapsed_session))
                    time_left_str = f"{left_sec // 60}m {left_sec % 60}s"
                else:
                    time_left_str = "∞ (No limit)"

                print("  FINANCIALS:")
                print(f"    Balance   : {balance:.8f} {self.currency.upper()}")
                print(f"    Profit    : {total_profit:+.8f} {self.currency.upper()}")
                print(f"    Uptime    : {total_uptime_seconds//3600}h {(total_uptime_seconds%3600)//60}m")
                print(f"    Time Left : {time_left_str}")
                print("")
                print("  STATISTICS:")
                print(f"    Total Real Bets : {total_bets}")
                print(f"    Win Rate   : {win_rate:.1f}% ({wins} W / {losses} L)")
                print(f"    Streak     : {streak} {streak_type}")
                print(f"    Recent     : {''.join(recent[-6:])}")
                print("")
                print("  STRATEGY & GUARD:")
                if virtual_state != "NONE":
                    pattern_str = " - ".join(virtual_escape_pattern)
                    print(f"    Current Step : [SCANNING] Waiting for {pattern_str} ({virtual_rolls_seen} rolls)")
                    print(f"    Bet Amount   : 0.00000000 {self.currency.upper()} | Virtual Roll")
                else:
                    next_bet_amount = persistent.get("current_bet", base_bet)
                    if next_bet_amount < min_bet_allowed: next_bet_amount = min_bet_allowed
                    print(f"    Bet Amount   : {next_bet_amount:.8f} {self.currency.upper()} | Roll {current_condition.upper()} {target}")
                
                if take_profit > 0:
                    progress = min(100, max(0, (total_profit / take_profit * 100)))
                    bar_len = 20
                    filled = int(bar_len * progress / 100)
                    bar = "=" * filled + "-" * (bar_len - filled)
                    print(f"    Goal Progress: [{bar}] {progress:.1f}%")

                print("")
                print("  LAST ROLL:")
                last_result_str = 'WIN' if last_result == 'WIN' else 'LOSS'
                print(f"    Result : {last_roll:.2f} -> {last_result_str} ({last_net:+.8f} {self.currency.upper()})")
                print("======================================================================")

                # Smart Speed: Max speed enabled



            except KeyboardInterrupt:

                clear()


                print("Bot stopped by user.")

                print(f"Final Profit: {total_profit:.8f} {self.currency.upper()} | Bets: {total_bets} ({wins}W/{losses}L)")

                raise  # re-raise  outer loop 

            except Exception as e:

                clear()


                print("=======================================================")

                print(f"  [ERROR] {str(e)[:60]}")

                print(f"  [RECOVER] Retrying in 5 seconds...")

                print(f"  [INFO] Profit so far: {total_profit:.8f} {self.currency.upper()}")

                print("=======================================================")

                time.sleep(5)



if __name__ == "__main__":

    # ============================================================

    #   config.json ( config.json)

    # ============================================================

    _stake = _CFG["stake"]

    _bots  = _CFG["bot_settings"]



    TOKEN       = _stake["access_token"]

    COOKIES     = _stake["cookies"]

    CURRENCY    = _stake.get("currency", "btc")

    MIRROR_HOST = _stake.get("mirror_host", "stake.games")

    PROXY       = _stake.get("proxy", "")

    SIMULATE    = "--simulate" in sys.argv or _bots.get("simulate", False)



    print(f"[CONFIG] Mirror: {MIRROR_HOST} | Proxy: {PROXY or 'none'}")



    BASE_BET  = _bots.get("base_bet", 0.05)

    DYNAMIC_PERCENT = _bots.get("dynamic_percent", 0.0)

    TARGET    = _bots.get("target", 65.00)

    CONDITION = _bots.get("condition", "below")

    STRATEGY  = _bots.get("strategy", "random")



    print(f"[CONFIG] Telegram Chat: {TELEGRAM_CHAT_ID}")

    print(f"[CONFIG] Currency: {CURRENCY} | Base Bet: {BASE_BET} | Mode: {'SIMULATE' if SIMULATE else 'LIVE'}")



    if "--check" in sys.argv:

        min_bet_allowed = get_min_bet(CURRENCY)

        if BASE_BET < min_bet_allowed:

            raise ValueError(f"base_bet must be at least {min_bet_allowed} {CURRENCY.upper()}")

        if not TOKEN or not COOKIES:

            raise ValueError("Stake token/cookies are missing")

        print("[CHECK] Local startup check passed. Bot is ready to launch.")

        sys.exit(0)



    # ===== START WATCHDOG HOT RELOAD =====

    skill_manager = SkillManager(os.path.join(_BASE_DIR, "ai_skills.json"))

    observer = Observer()

    observer.schedule(skill_manager, path=_BASE_DIR, recursive=False)

    observer.start()



    ACCOUNT_NAME = _CFG.get("account_name") or _stake.get("account_name", "Unknown")

    bot = StakeDiceBot(TOKEN, COOKIES, currency=CURRENCY, simulate=SIMULATE,
                       mirror_host=MIRROR_HOST, proxy=PROXY, skill_manager=skill_manager, account_name=ACCOUNT_NAME)



    # ===== AUTO-HERMES AI LOOP =====

    def auto_hermes():

        while True:

            try:

                # Run the AI brain silently in the background

                with open(os.path.join(_BASE_DIR, "hermes_brain.log"), "a", encoding="utf-8") as log_file:

                    subprocess.run(

                        [sys.executable, "hermes_brain.py", _profile_suffix],

                        cwd=_BASE_DIR,

                        stdout=log_file,

                        stderr=log_file,

                        timeout=300,

                    )

            except Exception as e:

                self_msg = f"Hermes AI loop error: {e}"

                logging.exception(self_msg)

            # Run once at startup, then refresh every 10 minutes.

            time.sleep(600)



    # Start the AI in a background daemon thread so it runs alongside the bot

    ai_thread = threading.Thread(target=auto_hermes, daemon=True)

    ai_thread.start()



    # ===== RESURRECTION LOOP =====

    while True:

        try:

            bot.start_dice_bot(base_bet=BASE_BET, dynamic_percent=DYNAMIC_PERCENT, target=TARGET, condition=CONDITION, strategy=STRATEGY)

        except KeyboardInterrupt:

            print("Bot stopped by user.")

            break

        except Exception as e:


            print(f"[RESURRECTION] Crashed: {e}")

            print("[RESURRECTION] Restarting in 15 seconds...")

            time.sleep(15)













