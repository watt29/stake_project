import requests
import json
import csv
from datetime import datetime

def fetch_all_deposits(token, cookies):
    url = "https://stake.com/_api/graphql"
    headers = {
        "x-access-token": token,
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
    }
    
    query = """
    query DepositList($limit: Int, $offset: Int) {
      user {
        depositList(limit: $limit, offset: $offset) {
          id
          amount
          currency
          createdAt
          status
        }
      }
    }
    """
    
    cookie_dict = {}
    for c in cookies.split("; "):
        if "=" in c:
            k, v = c.split("=", 1)
            cookie_dict[k] = v
            
    all_deposits = []
    limit = 50
    offset = 0
    
    print(" [SYSTEM] Fetching full deposit history for accounting...")
    
    while True:
        try:
            resp = requests.post(url, json={"query": query, "variables": {"limit": limit, "offset": offset}}, headers=headers, cookies=cookie_dict)
            data = resp.json()
            deposits = data.get("data", {}).get("user", {}).get("depositList", [])
            
            if not deposits:
                break
                
            all_deposits.extend(deposits)
            offset += limit
            if len(deposits) < limit:
                break
        except Exception as e:
            print(f"Error during fetch: {e}")
            break

    # Save to CSV
    filename = "company_deposits_report.csv"
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["ID", "Amount", "Currency", "Date (GMT)", "Status"])
        for d in all_deposits:
            writer.writerow([d['id'], d['amount'], d['currency'], d['createdAt'], d['status']])
    
    print(f" [SUCCESS] Exported {len(all_deposits)} records to {filename}")

if __name__ == "__main__":
    TOKEN = "b93d9b7f507cb00d8ed3be58440879e295b2f9353eba3d6b5bd006e2a710760f43be69c71984d7596648f7b41507934f"
    COOKIES = (
        "session=b93d9b7f507cb00d8ed3be58440879e295b2f9353eba3d6b5bd006e2a710760f43be69c71984d7596648f7b41507934f; "
        "cf_clearance=2Kh6gGfX.mZbeCoEDjP2ukTjQ7Z4WNzOLjjBDT2tiGE-1778108972-1.2.1.1-RnHFO8Yh_UrnBqrvRI.eBKV6RPFJmcAO9j7nc.xSM05_Q9LGxGto4N7J5ndAHy1F6IoZWrDQ8Ep_myiGVpY1j5DMQozhydWtmCF4T3_KJ5ps5Msuz_DyugdI262K_uIGrW7_RPpfJfkIMSak7yQNNxgeX2R4nhdMvkYq9dqDPrkNDB2oR964Yrd7HLzSvnDNoa4Q.N5fsOlGP9_eaWCiWbS.TgLECHQ8rrsAotDmN42045wMPAGhI0A7h8apyG8OYNqZHGv65dt60PJjFNd6EOKQK_YpYBZvpbIZSfghC2bIVulzkEwliCOUsAHzK.8dtUHgTpkF82WsPRS0VebkBx6mwGQ9jSlNgzENh_eYH0prMr7U.PAaTo_upX2lV0S5p0DTeqK9Lr3SX91NUn5.mFdbD6flwiSfIW12HTG2a5g; "
        "__cf_bm=STfPyQPGXcA70X4Mn_DOcMH5yDRGo5m2PBgCmQxQYPw-1778109025.8165693-1.0.1.1-5Ow5_s3o.Ujnb.5M8BOSkL3IB08Xfaj9Di4Qsj6Tj6R0uoLtcgtgS3veLUfh0_cNaNQZgsej41ikSaoYg9ObfIZNsT9NYk1feqeW8n3cYGTm_b.eYc.MSjaixQwuXyjK; "
        "_cfuvid=BggVZvdnL2f0lIv5Cnhg5WuSCpJDMWm_yx0o2vEbru8-1778109025.8165693-1.0.1.1-VzYzhK.O0zkk6roHBiEo_8zpVyiwdMf5ptasClGL6mo; "
        "locale=en; currency_currency=trx"
    )
    fetch_all_deposits(TOKEN, COOKIES)
