# PTZ 장치 로그의 상세 구간을 조회하는 일회성 점검 스크립트
import sqlite3

conn = sqlite3.connect(r"D:\onvifcctv\app_logs.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=== logs 2026-06-10 14:20 ~ 14:50 (PTZ/Onvif/SingleView/UriFetcher) ===")
rows = cur.execute(
    "SELECT timestamp, level, category, camera, substr(message,1,220) m FROM logs "
    "WHERE timestamp BETWEEN '2026-06-10 14:20:00' AND '2026-06-10 14:50:00' "
    "AND (category IN ('Onvif','ONVIF','PTZ','PTZThread','SingleView','UriFetcher') "
    "     OR message LIKE '%PTZ%' OR message LIKE '%ONVIF%') "
    "ORDER BY id ASC LIMIT 200"
).fetchall()
for r in rows:
    print(f"{r['timestamp']} [{r['level']}/{r['category']}] {r['camera']}: {r['m']}")

conn.close()
