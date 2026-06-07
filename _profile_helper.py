import json, sys, os

def main():
    if len(sys.argv) != 7:
        print("[ERROR] wrong number of arguments")
        sys.exit(1)

    name, token, cookies, chat_id, base_bet, init_cap = sys.argv[1:]
    fname = os.path.join(os.path.dirname(__file__), f"config_{name}.json")

    with open(fname, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    cfg["stake"]["access_token"] = token
    cfg["stake"]["cookies"] = cookies
    cfg["telegram"]["chat_id"] = chat_id
    cfg["bot_settings"]["base_bet"] = float(base_bet)
    cfg["financial"]["initial_capital"] = float(init_cap)

    with open(fname, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=4, ensure_ascii=False)

    print(f"[OK] saved {fname}")

if __name__ == "__main__":
    main()
