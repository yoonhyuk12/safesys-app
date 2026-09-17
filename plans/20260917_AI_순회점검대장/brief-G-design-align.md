# Worker G 브리프 — 순회점검대장 화면을 다른 점검 서류철과 같은 디자인·색상으로 통일

너는 SafeSys(Next.js 15 · React 19 · Supabase) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `.claude/rules/safesys/design-system.md`, `docs/design-system.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 요청과 무관한 코드는 손대지 않는다. `dark:` 금지. `npm run build` 금지. git commit·push 금지.

## 목표

`/project/[id]/patrol-ledger` 화면(페이지·목록·상세·폼)의 **모양만** 기준 서류철과 같게 만든다. 데이터 흐름·검증·저장·AI 호출·서명 모달·HWPX·사진 편집 로직은 한 줄도 바꾸지 않는다. 마크업의 클래스·구조·문구 배치만 맞춘다.

**기준 서류철 = `(AI) 장비 일일점검 대장`** (`safesys-app/src/app/project/[id]/equipment-inspection/page.tsx`, `src/components/project/equipment-inspection/EquipmentInspectionList.tsx`, `EquipmentInspectionForm.tsx`, `EquipmentInspectionDetail.tsx`). 가장 최근에 디자인 시스템대로 만든 서류철이라 이것을 그대로 따른다. 보조 참고는 본부 불시점검(`headquarters-inspection/page.tsx`)이다.

## 대상 파일 (이 네 파일만 수정)

- `safesys-app/src/app/project/[id]/patrol-ledger/page.tsx`
- `safesys-app/src/components/project/patrol-ledger/PatrolLedgerList.tsx`
- `safesys-app/src/components/project/patrol-ledger/PatrolLedgerDetail.tsx`
- `safesys-app/src/components/project/patrol-ledger/PatrolLedgerForm.tsx`

## 맞출 것

1. **페이지 골격.** 배경 `min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900`(이미 적용됨). 헤더는 기준과 같은 `bg-white shadow-sm border-b border-gray-200` + `max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4` + `flex items-center h-16`, 뒤로가기 버튼 클래스(`mr-3 p-2 min-h-[44px] inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 shrink-0`, 상세·작성 중에는 `뒤로 가기` 글자 표시), 제목 `text-base sm:text-xl font-bold text-gray-900 truncate flex-1`로 `(AI) 순회점검대장`. 지금의 `sticky top-0` 헤더는 기준처럼 sticky를 뺀다. 그러면 폼 툴바의 `top-[69px]` 오프셋은 `top-0`으로 바꾼다(폼 안 툴바는 계속 sticky).
2. **본문 컨테이너.** `main`은 `max-w-none mx-auto py-4 px-2 sm:px-4`. 목록은 기준처럼 흰 카드(`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden`) 안에 **파란 띠 헤더** `bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2`(제목 `제출 목록`, 기록이 있을 때 우측에 `bg-white text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm font-medium` `점검하기` 버튼). 빈 목록이면 기준처럼 표 가운데 안내 문구와 `점검하기` 버튼 하나만. 페이지 헤더의 `새 점검` 버튼은 기준처럼 목록 카드 헤더로 옮긴다.
3. **목록 표.** `EquipmentInspectionList`의 표 클래스(`min-w-full`, `thead bg-gray-50 border-b border-gray-200`, `th px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider`, `tbody bg-white divide-y divide-gray-200`, 행 `hover:bg-gray-50`)로 통일. 열은 지금 그대로(점검일 · 점검자 · 미흡 · 주요 테마 · 지적사항). 기준처럼 `관리` 열을 두고 HWPX 다운로드 버튼(기준 목록의 다운로드 버튼 마크업 복사)을 행마다 둔다 — 페이지에 이미 있는 `download` 로직을 `onDownload(record)` 형태로 넘겨 쓰되 새 로직을 만들지 않는다(현재 `download`는 `selected`를 쓰므로, 인자를 받게 최소 변경하는 것은 허용).
4. **상세.** `EquipmentInspectionDetail`의 카드·섹션 제목·기본정보 그리드 클래스로 통일. 버튼 줄(목록으로 · HWPX 다운로드 · 수정 · 삭제)은 기준의 상세 상단 버튼 배치와 같은 스타일로. 결과 배지 색은 유지(양호 green, 미흡 red, 미점검 gray).
5. **폼.** 섹션 카드 클래스, 라벨(`block text-sm font-medium text-gray-700`), 입력 클래스, 주 버튼/보조 버튼 클래스, 안내문(`text-xs text-gray-500`)을 기준 폼과 같게. 점검사항 목록의 양호/미흡 토글, 사진 업로드 영역, 사진 구분 토글, 주요 테마 칸, 서명 안내는 **기능·문구 유지**하고 클래스만 기준 폼의 대응 요소에 맞춘다. 폼 상단 sticky 툴바(제목 + 취소/저장)는 유지.
6. **색.** 파란 계열은 `blue-600/700`, 상태색은 red/amber/green, 나머지는 gray 스케일만 쓴다. 디자인 시스템에 없는 색·그림자·글꼴을 새로 만들지 않는다.
7. **모바일.** 모든 표는 `overflow-x-auto` 안에, 버튼 줄은 `flex-wrap`. 320px 폭에서 가로 스크롤이 페이지 전체에 생기지 않아야 한다.

## 절차

끝나기 전에 `safesys-app`에서 `npx eslint <변경 4파일>`, `npx tsc --noEmit`, `npm run test:patrol-ledger`를 돌리고 결과를 사실대로 보고한다. 동작 변경이 없음을 `git diff`로 스스로 검토해 보고에 "로직 변경 없음"을 근거와 함께 적어라.

## 완료 보고

`worker_done`에 변경 파일, lint·tsc·테스트 결과, 기준과 달리 둔 부분(있다면)과 이유를 담는다.
