import json
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().with_name("config.json")

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    cfg = json.load(f)

token = cfg.get("stake", {}).get("access_token", "")
cookies = cfg.get("stake", {}).get("cookies", "")

with open(CONFIG_PATH, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=4, ensure_ascii=False)

print("Loaded current config. Testing connection...")

import re
from curl_cffi import requests as cfreq

def get_cookie(name, src):
    m = re.search(rf'(?:^|; ){re.escape(name)}=([^;]+)', src)
    return m.group(1).strip() if m else ""

session_val = get_cookie("session", cookies)
cf = get_cookie("cf_clearance", cookies)
print(f"session: {session_val[:20]}...")
print(f"cf_clearance: {cf[:30]}...")

headers = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "x-access-token": token,
    "x-language": "th",
    "origin": "https://stake.com",
    "referer": "https://stake.com/th",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "x-operation-name": "GetFeatureFlagDetails",
    "x-operation-type": "query",
}

s = cfreq.Session(impersonate="chrome110")
for part in cookies.split("; "):
    if "=" in part:
        k, v = part.split("=", 1)
        s.cookies.set(k.strip(), v.strip(), domain="stake.com")

query = '{"query":"{ user { id name } }"}'
r = s.post("https://stake.com/_api/graphql", headers=headers, data=query, timeout=10)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    user = data.get("data", {}).get("user")
    print(f"SUCCESS! User: {user.get('name') if user else 'unknown'}")
else:
    print(f"Failed: {r.text[:200]}")
