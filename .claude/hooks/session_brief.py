# Claude Code SessionStart 훅 — log.md 최근 항목을 세션 시작 컨텍스트에 넣어 준다.
#
# log.md는 최신 항목이 맨 위에 오는 역순 파일이므로, 앞에서 몇 줄만 잘라 읽으면
# 직전 세션에서 실제로 바뀐 파일을 그대로 알 수 있다.
# 헤더(`# 작업 로그`)와 마커(`<!-- worklog -->`)는 항목이 아니므로 형식에 맞는 줄만 고른다.
# 기록 자체는 PostToolUse 훅인 log_change.py 가 남긴다.
#
# stdout은 반드시 JSON이어야 한다. Windows 콘솔은 cp949라 한글을 그대로 쓰면 깨지므로
# ensure_ascii 로 이스케이프한 뒤 바이트로 내보낸다.

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG_PATH = ROOT / "log.md"
MAX_LINES = 25

ENTRY_RE = re.compile(r"^\d{6}_\d{6} : ")


def main():
    if not LOG_PATH.exists():
        return

    lines = LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()
    entries = [ln for ln in lines if ENTRY_RE.match(ln)][:MAX_LINES]
    if not entries:
        return

    body = "\n".join(entries)
    context = (
        f"[직전 작업 이력 — log.md 최근 {len(entries)}건, 최신순]\n"
        f"{body}\n\n"
        "이 저장소는 PostToolUse 훅이 파일 변경을 log.md에 자동 기록한다. "
        "위 목록은 직전 세션에서 실제로 바뀐 파일이며, 세션 밖에서 한글이나 편집기로 "
        "직접 고친 내용도 포함된다. 다만 시각은 실제 수정 시각이 아니라 훅이 발견한 시각이다. "
        f"더 거슬러 올라가려면 {LOG_PATH.name} 를 직접 읽는다."
    )

    out = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }
    sys.stdout.buffer.write(json.dumps(out).encode("utf-8"))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
