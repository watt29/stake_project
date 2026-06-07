import json
import os

raw_text = """_cf_bm	76yQPg_JDjJ5IXBO_UYYhf79E5hbCSQjiaZlR1aDCXw-1780816924.424199-1.0.1.1-pTSii3i9q_GiB9HcAWGd7k3vd2fHDUNsIgQNV.aOPLauSHW7xBrE92flkE3RfZmdP0UdUU9PFRoBApfUSA6SkQRXC6yZRLEgLjmKf9XK2cOwEJb1bSGORCRb3tIqZ1rW	.stake.com	/	2026-06-07T07:52:04.994Z	205	✓	✓	None			Medium
__cfwaitingroom_stake_com	Chg4c2hsdFpibnIzWVJBUi82dUtrMWVnPT0SgAJqVm9Sc29rYzlpREljV1hZZHpsS21Tdjl5REhJWUdGMXczZTRtZDlabEhEeDVGdzZzRG1QTFdMVytNeGhYdm56T1RUdnFlbGgwKzh1REc5djh1YVNBcnBXbnZneXNabWorTlhCTFNMdU5PcDFZcGpKa2JuQ2xxVUJXcHRmNDFTMzliTVpIZjc1WStyNnVVTjZvTkozOTBwWTFteDBjcmI0bGZKVUpDeXEvbVVpT2NGU0l1VU15eHZwNGovZi8yTnZvNkoyZEcwU2JUb0w2ZGtqYlJVd1J3TnRqT1RyZzlVL2NNa21BVUsxZTlHOWpsU0dLbGNOZi8vQktKNHNoWVRa	.stake.com	/	2026-06-07T07:47:04.994Z	405	✓	✓	None	https://stake.com		Medium
_cfuvid	Oxvbgqaz3ZR6KVZXIyXNxQxn8mPGgZWvbtKq82a6H74-1780816924.424199-1.0.1.1-hnXV.FrCxbkhbOzKmElVvTXgy4Ivg050mmtNHUlSpwc	.stake.com	/	Session	120	✓	✓	None			Medium
_dd_s	aid=ce6f7c6f-50cd-4121-8417-704ce6e679af&logs=1&id=2f3e5535-c9d2-4a59-9e6e-341b1d042324&created=1780816891728&expire=1780817814160&rum=0	stake.com	/	2026-06-07T07:37:04.000Z	141			Strict			Medium
_ga	GA1.1.1970961058.1779361976	.stake.com	/	2027-07-12T07:21:36.448Z	30						Medium
_ga_TWGX3QNXGG	GS2.1.s1780816868$o28$g1$t1780816925$j3$l0$h712048138	.stake.com	/	2027-07-12T07:22:05.036Z	67						Medium
cf_clearance	ZZ6Te8UZY3Yp5WMSTK7TQdxoBKOMGA9LL8NX5ZZA7B4-1780816865-1.2.1.1-xn3jJ.MnR0wIksOyPjWllNHIm8e2rSMaKwfiCdejR5cr_EqJr16tbByanhPJnzPgG4lEHwHfiZ9sjGQOmSNstK9hpMgvcyC9cTbzEfg03RKGhvVf7Me39nDayIurVVTmNQ530A7ajZKHSJB9HbPEQ8lA4cUiHdhRbvU9jZ2.ifMv2dqb3zWkHbP33taYraYQOGJqj.fpt9mfCxa0Cm5zSpBGeZx3SbpzeyxCXqODqFajS4hPtEN4sDicuYz9S3RmGVbNzmK5_grkrsIoxWZ1Wm2ymiIuH.uhJzOt0j2sxle4NqQvQz8yXfCUAkRb0P1cEMC1Gfsps0Ye3cejpTEXfw	.stake.com	/	2027-06-07T07:21:06.103Z	417	✓	✓	None	https://stake.com		Medium
cookie_consent	true	stake.com	/	2027-07-12T07:22:06.927Z	18			Lax			Medium
cookie_last_vip_tab	progress	stake.com	/	2027-07-12T07:22:06.923Z	27			Lax			Medium
currency_currency	trx	stake.com	/	2027-07-12T07:22:06.736Z	20			Lax			Medium
currency_currencyView	crypto	stake.com	/	2027-07-12T07:22:06.736Z	27			Lax			Medium
currency_hideZeroBalances	false	stake.com	/	2027-07-12T07:22:06.736Z	30			Lax			Medium
fiat_number_locale	en-US	stake.com	/	2027-07-12T07:22:06.801Z	23			Lax			Medium
fp_token_7c6a6574-f011-4c9a-abdd-9894a102ccef	+/ZqjW04M7ESxOMpNAdfEa5oDY2WZnfmcE/ae+qgBG4=	stake.com	/	2027-05-31T07:30:57.336Z	89	✓	✓	None	https://stake.com		Medium
fullscreen_preference	false	stake.com	/	2027-07-12T07:21:56.869Z	26			Lax			Medium
g_state	{"i_l":0,"i_ll":1780816898403,"i_e":{"enable_itp_optimization":0},"i_et":1780816894691}	stake.com	/	2026-12-04T07:21:43.000Z	94						Medium
intercom-device-id-cx1ywgf2	d84c8a75-0b03-454d-b36b-b82ccdc123b8	.stake.com	/	2027-03-04T07:55:05.000Z	63			Lax			Medium
intercom-id-cx1ywgf2	cfdda132-a5a3-4bfc-9985-595b700fdf27	.stake.com	/	2027-03-04T07:54:56.000Z	56			Lax			Medium
intercom-session-cx1ywgf2	cVV3TzNRN3FHa0FZcEUzeWg5c0hmWDhackxwN1ppSHd3eWVMa3l5YTRMT3BSR3NNRzRHUStJQkthSFZDVEdZbWcvUHpBN0tRVjlJc3BNaDU4Z3orTGxzbkNHQWFBM000TUs3b1JBTkpiQmFDdUc2b1FHejFrNXJ6dnB3MFArYjlaNXNzSW1CRnJhejhOamk0RGoyRHdsUHRjWTBZYS9WSTZjS0E1Tmpka1EyM2Q5TC9URUsweXpSSzIzdTFIMWdwTys3ZGdkZjZEaWcxTGdMZVhCajFtZz09LS1jVHJkdDQ4Sk9Mcjg2ZE96Mm9NR0R3PT0=--aaa4a7a5fc2946a36b3e5c543d27c50c01342f88	.stake.com	/	2026-06-14T07:21:45.000Z	391			Lax			Medium
leftSidebarView_v2	expanded	stake.com	/	2027-07-12T07:22:06.797Z	26			Lax			Medium
level_up_vip_flag		stake.com	/	2027-07-12T07:22:06.926Z	17			Lax			Medium
locale	en	stake.com	/	2027-07-12T07:22:06.158Z	8			Lax			Medium
mp_e29e8d653fb046aa5a7d7b151ecf6f99_mixpanel	%7B%22distinct_id%22%3A%22%24device%3A61139b77-c6cf-45e4-8213-e9ebea37b49f%22%2C%22%24device_id%22%3A%2261139b77-c6cf-45e4-8213-e9ebea37b49f%22%2C%22%24initial_referrer%22%3A%22https%3A%2F%2Fstake.com%2F%3Fmodal%3Dlogout%22%2C%22%24initial_referring_domain%22%3A%22stake.com%22%2C%22__mps%22%3A%7B%7D%2C%22__mpso%22%3A%7B%7D%2C%22__mpus%22%3A%7B%7D%2C%22__mpa%22%3A%7B%7D%2C%22__mpu%22%3A%7B%7D%2C%22__mpr%22%3A%5B%5D%2C%22__mpap%22%3A%5B%5D%2C%22__alias%22%3A%225245467b-5bac-42e6-aa8e-94d0b1ae94a4%22%2C%22%24user_id%22%3A%225245467b-5bac-42e6-aa8e-94d0b1ae94a4%22%7D	.stake.com	/	2027-06-07T07:21:45.000Z	613						Medium
oddsFormat	decimal	stake.com	/	2027-07-12T07:22:06.802Z	17			Lax			Medium
quick_bet_popup	false	stake.com	/	2027-07-12T07:22:06.802Z	20			Lax			Medium
session	03265bd28e006a622f924c4f58b12649d44fcadaf7ec9756c54df4633b349fae3af1993bbab7c19dbb78eaece02756ba	stake.com	/	2027-07-12T07:22:07.005Z	103		✓	Lax			Medium
session_info	{"id":"90842704-d7ab-4048-a5c4-d0ba5d7b483a","sessionName":"Chrome (Windows PC)","ip":"184.22.148.100","country":"TH","city":"Phrom Buri","active":true,"updatedAt":"Sun, 07 Jun 2026 07:21:43 GMT"}	stake.com	/	2027-07-12T07:22:06.925Z	208			Lax			Medium
sidebarView	hidden	stake.com	/	2027-07-12T07:22:06.798Z	17			Lax			Medium
sportMarketGroupMap	{}	stake.com	/	2027-07-12T07:22:06.801Z	21			Lax			Medium
__cfwaitingroom_stake_com	ChhSNkVSVjJxOGE1SEY0T0VVSTkwSUFBPT0SgAIrR1BRdVpwcXBXTVRHdHdiTUhrTWp0UVVHSyt2d2NoMWRBMzUwZTArbUtXRlE2M29MdUphd0xSSGN1UUdON3Zqc1J2ZHlLL21zcCtKbGVvSkdOQStDWCtPSmJRR1JHNm8yTzVjV0Y2Y3ZjQUNyM1FtRmVyOXlGSDJxRFFEM2NXRFV6UGljcTlLekllTDNwOTFid2ZVaG81allRcXZmRVJvelJudmhFeDB3aUtBU0xCTGpBQlk3Y2podkFxUHlLcGJIUlM4MHViUWZ3T096b3hCTFBrcm1SMWJRY1NNNUJYRXljMGZnckRkY1NWTTJyckxCc2R3N2NHeGJ5T2FzR3ZE	stake.com	/	Session	517	✓	✓	None	https://stake.com		Medium"""

lines = raw_text.strip().split('\n')
cookie_dict = {}
for line in lines:
    parts = line.split('\t')
    if len(parts) >= 2:
        cookie_dict[parts[0]] = parts[1]

cookie_str = "; ".join([f"{k}={v}" for k, v in cookie_dict.items()])

config_path = r'c:\Users\Lenovo\Desktop\stake_project_3\config.json'
with open(config_path, 'r', encoding='utf-8-sig') as f:
    config = json.load(f)

if "session" in cookie_dict:
    config["stake"]["access_token"] = cookie_dict["session"]

config["stake"]["cookies"] = cookie_str
# Also update the root cookies field if it exists
if "cookies" in config:
    config["cookies"] = cookie_str

with open(config_path, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=4)

print("Updated config.json successfully!")
