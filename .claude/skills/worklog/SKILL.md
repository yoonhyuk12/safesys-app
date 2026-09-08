---
name: worklog
description: log.md 작업 로그 자동 기록 장치(git status 스냅샷 기반 PostToolUse 훅 + SessionStart 브리프)를 다룰 때 연다 — 로그가 안 남거나 엉뚱하게 남을 때, 기록 형식·범위(어떤 파일을 남길지)를 바꾸고 싶을 때, 특정 작업을 손으로 추가하거나 훅을 끄고 싶을 때.
---

# 작업 로그 자동 기록 (log.md)

프로젝트 루트 `log.md`에 **바뀐 파일**이 자동으로 쌓인다. 사람이 손댈 일은 거의 없고, 형식이나 범위를 바꿀 때만 이 문서를 본다.

## 어떻게 동작하나

훅 두 개가 짝을 이룬다.

**`PostToolUse` — 기록.** 도구가 하나 실행될 때마다 `.claude/hooks/log_change.py`가 돈다.

```
도구 실행 종료 → log_change.py → git status --porcelain -uall -z 스냅샷
              → 직전 스냅샷(.log_state.json)과 비교 → 달라진 파일만
              → log.md 마커(<!-- worklog -->) 바로 아래에 한 줄
```

파일 목록을 도구 인자에서 짐작하는 게 아니라 **git이 보는 실제 작업 트리 상태**를 비교한다. 그래서 무엇으로 고쳤든 상관없이 잡힌다. 스냅샷은 경로별 `(상태문자, 수정시각 ns)`이라 같은 파일을 연달아 고쳐도 구분된다.

**`SessionStart` — 브리프.** `.claude/hooks/session_brief.py`가 `log.md` 앞부분에서 `YYMMDD_HHMMSS : ` 형식에 맞는 줄만 최대 25건 골라 세션 시작 컨텍스트로 주입한다. 헤더와 마커 줄은 걸러진다.

| 구성 요소 | 위치 |
|-----------|------|
| 기록 훅 스크립트 | `.claude/hooks/log_change.py` |
| 브리프 훅 스크립트 | `.claude/hooks/session_brief.py` |
| 훅 등록 | `.claude/settings.json` 의 `hooks.PostToolUse` / `hooks.SessionStart` |
| 로그 파일 | `log.md` (루트) |
| 직전 스냅샷 상태 | `.claude/hooks/.log_state.json` (gitignore됨) |
| 동시 쓰기 락 | `.claude/hooks/.log.lock` (gitignore됨) |

`.claude/hooks/hooks.json`과 `.claude/hooks/README.md`는 이 장치와 **무관한** 벤더 플러그인 카탈로그다. 건드리지 않는다.

## 기록 형식

```
YYMMDD_HHMMSS : 경로 수정, 경로2 추가 외 N건 — "앞부분 발췌…"
```

```
260904_181203 : docs/architecture.md 수정
260904_181255 : safesys-app/src/app/tbm/page.tsx 수정 — "const [rows, setRows] = useState<Row[]>([]);"
260904_181340 : database/20260904-1810_add_col.sql 추가, docs/database.md 수정 외 3건
```

- **역순** — 새 항목은 `<!-- worklog -->` 마커 바로 아래에 삽입되어 항상 최신이 위에 온다. 마커가 없으면 파일 맨 위에 붙고, 파일 자체가 없으면 `# 작업 로그` 헤더와 마커까지 갖춰 새로 만든다.
- 상태 라벨은 `추가` / `수정` / `삭제` / `이름변경` / `복사`.
- 파일은 프로젝트 상대경로, `MAX_FILES`(6)개까지 나열하고 나머지는 `외 N건`.
- **파일이 1건일 때만** Edit/Write/MultiEdit 입력에서 60자 발췌(`EXCERPT_LEN`)가 뒤에 붙는다. 여러 건이면 어느 파일의 내용인지 특정할 수 없어 생략한다.

## 무엇이 기록되고 무엇이 빠지나

**기록됨** — git이 추적할 수 있는 **모든** 작업 트리 변경.

- `Edit` / `Write` / `MultiEdit` / `NotebookEdit`으로 건드린 파일
- `Bash`·`PowerShell` 안의 `sed -i`, heredoc 리다이렉션, `cp`, `mv`, `rm` 등으로 생긴 변경
- MCP 도구(hwpx 등)가 쓴 파일
- **세션 밖에서 외부 편집기·한글로 직접 고친 파일**까지 — 다음 도구 실행 때 스냅샷 차이로 잡힌다

**빠짐 (의도된 것)**

- gitignore된 파일 — `node_modules/`, `.next/`, `.env.local`, 스크래치패드 등
- `log.md` 자신과 `log.md.tmp`, `.claude/hooks/.log_state.json`, `.claude/hooks/.log.lock` (`EXCLUDED` 집합, 무한 자기 기록 방지)
- **커밋되거나 원상복구되어 git status에서 사라진 항목** — 내용이 바뀐 게 아니므로 기록하지 않는다. 파일이 실제로 없어졌을 때만 `삭제`로 남는다.
- **셸 명령 자체** — 구버전의 `실행 git commit` 구획은 사라졌다. 이제 남는 것은 파일 변경뿐이다. 명령의 *결과*로 파일이 바뀌면 그 파일이 기록된다.

## 알려진 한계

- 훅이 **도구마다** 돌기 때문에 같은 파일을 연속으로 편집하면 여러 줄이 남는다. 구버전(`Stop` 훅)은 턴당 한 줄이었다.
- 시각은 실제 수정 시각이 아니라 **훅이 발견한 시각**이다.
- git 저장소가 아니면 `git status`가 실패해 아무것도 기록되지 않는다.
- 첫 실행은 기준선만 저장하고 아무것도 쓰지 않는다(기존 미커밋 변경을 통째로 쏟아내지 않기 위함).

## 자주 하는 변경

| 하고 싶은 것 | 손댈 곳 |
|--------------|---------|
| 특정 경로 로그에서 빼기 | `log_change.py` 의 `EXCLUDED` |
| 나열 파일 개수 | `log_change.py` 의 `MAX_FILES` |
| 발췌 길이 | `log_change.py` 의 `EXCERPT_LEN` |
| 한 줄 형식 자체 | `log_change.py` 의 `build_entry()` |
| 삽입 위치·헤더 | `log_change.py` 의 `prepend()`, `MARKER` |
| 세션 브리프에 넣을 항목 수 | `session_brief.py` 의 `MAX_LINES` |

변경 후에는 **반드시 파이프 테스트**로 확인한다 (아래).

## 손으로 항목 추가

훅은 사람이 한 작업(수동 배포, 외부 도구 작업 등)은 모른다. 그럴 땐 `<!-- worklog -->` 마커 바로 아래에 같은 형식으로 직접 한 줄 넣으면 된다.

```
260904_190000 : Vercel 대시보드에서 환경 변수 SUPABASE_SERVICE_ROLE_KEY 회전
```

## 훅 끄기

`.claude/settings.json`의 해당 항목(`PostToolUse` 또는 `SessionStart`)을 지운다. 한 세션만 끄려면 `.claude/settings.local.json`(gitignore됨)에 빈 배열을 둔다.

```json
{ "hooks": { "PostToolUse": [] } }
```

## 문제 해결

**로그가 전혀 안 남는다**

1. 스크립트가 도는지 파이프 테스트 — `WORKLOG_FILE`로 출력을 임시 파일로 돌려 실제 `log.md`를 건드리지 않는다.
   ```bash
   echo '{"session_id":"probe","cwd":"'"$PWD"'","hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{}}' \
     | WORKLOG_FILE="$LOCALAPPDATA/Temp/worklog-test.md" python .claude/hooks/log_change.py
   ```
   출력 경로에 `/tmp`를 쓰지 마라. 훅이 부르는 것은 Windows 파이썬이라 `/tmp`를 `C:\tmp`로 읽는데, 그 폴더가 없으면 쓰기가 조용히 실패하고(모든 예외를 삼키므로) 훅이 고장 난 것처럼 보인다.
   **첫 실행은 기준선만 저장하고 아무것도 쓰지 않는다.** `.claude/hooks/.log_state.json`이 생겼는지 확인하고, 파일을 하나 만들거나 고친 뒤 같은 명령을 **한 번 더** 돌려야 변화가 잡힌다. 시험이 끝나면 임시 출력 파일과 `.log_state.json`을 지운다(다음 실제 실행이 기준선을 다시 잡는다).
2. 훅 등록 확인 — `/hooks` 메뉴에 PostToolUse 훅이 보이는지.
3. `.claude/settings.json`을 **세션 도중에 고쳤다면** Claude Code가 아직 못 읽었을 수 있다. `/hooks`를 한 번 열거나 세션을 재시작하면 반영된다.
4. `python`이 PATH에 있는지. 훅은 `shell: bash`로 `python`을 부른다.

**같은 내용이 두 번 남는다** — `.claude/hooks/.log_state.json`이 지워졌거나 손상돼 스냅샷 기준선이 초기화된 경우다. 중복 줄을 지우면 이후로는 정상 동작한다.

**엉뚱한 파일이 남는다** — gitignore에 추가하거나, 로그에서만 빼려면 `EXCLUDED`에 경로를 넣는다.

**세션 시작 브리프가 안 뜬다** — `session_brief.py`를 직접 돌려 stdout이 유효한 JSON인지 본다. `log.md`에 `YYMMDD_HHMMSS : ` 형식 줄이 하나도 없으면 아무것도 출력하지 않는다.

## 설계 메모

- 훅은 **어떤 실패에도 exit 0**이다. 로그 기록이 작업을 막아서는 안 된다.
- 여러 훅이 동시에 `log.md`를 고쳐 쓰다 항목을 잃지 않도록 `.log.lock` 파일로 직렬화한다.
- 쓰기는 임시 파일(`log.md.tmp`) + `os.replace`로 원자적으로 갈아 끼운다. 쓰다 실패해도 기존 로그가 잘리지 않는다.
- 훅 입력은 항상 UTF-8인데 Windows의 `sys.stdin`은 cp949로 디코딩하며 대리 문자를 섞는다. 그래서 반드시 바이트로 읽어 UTF-8로 직접 디코딩한다(스크립트에 이미 반영됨). 같은 이유로 `session_brief.py`의 출력도 `ensure_ascii` 이스케이프 후 바이트로 내보낸다.
