import json
import os

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cookies_path = os.path.join(base_dir, 'scratch', 'new_cookies.json')
    config_tmpl_path = os.path.join(base_dir, 'config.json')
    dest_path = os.path.join(base_dir, 'config_account4.json')

    # Load cookies
    with open(cookies_path, 'r', encoding='utf-8') as f:
        cookies_list = json.load(f)

    cookie_pairs = []
    session_val = None
    for cookie in cookies_list:
        name = cookie.get('name')
        value = cookie.get('value')
        if name and value is not None:
            cookie_pairs.append(f"{name}={value}")
            if name == 'session':
                session_val = value

    cookie_str = "; ".join(cookie_pairs)

    # Load template config
    with open(config_tmpl_path, 'r', encoding='utf-8-sig') as f:
        config = json.load(f)

    # Update fields
    if session_val:
        config["stake"]["access_token"] = session_val
        config["stake"]["session"] = session_val  # just in case
    config["stake"]["cookies"] = cookie_str
    if "cookies" in config:
        config["cookies"] = cookie_str

    # Reset financial stats for new account
    config["financial"] = {
        "initial_capital": 0.0,
        "total_withdrawn": 0.0,
        "lifetime_deficit": 0.0
    }

    # Save new config file
    with open(dest_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

    print(f"Successfully created config_account4.json!")

if __name__ == "__main__":
    main()
