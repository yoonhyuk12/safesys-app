# 체크리스트 — 계약현황 이전 연차 탐색 보강 + 지급완료 뱃지

- [x] `isThtmPartial` 헬퍼 추가 (총액≠금차 차수분 계약 판별)
- [x] `nameGroupKey`에 `stripYearAffix` 인자 추가 — 연도 접두사·괄호 연도 접미사 제거
- [x] 호출부 3곳(그룹 빌드·탐색 후보 필터·모달 차수 동시선택)에 판별값 전달
- [x] `scanPlans` 탐색 시작월 — `cntrct_prd` "총공사 N일" 역산으로 과거 확장
- [x] 조회 모달 등록 alert에 장기계속 안내 문구 추가
- [x] 연도 정규식 실데이터 계약명 단위 확인 (node — 연차 병합 PASS·단년도 분리 PASS)
- [x] 마이그레이션 `payment_completed` 작성 — **Supabase 적용은 사용자 실행 필요 (MCP 읽기 전용)**
- [x] `ContractRecord` 타입에 `payment_completed` 추가
- [x] 그룹 지급완료 판정 + 토글 핸들러 (RLS 부분 실패 안내 포함)
- [x] 계약명 셀 지급완료 토글 뱃지 UI
- [x] `npx tsc --noEmit` 통과
- [x] `npm run lint` 통과 (본 파일 관련 경고 0건)
- [x] 의미 단위 커밋 2건 (7fe8e1f 탐색 보강 / 8f97c25 지급완료 뱃지)
- [ ] 마이그레이션 실행 후 운영 확인 (사용자)
