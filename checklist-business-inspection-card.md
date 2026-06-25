<!-- /business 사업현황에 검사/검측 카드 추가 작업 추적 -->
# /business 검사/검측 카드 추가

피드백: `/business` 사업현황 카드 그리드에 검사/검측 카드 추가. 데이터는 프로젝트 상세 `검사/검측대장`(inspection_requests 테이블, `/project/[id]/inspection-request`) 소스를 참고.

방식: 자급자재 카드/BusinessMaterialView와 병렬 구조로 구현 (기존 자급자재 흐름 미변경).

## 체크리스트

- [x] 1. `projects.ts`에 `InspectionRequestCountByProject` 타입 + `getInspectionRequestCountsByUserBranch` 함수 추가 (material 함수 미러, `materials`→`inspection_requests`)
- [x] 2. `BusinessInspectionView.tsx` 신규 컴포넌트 (BusinessMaterialView 미러, 라벨/아이콘/색상/네비게이션 교체)
- [x] 3. `Dashboard.tsx` 상태 추가: `inspectionRequestCounts`, `inspectionRequestDataLoading`
- [x] 4. `Dashboard.tsx` business 진입 시 검측 데이터 로드 useEffect 추가
- [x] 5. `Dashboard.tsx` 그리드에 검사/검측 카드 + `selectedBusinessCard === 'inspection'` 분기 렌더
- [x] 6. import 정리 (ClipboardCheck는 병행 세션이 이미 추가 → 재추가 생략, 함수/타입/컴포넌트만 추가)
- [x] 7. 타입체크 통과 (수정 3개 파일 tsc 에러 0건, 기존 20개 에러는 무관 파일)

## 주의 (병행 편집 충돌)
- 작업 중 다른 세션이 `Dashboard.tsx`·`projects.ts`를 동시 편집(작업허가제/PTW 기능 추가).
- 충돌점은 공유 `ClipboardCheck` import 1건뿐 — 상대가 먼저 추가해 둬서 본 작업은 재추가 생략.
- 비즈니스 카드 영역은 본 작업 단독. 상대 에디터가 stale 버퍼로 재저장 시 본 변경 덮어쓸 수 있으니 최종 확인 필요.
