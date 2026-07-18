# PTZ 장치 로그를 조회하는 일회성 점검 스크립트
import sqlite3

conn = sqlite3.connect(r"D:\onvifcctv\app_logs.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

patterns = [
    ("%Command ignored%", "PTZ ignored (no thread)"),
    ("%falling back to stored RTSP URI%", "ONVIF fail -> RTSP fallback"),
    ("%Blocked stale%", "stale command blocked"),
    ("%PTZ Retry failed%", "PTZ auth retry failed"),
    ("%PTZ Move timed out%", "PTZ move timeout"),
    ("%PTZ Move failed%", "PTZ move failed"),
    ("%PTZ Stop failed%", "PTZ stop failed"),
    ("%No PTZ%", "No PTZ status"),
    ("%PTZ Auth failed%", "PTZ auth failed"),
    ("%Controller cache invalidated%", "controller cache invalidated"),
]

print("=== counts (all time) ===")
for pat, label in patterns:
    row = cur.execute(
        "SELECT COUNT(*) c, MAX(timestamp) latest FROM logs WHERE message LIKE ?",
        (pat,),
    ).fetchone()
    print(f"{label}: count={row['c']}, latest={row['latest']}")

print()
print("=== recent samples per pattern ===")
for pat, label in patterns:
    rows = cur.execute(
        "SELECT timestamp, level, camera, substr(message,1,200) m FROM logs "
        "WHERE message LIKE ? ORDER BY id DESC LIMIT 5",
        (pat,),
    ).fetchall()
    if rows:
        print(f"-- {label} --")
        for r in rows:
            print(f"  {r['timestamp']} [{r['level']}] {r['camera']}: {r['m']}")

conn.close()
