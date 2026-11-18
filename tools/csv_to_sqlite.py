#!/usr/bin/env python3
# tools/csv_to_sqlite.py — นำเข้าสรุปรอบ/เซสชันจาก CSV ลง SQLite เพื่อสะสมประวัติ
#
# สคีมานี้อ้างจากข้อมูลที่บอททั้งสองผลิตได้จริง:
#   stake_extension (graphql) -> title: STAKE_DONE|R=WIN|P=0.42130|S=1|B=137 :: [mem=.. dom=..]
#   stake_simple_ext (web)    -> ไม่มีที่เก็บถาวร (ใช้ค่า P/L จากแผง/HUD เท่านั้น)
#
# ใช้:
#   python tools/csv_to_sqlite.py --csv data/sessions.csv --db data/bot_sessions.sqlite
#   python tools/csv_to_sqlite.py --csv data/sessions.csv --stats
#
# คอลัมน์ที่รองรับ (ขาดได้ ไม่พัง):
#   timestamp, profile, mode, result, pnl, step, bets, mem, dom, duration_sec, note
#   • แถวซ้ำ (timestamp + profile + mode) จะถูกข้ามอัตโนมัติ (UNIQUE)

import argparse
import csv
import os
import sqlite3
import sys

# คอนโซล Windows (cp874) พิมพ์ภาษาไทย/emoji ไม่ได้ → บังคับ UTF-8 กัน UnicodeEncodeError
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_CSV = os.path.join("data", "sessions.csv")
DEFAULT_DB = os.path.join("data", "bot_sessions.sqlite")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT    NOT NULL,
    profile      TEXT    NOT NULL DEFAULT '',
    mode         TEXT    NOT NULL DEFAULT '',
    result       TEXT    NOT NULL DEFAULT '',
    pnl          REAL    NOT NULL DEFAULT 0,
    step         INTEGER,
    bets         INTEGER,
    mem          REAL,
    dom          REAL,
    duration_sec INTEGER,
    note         TEXT,
    UNIQUE (ts, profile, mode)
);
CREATE INDEX IF NOT EXISTS idx_sessions_result ON sessions(result);
CREATE INDEX IF NOT EXISTS idx_sessions_ts     ON sessions(ts);
"""


def to_num(value, cast=float):
    if value is None:
        return None
    s = str(value).strip().replace(",", "")
    if s == "":
        return None
    try:
        return cast(float(s))
    except ValueError:
        return None


def read_rows(path):
    # utf-8-sig รองรับ BOM (ไฟล์ที่ PowerShell เขียนด้วย -Encoding UTF8 ของ PS 5.1 จะมี BOM)
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            yield i, { (k or "").strip().lower(): (v if v is not None else "") for k, v in row.items() }


def import_csv(csv_path, db_path):
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)

    inserted = 0
    skipped = 0
    bad = 0

    for line_no, row in read_rows(csv_path):
        ts = str(row.get("timestamp", "")).strip()
        if not ts:
            bad += 1
            print(f"⚠️  บรรทัด {line_no}: ไม่มี timestamp — ข้าม", file=sys.stderr)
            continue

        params = (
            ts,
            str(row.get("profile", "")).strip(),
            str(row.get("mode", "")).strip(),
            str(row.get("result", "")).strip().upper(),
            to_num(row.get("pnl"), float) or 0.0,
            to_num(row.get("step"), int),
            to_num(row.get("bets"), int),
            to_num(row.get("mem"), float),
            to_num(row.get("dom"), float),
            to_num(row.get("duration_sec"), int),
            str(row.get("note", "")).strip(),
        )
        before = conn.total_changes
        conn.execute(
            """INSERT OR IGNORE INTO sessions
               (ts, profile, mode, result, pnl, step, bets, mem, dom, duration_sec, note)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            params,
        )
        if conn.total_changes > before:
            inserted += 1
        else:
            skipped += 1

    conn.commit()
    return conn, inserted, skipped, bad


def print_stats(conn):
    cur = conn.cursor()
    total = cur.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    if not total:
        print("ℹ️  ยังไม่มีข้อมูลในฐาน")
        return

    total_pnl = cur.execute("SELECT COALESCE(SUM(pnl),0) FROM sessions").fetchone()[0]
    avg_pnl = cur.execute("SELECT COALESCE(AVG(pnl),0) FROM sessions").fetchone()[0]
    best = cur.execute("SELECT COALESCE(MAX(pnl),0) FROM sessions").fetchone()[0]
    worst = cur.execute("SELECT COALESCE(MIN(pnl),0) FROM sessions").fetchone()[0]

    print("=" * 58)
    print(f"รอบทั้งหมด : {total}")
    print(f"P/L รวม    : {total_pnl:+.5f}")
    print(f"P/L เฉลี่ย : {avg_pnl:+.5f}")
    print(f"ดีสุด/แย่สุด: {best:+.5f} / {worst:+.5f}")
    print("-" * 58)
    print(f"{'result':<14}{' rounds':>8}{' P/L รวม':>16}")
    for result, n, s in cur.execute(
        "SELECT result, COUNT(*), COALESCE(SUM(pnl),0) FROM sessions GROUP BY result ORDER BY COUNT(*) DESC"
    ):
        print(f"{result or '(blank)':<14}{n:>8}{s:>+16.5f}")
    print("=" * 58)


def main():
    ap = argparse.ArgumentParser(description="นำเข้า CSV สรุปเซสชันลง SQLite")
    ap.add_argument("--csv", default=DEFAULT_CSV, help=f"ไฟล์ CSV (ค่าเริ่มต้น {DEFAULT_CSV})")
    ap.add_argument("--db", default=DEFAULT_DB, help=f"ไฟล์ SQLite (ค่าเริ่มต้น {DEFAULT_DB})")
    ap.add_argument("--stats", action="store_true", help="แสดงสรุปหลังนำเข้า")
    ap.add_argument("--stats-only", action="store_true", help="ดูสรุปโดยไม่ต้องมี CSV")
    args = ap.parse_args()

    if args.stats_only:
        conn = sqlite3.connect(args.db)
        print_stats(conn)
        conn.close()
        return 0

    if not os.path.exists(args.csv):
        print(f"❌ ไม่พบไฟล์ CSV: {args.csv}", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(args.db) or ".", exist_ok=True)
    conn, inserted, skipped, bad = import_csv(args.csv, args.db)
    print(f"✅ นำเข้าใหม่ {inserted} แถว · ข้าม (ซ้ำ) {skipped} · ผิดรูป {bad} → {args.db}")
    if args.stats:
        print_stats(conn)
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
