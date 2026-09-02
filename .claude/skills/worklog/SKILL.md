---
name: worklog
description: log.md 작업 로그 자동 기록 장치를 다룰 때 연다 — 로그가 안 남거나 엉뚱하게 남을 때, 기록 형식·범위(어떤 파일·명령을 남길지)를 바꾸고 싶을 때, 특정 작업을 손으로 추가하거나 훅을 끄고 싶을 때.
---

# 작업 로그 자동 기록 (log.md)

프로젝트 루트 `log.md`에 **작업 수정사항**이 자동으로 쌓인다. 사람이 손댈 일은 거의 없고, 형식이나 범위를 바꿀 때만 이 문서를 본다.

## 어떻게 동작하나

`Stop` 훅 — 응답이 끝날 때마다 `.claude/hooks/worklog.js`가 실행된다.

```
응답 종료 → worklog.js → 트랜스크립트에서 이번 턴의 도구 사용 추출
          → 수정/생성 파일 + 상태 변경 명령 요약 → log.md 맨 위에 한 줄
```

| 구성 요소 | 위치 |
|-----------|------|
| 훅 스크립트 | `.claude/hooks/worklog.js` |
| 훅 등록 | `.claude/settings.json` 의 `hooks.Stop` |
| 로그 파일 | `log.md` (루트) |
| 중복 방지 상태 | `.claude/.worklog/<session_id>.json` (gitignore됨) |

## 기록 형식

```
YYMMDD_HHMMSS : 수정 <파일…> | 생성 <파일…> | 실행 <명령…>
```

```
260902_184005 : 수정 README.md | 실행 npm install
260902_184004 : 수정 database/schema.sql, src/app/accidents/page.tsx | 생성 docs/accidents.md | 실행 git commit
```

- **역순** — 새 항목은 `<!-- worklog -->` 마커 바로 아래에 삽입되어 항상 최신이 위에 온다. 마커를 지우면 파일 맨 위에 붙는다.
- 세 구획(`수정`/`생성`/`실행`)은 해당하는 게 있을 때만 나온다.
- 파일은 프로젝트 상대경로, 6개까지 나열하고 나머지는 `외 N개`.

## 무엇이 기록되고 무엇이 빠지나

**기록됨**

- `Write`(생성/수정), `Edit`, `MultiEdit`, `NotebookEdit`으로 건드린 파일
- 워크스페이스 상태를 바꾸는 셸 명령 — `git commit/push/merge/pull/checkout/reset…`, `npm|pnpm|yarn|bun install/add/remove`, `npm run build|deploy|migrate`, `prisma migrate`, `supabase db`, `pip install`, `sed -i`, `vercel`/`netlify`

**빠짐 (의도된 것)**

- 읽기·검색만 한 턴 → **줄 자체를 안 쓴다.** 질문만 한 대화로 로그가 더러워지지 않는다.
- 조회성 명령 — `git status`, `git log`, `grep`, `ls`, `cat`, 테스트·린트 실행
- `rm`/`cp`/`mv`/`mkdir` 같은 범용 파일 명령 — 임시 파일 정리에 훨씬 자주 쓰여 잡음이 크다. 의미 있는 파일 변경은 `Write`/`Edit`로 이미 잡힌다.
- `log.md` 자신, `.claude/.worklog/`, 스크래치패드(`Temp/claude/`), `node_modules/`

**알려진 한계**

- 셸 리다이렉션(`printf … >> file`)으로 쓴 파일은 안 잡힌다. `2>/dev/null` 같은 걸 오탐하지 않으려고 일부러 뺐다.
- 명령 문자열 **안에** 다른 명령이 데이터로 들어 있으면(테스트 픽스처 등) 오탐할 수 있다.

## 자주 하는 변경

| 하고 싶은 것 | 손댈 곳 (`worklog.js`) |
|--------------|------------------------|
| 기록할 명령 추가/제외 | `MUTATING_COMMANDS` 배열 |
| 특정 경로 로그에서 빼기 | `IGNORED_PATHS` 배열 |
| 나열 파일 개수 | `MAX_FILES` / `MAX_CMDS` |
| 한 줄 형식 자체 | `buildSummary()` |
| 삽입 위치·헤더 | `prependEntry()`, `MARKER` |

변경 후에는 **반드시 파이프 테스트**로 확인한다 (아래).

## 손으로 항목 추가

훅은 사람이 한 작업(수동 배포, 외부 도구 작업 등)은 모른다. 그럴 땐 마커 바로 아래에 같은 형식으로 직접 한 줄 넣으면 된다.

## 훅 끄기

`.claude/settings.json`의 `hooks.Stop` 항목을 지우거나, 한 세션만 끄려면 `.claude/settings.local.json`(gitignore됨)에 빈 `Stop` 배열을 둔다.

## 문제 해결

**로그가 전혀 안 남는다**

1. 스크립트가 도는지 파이프 테스트 — 실제 트랜스크립트를 물려서 직접 실행한다:
   ```bash
   TRANSCRIPT=~/.claude/projects/<프로젝트 폴더>/<session_id>.jsonl
   echo "{\"session_id\":\"probe\",\"transcript_path\":\"$TRANSCRIPT\",\"cwd\":\"$PWD\",\"hook_event_name\":\"Stop\"}" \
     | node .claude/hooks/worklog.js
   ```
   `WORKLOG_FILE` 환경변수로 출력 파일을 임시로 바꿔 실제 `log.md`를 건드리지 않고 시험할 수 있다.
2. 훅 등록 확인 — `/hooks` 메뉴에 Stop 훅이 보이는지.
3. `.claude/settings.json`을 **세션 도중에 새로 만들었다면** Claude Code가 아직 못 읽었을 수 있다. `/hooks`를 한 번 열거나 세션을 재시작하면 반영된다.

**같은 내용이 두 번 남는다** — `.claude/.worklog/<session_id>.json`(진행 지점)이 지워졌거나 트랜스크립트가 `/rewind`로 되감긴 경우다. 중복 줄을 지우면 이후로는 정상 동작한다.

**엉뚱한 파일이 남는다** — `IGNORED_PATHS`에 패턴을 추가한다.

## 설계 메모

- Stop 훅은 **셸 명령만** 실행할 수 있다(`prompt`/`agent` 타입은 도구 이벤트 전용). 그래서 AI가 문장으로 요약하는 건 불가능하고, 트랜스크립트에서 기계적으로 뽑아낸 사실만 적는다.
- 훅은 **어떤 실패에도 exit 0**이다. 로그 기록이 작업을 막아서는 안 된다.
- 중복 방지는 트랜스크립트 라인 오프셋으로 한다. 상태 파일이 없으면(세션 첫 기록·재개) 마지막 사용자 프롬프트 이후만 읽어 과거 턴을 통째로 다시 쓰지 않는다.
