# 애플리케이션 시작 로그를 조회하는 일회성 점검 스크립트
import sqlite3

conn = sqlite3.connect(r"D:\onvifcctv\app_logs.db")
rows = conn.execute(
    "SELECT timestamp, level, category, substr(message,1,90) FROM logs "
    "ORDER BY id DESC LIMIT 12"
).fetchall()
for r in rows[::-1]:
    print(r)
conn.close()
