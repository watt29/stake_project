import json

TOKEN = "4e12a2d814cef367f45e84604215a0d8848dfbd1233329e5429cc8257c0bf8ff28d52035bd8bd0232f0d476293e0b179"

COOKIES = (
    "locale=en; currency_hideZeroBalances=false; currency_currencyView=crypto; fiat_number_locale=en-US; "
    "cookie_consent=false; _ga=GA1.1.1058388786.1778144553; "
    "intercom-device-id-cx1ywgf2=fad039da-9323-41da-aa73-9f42693a7324; "
    "leftSidebarView_v2=expanded; sidebarView=hidden; quick_bet_popup=false; oddsFormat=decimal; "
    "sportMarketGroupMap={}; cookie_last_vip_tab=progress; level_up_vip_flag=; "
    "intercom-id-cx1ywgf2=c41c98d7-b63b-4fd6-a75d-97224a2c33db; "
    'g_state={"i_l":0,"i_ll":1778145708828,"i_b":"TCZPeZ6dgFmas2yT+bV0NRTKzi+8YdnmHTShS/6kXhE","i_e":{"enable_itp_optimization":20},"i_et":1778145708825}; '
    'session_info={"id":"f47a3643-7081-469b-9b7c-528a08c304a0","sessionName":"Chrome (Windows PC)","ip":"184.22.71.216","country":"TH","city":"Lopburi","active":true,"updatedAt":"Thu, 07 May 2026 09:22:23 GMT","__typename":"UserSession"}; '
    "currency_currency=trx; "
    "cf_clearance=eH581ghOpcJ9fwC07Dwbg9YwFUrG54kn0s.M5rrKqEM-1778146637-1.2.1.1-.XvmoizMyXzcZyzFD5fK.UzXIN_lpR8QccC8Dv2ewWuYlzD148PyKiB335x.vMntmR2INOe3aEHMiAlYRyeD3VISPwcsgdKaHEBewtD0pd1qOuLawnpb_n9FcfBF8vtbUlq5.FwRNl39H3Y2XCry.zTdKqm.nqx8u10sB0NH1ApgPSQo9u5XUYWHAirTbKzs.UZB7ycsK_1sdtZ00Rhm.BKRk9.H2kVc7m02yMvlh4WzssTVhx5Lqkl_XGPPHksJDptJ6NJ2zB0atJRYTYskh8m6n8vfy25HYr1UNN7uKrnHGLo5OAMoHhQEOiO5qPEMztJS9HevHgt2aV2vanUc6Q; "
    "intercom-session-cx1ywgf2=N200a3d1bXR0ZlJmTXc5c2MxNStnY040UHN6UHZHM3JkMkkwTkVZd1h1ejNFNEZCbVVaT2I0TmtTVjEzbFhTdjZQN1UzeDBYVDN0WHkydStaWGxla3gvUjZUdTVsaHk3SFdqQW5DdlpUVUxjTXBnRjI2YkpsTmNEM2pnTzRJaVJ3cW9nOEFvcU9vRDkzbFR0aWNZSkR6UUhKMkg3VFlNRVVNTzdEdDVSS1oyYnY3Z3I2dUpEelBtSGJDMDNJdVdsVlFrTVM5czdiWEVHWkZFZzRRcU1oUT09LS02a3NsWER6TERxcjhSd3ZPSFpwcDJBPT0=--0cb8f15bb708d2878cd6ba15798719bf52140238; "
    "__cf_bm=FFiNAebcuZXqVxYsKvRq6qZnGDwdMpbMQ8xLICMbw4g-1778146682.5287578-1.0.1.1-X.gya_4n9veQJFNdQis6VJB7t2VXvtJqAuw0sk1csL2A5g1rrHmJn4o02khwsBPBC8hcjNQm_twaZXtNuCOtUgFCAviBUKaacemIbrgCTJsJqOm06yimAUKocYkzqS5Z; "
    "fullscreen_preference=false; "
    "_cfuvid=x9RYtPvKqcOYgMh0cTqJ3m8pIwT0ueBancGFflJGUU0-1778146699.1172054-1.0.1.1-70fx3BUMAnLhuA_VZerxyQU8Y8S_xPPb5K1LNsXVuTI; "
    "session=4e12a2d814cef367f45e84604215a0d8848dfbd1233329e5429cc8257c0bf8ff28d52035bd8bd0232f0d476293e0b179"
)

with open("config.json", "r", encoding="utf-8") as f:
    cfg = json.load(f)

cfg["stake"]["access_token"] = TOKEN
cfg["stake"]["cookies"] = COOKIES

with open("config.json", "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=4, ensure_ascii=False)

print("Updated! Testing connection...")

import re
from curl_cffi import requests as cfreq

def get_cookie(name, src):
    m = re.search(rf'(?:^|; ){re.escape(name)}=([^;]+)', src)
    return m.group(1).strip() if m else ""

session_val = get_cookie("session", COOKIES)
cf = get_cookie("cf_clearance", COOKIES)
print(f"session: {session_val[:20]}...")
print(f"cf_clearance: {cf[:30]}...")

headers = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "x-access-token": TOKEN,
    "x-language": "en",
    "origin": "https://stake.com",
    "referer": "https://stake.com/casino/games/dice",
    "dnt": "1",
}

s = cfreq.Session(impersonate="chrome110")
for part in COOKIES.split("; "):
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
