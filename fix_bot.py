import sys

file_path = r"c:\Users\Lenovo\Desktop\stake_project_3\dice_bot_utf8.py"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "def __del__(self):" in line:
        start_idx = i
        break

# find the save_daily_report
for i in range(start_idx, len(lines)):
    if "def save_daily_report" in lines[i]:
        end_idx = i
        break

new_block = """    def __del__(self):

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

        mutation = \"\"\"

        mutation RotateServerSeed {

          rotateServerSeed {

            id

            seed

          }

        }

        \"\"\"

        try:

            res = self.query(mutation)

            data = res.get("data") if res else None

            

            self.next_rotation_bet = self.get_total_bets_from_stats() + random.randint(800, 1500)

            if data and data.get("rotateServerSeed"):

                # msg = f" <b>Seed Rotated ({reason})</b>\\n Seed \\n<i>*Server Seed Reset </i>"

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

        \"\"\" Bet \"\"\"

        stats = load_stats()

        return stats.get("total_bets", 0)



"""

# Write it out
with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(lines[:start_idx])
    f.write(new_block)
    f.writelines(lines[end_idx:])

print("Fixed dice_bot_utf8.py")
