# 공정표 컨텍스트 노트

진행하며 내린 결정과 이유를 계속 덧붙인다.

## 결정

- **연동을 마스터 방향으로**: 스케줄(JSONB)이 공정률의 단일 출처. `getProgressAnchors`가 스케줄 우선으로 앵커를 만들면 소비자(캐비넷/목록/작업일보) 코드를 안 바꿔도 자동 반영. 기존 `computeProgressRate` 시그니처 유지 → 외과적 변경.
  - 이유: 소비처가 여러 곳(캐비넷 명판, 목록 카드, 작업일보 export)이라 출처 한 곳만 스케줄 인지하게 하면 연동이 일관됨. memory `project_work_daily_report`의 "모든 화면 동일 값" 요구와 합치.
- **旬(10일) 단위**: 사진이 旬(10/20/말일)이라 그대로. 사용자 표현 "주별"과 다르지만 "사진과 동일" 우선.
- **분포 정규화 안 함**: 셀 진행비율 합이 100%가 아니어도 입력 존중하고 경고 배지만. 강제 재분배는 사용자 입력을 덮어 혼란.
- **우측 공정률 컬럼 = 공종 종료 시점 누계%**: 사진 공사준비 0.1%(가장 먼저 끝남) 등과 일치하는 해석. 단순 가중치 표기로 전환은 한 줄.
- **저장 위치 JSONB 컬럼**: 새 테이블+RLS 대신 projects 한 컬럼. is_active가 이미 JSONB인 선례. 마이그레이션 1줄.

## 기존 코드 연동 포인트 (읽어서 확인함)

- `lib/work-daily-report/work-daily-report-types.ts`: `computeProgressRate(start,end,target,anchors)`, `ProgressAnchor{date,rate}`. 착공0/준공100 + 앵커 구간 선형보간, 단조 클램프.
- `lib/work-daily-report/progress-anchors.ts`: `getProgressAnchors(projectId)` 배치+모듈캐시, `invalidateProgressAnchors(projectId)`. 현재 work_daily_reports의 progress_rate_manual=true 행을 읽음. ← 여기에 스케줄 우선 분기 추가.
- `app/project/[id]/page.tsx`: 시공 캐비넷 P 섹션(시공서류관리 옆)에 DocumentFolder 추가. `constructionProgress`는 이미 getProgressAnchors 사용 → 스케줄 반영되면 명판 %도 자동 갱신.
- 시공 캐비넷 안내문구 "공정률 조정은 작업일보에서 가능합니다"는 **다른 미커밋 작업**의 변경. 건드리지 않음. (공정표 추가 후 문구 수정이 필요할 수 있으나 별도 작업과 충돌 피해 보류.)
- Excel: `lib/excel/work-daily-report-export.ts`의 setCell/mergeSet/borderRange/downloadWorkbook 패턴 재사용.

## 테스트 환경

- jest/vitest 없음(Playwright만). 순수 계산은 node 임시 스크립트로 sanity. 빌드는 `npm run build` 동의 필요 → lint + `tsc --noEmit`로 확인.

## 진행 상황 (2026-06-18)

- 1~6 구현 완료, 7 검증(타입/린트/런타임 sanity) 통과. 빌드는 동의 대기.
- **computeSchedule 보강**: dist는 "명시 입력 칸"만, 나머지 旬은 잔여분(1-Σdist) 균등 분배 → 한 칸만 조정해도 공종 합계 100% 유지. (검증 완료)
- **작업일보 폼 미연동 결정**: `WorkDailyReportForm.tsx`(L191~199)는 자체 앵커 쿼리로 autoRate 계산 + 자체 ProgressRateModal 보유. 스케줄 연동하면 "예정공정표 vs 수동 일별 공정률" 우선순위 결정이 필요(현재 getProgressAnchors는 스케줄>수동). 이 파일/월간Excel은 다른 미커밋 기능과 얽혀 위험 → 사용자에게 확인 후 진행. 캐비넷·목록은 이미 연동됨.
- 연동 backward-compatible: 스케줄 없는 프로젝트는 기존 동작 그대로. 스케줄 생성 시에만 그 프로젝트가 스케줄 기준으로 전환.

## 테스트 1차 피드백 반영 (2026-06-18)

- (1) 공사관리번호 입력칸 제거 (contractNo state/입력/payload 삭제. Excel 헤더 조건부라 안 보임).
- (2) S커브 X축을 시간축(착공~준공)으로 전환, 좌하단 "착공 날짜"·우하단 "준공 날짜" 라벨 추가. xByDate(날짜→x).
- (4) 공종 미입력 시: comp.cum(전부 0) 대신 작업일보 수동 기준점을 지나는 **직선보간선** 표시(없으면 착공0→준공100 직선). 수동 수정점은 파란 점+`MM-DD · N%` 라벨로 표시(!hasItems일 때만). todayRate도 공종 없으면 manualAnchors 사용.
- (3) 답변만: 총 공사금액 = 입력 공종 금액 합(프로젝트 금액 아님). 프로젝트 총사업비 참고 표시는 요청 시 추가.
- manualAnchors는 편집기에서 work_daily_reports(progress_rate_manual=true) 직접 조회.

## 테스트 2차 피드백 — 일자 조정 공정률 편집 (2026-06-18)

- 요청: "일자 조정 공정률"을 공정표에서도 직접 수정, 위아래 드래그 가능하게.
- 구현: 기존 `ProgressRateModal` 재사용(드래그 핸들·표 편집·단조증가·DB upsert/clear·재계산이 이미 검증됨). 편집기에 "직접 조정" 버튼(항상 표시) → 모달 오픈. 표는 읽기 표시, 편집은 모달.
- WorkScheduleEditor에 `userId` prop 추가(page에서 user.id 전달). manualAnchors 로딩을 loadManualAnchors useCallback으로 추출 → 모달 onSaved 후 재조회.
- 모달은 '선택일(today)' 값을 해당일 일보가 없으면 저장 안 함(폼 저장 가정) → 공정표엔 폼이 없어 onSaved에서 currentRate 있으면 today 행 직접 insert로 보강. 그 외 날짜(행 추가/빨간 점)는 모달이 upsert.
- 정합성: 모달 저장 시 invalidateProgressAnchors 호출(모달 내부) → 캐비넷/목록 갱신. 공정표 manualAnchors 재조회로 표/그래프 갱신.

## 테스트 3차 피드백 — 레이아웃 분리 (2026-06-18)

- 요청: "일자 조정 공정률"을 공정표 본체 카드에서 빼서 바로 아래 별도 컨테이너로.
- 구현: WorkScheduleEditor가 자체적으로 카드 2개 렌더(카드1 공정표 본체 / 카드2 일자 조정 공정률) + 모달. page.tsx는 편집기를 감싸던 흰 카드 제거(편집기가 카드 제공), no-period 안내만 자체 카드 유지. 카드 내부 콘텐츠 들여쓰기는 표면적으로 한 단계 얕지만 기능/검증 무관(대규모 reindent 회피).

## 테스트 4차 — 0 수렴 버그 + 결합 곡선 + Excel 위치 (2026-06-18)

- **0 수렴 버그**: 빈 공종(금액 0) 추가 시 가중치·누계 전부 0 → 곡선 0 깔림. `combineScheduleAnchors`가 finalCum≈0이면 수동 앵커만 반환하도록 해 해결.
- **결합 곡선(사용자 선택 "수동점 통과+사이 공정표 형태")**: `combineScheduleAnchors(schedule,start,end,manual)` 신설 — 고정점 F=[start0,수동…,end100], 구간별 S(t) 비례 리매핑. 검증: 6/30 수동 80% 정확 통과, 단조 유지. 편집기 curvePts·todayRate, getProgressAnchors(캐비넷/목록/작업일보) 모두 이 함수 경유 → 전 화면 동일. `scheduleToAnchors`는 미사용→제거.
- **Excel 위치**: 사용자 "그래프 아래 표가 나와야"=그래프 위·표 아래. S커브 밴드를 표 헤더 위로 이동. makeCurvePng를 {frac,v}[] 기반으로 바꿔 결합 곡선을 시간비례로 그림(화면과 동일). downloadWorkScheduleExcel에 manualAnchors 인자 추가(편집기에서 전달).
- **남은 divergence**: 하단 표(주간/월간 누계)·공종별 우측 공정률은 raw 공정표 cum 유지, 곡선/오늘/캐비넷은 결합. 수동 점 있으면 표 누계 vs 곡선이 갈림 — 사용자에게 고지함. 표도 결합 반영은 후속 여지.

## 테스트 5차 — 누계 행을 그래프 곡선과 일치 (2026-06-18)

- 요청: 하단 "주간공정 누계"·"월간공정율 누계"가 위 그래프(결합 곡선)와 맞아야.
- 구현: `combinedCum[p] = computeProgressRate(start,end,旬endDate,combinedAnchors)` 배열 추가(편집기 useMemo, export 인라인). 두 누계 행을 combinedCum로 교체(편집기·Excel 모두). 우측 합계 셀도 combinedCum[n-1](=100).
- **율 행(주간공정율/월간공정율)은 raw(comp.colRate/monthly.rate)=공종 셀 합 유지** — 율=계획 분배, 누계=수동 반영 곡선. 수동 점 있으면 율 합≠누계(의도). 수동 없으면 전부 일치.

## 테스트 6차 — 드래그 자동 가로 스크롤 (2026-06-18)

- 요청: 시작·종료 드래그 시 보이는 창 밖으로 나가면 자동 가로 스크롤되며 창 밖 구간도 선택.
- 구현(WorkScheduleEditor): onPointerEnter 방식 → rAF 루프 + `document.elementFromPoint(clampedX, startY)`로 포인터 아래 旬 칸 탐지. 셀에 `data-p`, 스크롤 컨테이너 `scrollRef`, 고정열 헤더 `stickyColRef`. 포인터가 컨테이너 좌/우 가장자리(EDGE 44px) 근처면 scrollLeft ±22/frame. X는 고정열(공사종류) 오른쪽~컨테이너 안쪽으로 클램프(가려짐 방지). Y는 시작 행 고정(세로 이동 무관).
- 클릭(기여% 선택) 오작동 방지: 포인터 이동량 >5px일 때만 moved=true → 그때만 자동 스크롤. 단순 클릭은 스크롤/구간확장 안 함.
- 성능: lastPreviewRef로 구간 실제 변경 시에만 setPaintPreview(대형 공정표 매 프레임 리렌더 방지).

## 커밋/주의

- 작업 트리에 미커밋 변경(작업일보 미생성 구간 자동 채우기, 5파일 167줄) 존재. 내 커밋에 섞지 말 것.
- 내 신규 파일은 단독 커밋. page.tsx/progress-anchors.ts는 선택 스테이징(git add -p)으로 내 hunk만.
- git push는 사용자 요청 시에만 (memory: main 직접 푸시가 기본이나 명시 요청 대기).
