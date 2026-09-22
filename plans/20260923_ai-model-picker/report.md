# 결과

OpenAI·Google Gemini 모델 편집에서 저장된 선택과 검색어를 분리했다. 포커스·선택 후 클릭·Escape 후 방향키 재열기는 전체 후보를 보여주고, 사용자 입력만 검색에 사용한다. 직접 모델 입력과 키보드 선택을 유지하며 공급자 변경은 검색 상태를 초기화한다.

입력·출력 가격에 단위를 포함한 영구 라벨과 비용 추정 안내를 추가했다. 새로고침 버튼은 refresh=true를 전송하고 서버는 해당 공급자의 10분 캐시를 우회하여 no-store 상위 요청을 보낸다. 일반 요청 캐시, 정렬, 인증과 공급자 검증은 유지했다.

## 정확한 변경 파일

- `safesys-app/src/app/admin/ai-usage/page.tsx`
- `safesys-app/src/app/api/admin/ai-models/available/route.ts`
- `safesys-app/tests/ai-model-picker.test.mjs`
- `safesys-app/tests/ai-models-available.test.mjs`
- `safesys-app/package.json` — test:ai-models 스크립트 추가만 수행
- `plans/20260923_ai-model-picker/plan.md`
- `plans/20260923_ai-model-picker/checklist.md`
- `plans/20260923_ai-model-picker/context-notes.md`
- `plans/20260923_ai-model-picker/report.md`

## 검증

- RED — 기존 API에 캐시 테스트 실행 시 6개 중 5개 실패, 강제 새로고침이 상위 요청을 하지 않음을 재현.
- GREEN — `npm run test:ai-models` 11개 통과. 양 공급자 캐시 적중·강제 갱신·TTL 만료·실패 후 정상 캐시 보존·공급자 분리·인증/검증을 포함한다.
- UI — 실제 컴포넌트를 transpile하고 경량 hook/JSX harness로 이벤트를 실행하여 검색·직접입력·선택·재열기·Escape·방향키·가격 라벨을 확인했다.
- `npx eslint src/app/admin/ai-usage/page.tsx src/app/api/admin/ai-models/available/route.ts` 통과.
- `npx tsc --noEmit --incremental false` 통과.
- `git diff --check` 통과.

## 남은 검증 한계

실제 공급자 API 호출과 브라우저 DOM/포커스·시각 배치 E2E는 수행하지 않았다. UI harness는 React effect 실행·실제 DOM 이벤트 순서·공급자 key remount 자체를 시뮬레이션하지 않는다. 전체 저장소 커버리지 80% 수치는 측정하지 않았다. 코디네이터의 독립 리뷰와 최종 커밋이 남아 있다.

빌드·커밋·푸시는 실행하지 않았으며 package-lock.json, log.md와 기존/타 작업자의 dirty 파일은 변경하지 않았다.
