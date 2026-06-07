import json

raw = """__cf_bm	DuPHDMJCKJwPHRC7oYcOLTIODbLJp2.2jJVv8gaaQmE-1780266456.4307985-1.0.1.1-MAyWgfmhQ3qH_lky5dXVaCWFTUjCSYb66cGDWXBWsKiETMJr_epy0oPP3vXGFbaa0H1AXe7Jp6XS0Q410NTwG96nOK8Ej_MKX33RVa1rqcDp1cO7QZCQ4LuhuSY9g73F	.stake.com	/	2026-05-31T22:57:36.647Z	206	?	?	None			Medium
__cfwaitingroom_stake_com	ChhrYmpkK0Nsa3hNN01mb2NvcitxZkt3PT0SgAJlSGhVTTBiNnVXM1lHRTdOTUpFK1VjTnZVT210VUlNcFJTOEx6QnZUY3BIK1hEaVJvNzh2QUhzK3lXVEhzT0hTOWRDZDNPREVuU2lnK052c0RPd3FSTnY2aTZ5UndId2RWZmVQWmRlQ3NjRHdlUFJKbW5tb1FkMFA2MFBhQjNqbFJMb1JnV1RlWXc0N0VpTnR5M0c5YXllN0JCUjYxeHBWZHRQdXdaVlJYR0VDTjhRUjF1QllzcHFxeWpCNlFSNURqeFVwRGY4N1gzYW9OSnFqRDdFU000YXhZTmw0eFpzS05iZ09yM3liNnpTaEdFNFR4bWcyZUJtV2hMM0tya1N3	.stake.com	/	2026-05-31T22:53:28.827Z	405	?	?	None	https://stake.com		Medium
_cfuvid	LKvcddI_05WIsZONmr2QW6AiDo1oq.onXWZGhr8EV34-1780266456.4307985-1.0.1.1-IOd6zihwgRsV936wWKU9tAjH0GzvCYh_YbADtcehTeA	.stake.com	/	Session	121	?	?	None			Medium
_dd_s	aid=db431167-659a-4c61-ba37-6f2be8404b82&logs=1&id=b1d9b64e-3873-428f-a12c-6becc922f402&created=1780266396913&expire=1780267385722&rum=0	stake.com	/	2027-05-31T22:28:27.000Z	141			Strict			Medium
_ga	GA1.1.1100060700.1780114834	.stake.com	/	2027-07-05T22:26:37.503Z	30						Medium
_ga_TWGX3QNXGG	GS2.1.s1780266388$o3$g1$t1780266507$j60$l0$h888149593	.stake.com	/	2027-07-05T22:28:27.997Z	67						Medium
cf_clearance	1ZRv1HPmNTCZMQolYU3VnWyxDsy.otXuZB4d7ZbSny4-1780266386-1.2.1.1-nPFG69p.IXXrIYxtB6bW5rZy09jV_J1pcGl7JVKqO0bvWUvE1YIW_Mb_oIBpjZZ.bihMD.9w670mWLHIXs54L5HkGwIC3Dd.zxQ3772cn4tu9uQeVJqN1EIEYKyXpoHUqJUEaCCKWidVLzyRjNTd9Ssao2iW8b9gWflEaIglkuF1nzp9cwxOnDXjWg.VAHNyWJSVQe43Kq18E3j.0haov_huXQy4bhDd69TENdkfn6EmwjIrVyHDqHJn.QSaxa1QoLlQ4_bAkpGkNm.i9G.lltri45wsVhvHtolXB2T7orie86odhOOKzlTAUK6PHhDIZ25QyRfn_bZPUwokonUv6pLoGQzlsgS8AZVah.fdKwpKaFk3zLU1btE5dewONRQNdhNe5VNhVroJK1R9XOg.W_aYQik32EcngQukTlWK7Ug	.stake.com	/	2027-05-31T22:26:26.082Z	502	?	?	None	https://stake.com		Medium
cookie_consent	false	stake.com	/	2027-07-05T22:28:29.711Z	19			Lax			Medium
cookie_last_vip_tab	progress	stake.com	/	2027-07-05T22:28:29.695Z	27			Lax			Medium
currency_currency	trx	stake.com	/	2027-07-05T22:28:29.495Z	20			Lax			Medium
currency_currencyView	crypto	stake.com	/	2027-07-05T22:28:29.496Z	27			Lax			Medium
currency_hideZeroBalances	false	stake.com	/	2027-07-05T22:28:29.496Z	30			Lax			Medium
fiat_number_locale	en-US	stake.com	/	2027-07-05T22:28:29.585Z	23			Lax			Medium
g_state	{"i_l":0,"i_ll":1780266398706,"i_e":{"enable_itp_optimization":0},"i_et":1780266398703}	stake.com	/	2026-11-27T22:27:05.000Z	94						Medium
intercom-device-id-cx1ywgf2	7f6d6a89-eb0a-4dfb-8a30-8cc41d628c93	.stake.com	/	2027-02-25T23:00:26.000Z	63			Lax			Medium
intercom-id-cx1ywgf2	f3316565-6c0e-4e42-9616-5274e9400033	.stake.com	/	2027-02-25T22:59:57.000Z	56			Lax			Medium
intercom-session-cx1ywgf2	c1EyQkZvVG9uK1NIM2VOdEptTGlpdE5uRG10RG91RGI1a1lyTlVwcEtHRGMzbXg5UkJIRlVUZ2xKcjNHM2llY1dZMW92bmVlaU9majFDZHN3MURNaGdwMDNFd1FIRnpJdldMMWtUTkFkM2NaL3FXZk9GMmMzRTlJVm5TMkpCcStZaXk2Z05TN1VrcXJ2TXcrZ2x6TXlDOC9iVzZOcFlxRG1lQ2NXdXNZSkk2NSt3eVN4VkxBMVRSNHdtYnN2NFBPUjErZm9Ld2s1b0VJeW1pQk9rMnhhMUE9PS0tOWRWQm82ZkwvNjQrZkFUU3N2UXlKdz09LS1kN2I0MTNmNzQ4YzUwOWQyNzBjNjE0NzhkMmUwNmZmNjRmNWFiMTNm	.stake.com	/	2026-06-07T22:27:06.000Z	391			Lax			Medium
leftSidebarView_v2	expanded	stake.com	/	2027-07-05T22:28:29.578Z	26			Lax			Medium
level_up_vip_flag		stake.com	/	2027-07-05T22:28:29.710Z	17			Lax			Medium
locale	en	stake.com	/	2027-07-05T22:28:28.626Z	8			Lax			Medium
mp_e29e8d653fb046aa5a7d7b151ecf6f99_mixpanel	%7B%22distinct_id%22%3A%22%24device%3Aab21f5d6-5870-42fc-885b-329769ae4825%22%2C%22%24device_id%22%3A%22ab21f5d6-5870-42fc-885b-329769ae4825%22%2C%22%24initial_referrer%22%3A%22https%3A%2F%2Fstake.com%2F%3Fmodal%3Dlogout%22%2C%22%24initial_referring_domain%22%3A%22stake.com%22%2C%22__mps%22%3A%7B%7D%2C%22__mpso%22%3A%7B%7D%2C%22__mpus%22%3A%7B%7D%2C%22__mpa%22%3A%7B%7D%2C%22__mpu%22%3A%7B%7D%2C%22__mpr%22%3A%5B%5D%2C%22__mpap%22%3A%5B%5D%2C%22__alias%22%3A%225245467b-5bac-42e6-aa8e-94d0b1ae94a4%22%2C%22%24user_id%22%3A%225245467b-5bac-42e6-aa8e-94d0b1ae94a4%22%7D	.stake.com	/	2027-05-31T22:28:30.000Z	613						Medium
oddsFormat	decimal	stake.com	/	2027-07-05T22:28:29.588Z	17			Lax			Medium
quick_bet_popup	false	stake.com	/	2027-07-05T22:28:29.587Z	20			Lax			Medium
session	cb6a83dacee0517ef5ced9ddc47b34223fdb50e61b249c5b5cbda03bb0b4ab346183d62bb7b99e8cd59d1c065f9c6f7a	stake.com	/	2027-07-05T22:28:29.956Z	103		?	Lax			Medium
session_info	{"id":"f79519d2-4a9e-48c3-94bd-7e4e6731c043","sessionName":"Chrome (Windows PC)","ip":"45.144.167.29","country":"TH","city":"Sai Noi","active":true,"updatedAt":"Sun, 31 May 2026 22:27:05 GMT"}	stake.com	/	2027-07-05T22:28:29.707Z	204			Lax			Medium
sidebarView	hidden	stake.com	/	2027-07-05T22:28:29.579Z	17			Lax			Medium
sportMarketGroupMap	{}	stake.com	/	2027-07-05T22:28:29.586Z	21			Lax			Medium
__cfwaitingroom_stake_com	ChhmWGJobHoxZWVvK1oyU1d1QzVEeG5nPT0SgAJRMG1WdHJkOVJqYjdXM2E0VzdYWVp6RHFtN2s0WThhd1VOVFY1bUVDWkJPWWE4WWhxSGdHUzhLVHIyZzBhZE9xSUhxNUorMjNxc3JJYU5YTnN2RXRMT0EwT0t2N0xiQkJEUG02NmNKWDJQZXRjOStWRDlQZFhMdFBmQnN2aFBHeXorYU5QNlJJWTlLRzdQNDN0L1Y1eWYxWlZCOHdmeHpGQlkyaUlHUDViSHhxdFJld0lLZk9HWTY0a3A1RzI5aDJSSE5IZDRzcFpRd3kyNVZWdUF0eXMveDlqWVNMVnluSmVVdHA1ZnI4M2RtbXRMVitYa25nRHNHYnBDaTJMSHVp	stake.com	/	Session	517	?	?	None	https://stake.com		Me"""

cookies = []
for line in raw.split('\n'):
    parts = line.split('\t')
    if len(parts) >= 2:
        k, v = parts[0], parts[1]
        cookies.append(f"{k}={v}")

cookie_string = "; ".join(cookies)

with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

config['cookies'] = cookie_string

with open('config.json', 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=4)

print("Cookie updated successfully in config.json")
