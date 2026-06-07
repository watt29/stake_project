import json, sys, os

def main():
    if len(sys.argv) != 4:
        print(f"Usage: python _update_session_helper.py <config_file> <token> <cookies>")
        sys.exit(1)

    cfg_file, token, cookies = sys.argv[1:]
    path = os.path.join(os.path.dirname(__file__), cfg_file)

    if not os.path.exists(path):
        print(f"[ERROR] {cfg_file} not found")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    cfg["stake"]["access_token"] = token
    cfg["stake"]["cookies"] = cookies

    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=4, ensure_ascii=False)

    print(f"[OK] Updated {cfg_file}")

if __name__ == "__main__":
    main()
