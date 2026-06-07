import json
import os

def analyze_graphql(har_path):
    if not os.path.exists(har_path):
        print(f"File not found: {har_path}")
        return

    with open(har_path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"Error loading JSON: {e}")
            return

    entries = data.get('log', {}).get('entries', [])
    print(f"Total entries: {len(entries)}")
    
    found_any = False
    for entry in entries:
        url = entry.get('request', {}).get('url', '')
        if '/graphql' in url or '/_api/graphql' in url:
            post_data = entry.get('request', {}).get('postData', {})
            text = post_data.get('text', '')
            if text:
                try:
                    payload = json.loads(text)
                    if isinstance(payload, list):
                        items = payload
                    else:
                        items = [payload]
                    
                    for item in items:
                        op_name = item.get('operationName')
                        if op_name:
                            print(f"Found GraphQL Op: {op_name}")
                            # Show variables for session/balance/user related ops
                            if any(x in op_name.lower() for x in ['user', 'balance', 'session', 'dice', 'bet']):
                                print(f"Variables: {json.dumps(item.get('variables'), indent=2)}")
                                found_any = True
                except:
                    # Not a JSON payload or other issue
                    pass
    
    if not found_any:
        print("No betting mutations found in GraphQL requests.")

if __name__ == "__main__":
    analyze_graphql(r'C:\Users\Administrator\stake_click\stake.com.har')
