# 체크리스트 — 계약현황 이전 연차 탐색 보강 + 지급완료 뱃지

- [ ] `isThtmPartial` 헬퍼 추가 (총액≠금차 차수분 계약 판별)
- [ ] `nameGroupKey`에 `stripYearAffix` 인자 추가 — 연도 접두사·괄호 연도 접미사 제거
- [ ] 호출부 3곳(그룹 빌드·탐색 후보 필터·모달 차수 동시선택)에 판별값 전달
- [ ] `scanPlans` 탐색 시작월 — `cntrct_prd` "총공사 N일" 역산으로 과거 확장
- [ ] 조회 모달 등록 alert에 장기계속 안내 문구 추가
- [ ] 연도 정규식 실데이터 계약명 단위 확인 (node)
- [ ] 마이그레이션 `payment_completed` 작성 + Supabase 적용
- [ ] `ContractRecord` 타입에 `payment_completed` 추가
- [ ] 그룹 지급완료 판정 + 토글 핸들러 (RLS 부분 실패 안내 포함)
- [ ] 계약명 셀 지급완료 토글 뱃지 UI
- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run lint` 통과
- [ ] 의미 단위 커밋 2건
