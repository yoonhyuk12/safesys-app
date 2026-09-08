# Claude Code PostToolUse 훅 — 프로젝트 파일 변경을 log.md 맨 위에 역순으로 기록한다.
#
# 동작: git status 스냅샷을 직전 상태와 비교해 실제로 바뀐 파일만 잡아낸다.
# Edit/Write뿐 아니라 Bash(sed·heredoc·cp)나 MCP 쓰기로 생긴 변경도 함께 잡힌다.
# 기록 형식: `YYMMDD_HHMMSS : 수정내용` 한 줄, 최신 항목이 `<!-- worklog -->` 마커 바로 아래에 온다.
# 실패해도 세션을 막지 않도록 모든 예외를 삼키고 종료 코드 0으로 끝낸다.

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# 파이프 시험 때 실제 log.md를 건드리지 않도록 WORKLOG_FILE 로 출력 경로를 덮어쓸 수 있다.
LOG_PATH = Path(os.environ["WORKLOG_FILE"]) if os.environ.get("WORKLOG_FILE") else ROOT / "log.md"
STATE_PATH = Path(__file__).resolve().parent / ".log_state.json"
LOCK_PATH = Path(__file__).resolve().parent / ".log.lock"

# log.md 는 `# 작업 로그` 헤더를 갖는다. 새 항목은 이 마커 바로 아래에 끼워 넣는다.
MARKER = "<!-- worklog -->"

# 로그 자신과 훅 내부 파일은 기록 대상에서 뺀다. 무한 자기 기록을 막는다.
EXCLUDED = {"log.md", "log.md.tmp", ".claude/hooks/.log_state.json", ".claude/hooks/.log.lock"}

STATUS_LABEL = {"A": "추가", "?": "추가", "M": "수정", "D": "삭제", "R": "이름변경", "C": "복사"}

MAX_FILES = 6
EXCERPT_LEN = 60


def git_status():
    """git status --porcelain -z 를 파싱해 {경로: 상태문자} 를 돌려준다.

    -uall 을 붙여야 미추적 파일이 디렉터리 하나로 뭉뚱그려지지 않고 낱개로 잡힌다.
    """
    out = subprocess.run(
        ["git", "status", "--porcelain", "-uall", "-z"],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=20,
    ).stdout
    records = out.split(b"\x00")
    result = {}
    i = 0
    while i < len(records):
        rec = records[i]
        i += 1
        if len(rec) < 4:
            continue
        xy = rec[:2].decode("ascii", "replace")
        path = rec[3:].decode("utf-8", "replace")
        # 이름변경·복사는 다음 레코드가 원본 경로다. 건너뛴다.
        if xy[0] in ("R", "C"):
            i += 1
        code = xy[0] if xy[0] != " " else xy[1]
        result[path] = code
    return result


def mtime_ns(rel_path):
    try:
        return (ROOT / rel_path).stat().st_mtime_ns
    except OSError:
        return 0


def snapshot():
    """경로별 (상태문자, 수정시각) 스냅샷. 같은 파일을 두 번 고쳐도 시각으로 구분된다."""
    return {p: [code, mtime_ns(p)] for p, code in git_status().items() if p not in EXCLUDED}


def diff(prev, curr):
    """이전 스냅샷 대비 달라진 항목을 (경로, 라벨)로 반환한다."""
    changed = []
    for path, (code, mt) in curr.items():
        old = prev.get(path)
        if old is None:
            changed.append((path, STATUS_LABEL.get(code, "수정")))
        elif old[1] != mt:
            # 이미 알고 있던 파일이 또 바뀐 것이므로, 미추적 파일이어도 '추가'가 아니라 '수정'이다.
            # 상태문자만 달라진 것(git add 로 ?? → A 등)은 내용이 바뀐 게 아니므로 수정시각만 본다.
            changed.append((path, "삭제" if code == "D" else "수정"))
    # 스냅샷에서 사라졌는데 파일이 남아 있으면 커밋됐거나 원상복구된 것이다.
    # 둘 다 내용이 바뀐 게 아니므로 기록하지 않는다. 실제로 없어진 것만 삭제로 남긴다.
    for path in prev:
        if path not in curr and not (ROOT / path).exists():
            changed.append((path, "삭제"))
    changed.sort()
    return changed


def excerpt(payload):
    """Edit/Write 입력에서 실제로 써 넣은 문자열의 앞부분을 뽑는다."""
    tool = payload.get("tool_name", "")
    ti = payload.get("tool_input") or {}
    text = ""
    if tool == "Edit":
        text = ti.get("new_string") or ""
    elif tool == "Write":
        text = ti.get("content") or ""
    elif tool == "MultiEdit":
        edits = ti.get("edits") or []
        if edits:
            text = edits[0].get("new_string") or ""
    text = " ".join(text.split())
    if not text:
        return ""
    if len(text) > EXCERPT_LEN:
        text = text[:EXCERPT_LEN] + "…"
    return text


def build_entry(changed, payload):
    parts = [f"{path} {label}" for path, label in changed[:MAX_FILES]]
    line = ", ".join(parts)
    if len(changed) > MAX_FILES:
        line += f" 외 {len(changed) - MAX_FILES}건"
    if len(changed) == 1:
        text = excerpt(payload)
        if text:
            line += f' — "{text}"'
    return line


def acquire_lock():
    """동시에 여러 훅이 log.md를 고쳐 쓰다 항목을 잃는 것을 막는다."""
    for _ in range(40):
        try:
            fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            return True
        except FileExistsError:
            time.sleep(0.05)
    return False


def release_lock():
    try:
        LOCK_PATH.unlink()
    except OSError:
        pass


def prepend(entry):
    """임시 파일에 다 쓴 뒤 갈아 끼운다. 쓰다 실패해도 기존 로그가 잘리지 않는다."""
    if not LOG_PATH.exists():
        # 로그가 없으면 헤더와 마커까지 갖춰 새로 만든다.
        new_text = f"# 작업 로그\n\n{MARKER}\n{entry}\n"
    else:
        old = LOG_PATH.read_text(encoding="utf-8", errors="replace")
        index = old.find(MARKER)
        if index == -1:
            # 마커가 없으면 예전처럼 파일 맨 위에 붙인다.
            new_text = entry + "\n" + old
        else:
            # 마커 바로 다음 줄에 끼워 넣는다. 마커 뒤 개행 하나는 소비해 빈 줄이 생기지 않게.
            cut = index + len(MARKER)
            head = old[:cut]
            tail = re.sub(r"^\r?\n", "", old[cut:])
            new_text = f"{head}\n{entry}\n{tail}"

    tmp = LOG_PATH.with_suffix(".md.tmp")
    tmp.write_text(new_text, encoding="utf-8", errors="replace")
    os.replace(str(tmp), str(LOG_PATH))


def main():
    # 훅 입력은 항상 UTF-8이다. Windows에서 sys.stdin은 cp949로 디코딩하며 대리 문자를
    # 섞어 넣으므로, 반드시 바이트로 읽어 UTF-8로 직접 디코딩한다.
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace") or "{}")
    except Exception:
        payload = {}

    locked = acquire_lock()
    try:
        curr = snapshot()
        try:
            prev = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            prev = None

        STATE_PATH.write_text(json.dumps(curr, ensure_ascii=False), encoding="utf-8")

        # 첫 실행은 기준선만 저장한다. 기존 미커밋 변경을 통째로 쏟아내지 않기 위함이다.
        if prev is None:
            return

        changed = diff(prev, curr)
        if not changed:
            return

        stamp = datetime.now().strftime("%y%m%d_%H%M%S")
        prepend(f"{stamp} : {build_entry(changed, payload)}")
    finally:
        if locked:
            release_lock()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
