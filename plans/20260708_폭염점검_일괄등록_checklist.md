# 폭염점검 일괄 등록 체크리스트

- [x] API 라우트 `src/app/api/weather/hourly-feels-like/route.ts` 생성 (kma_sfctm3 시간자료 → 체감온도)
- [x] 모달 `src/components/project/HeatWaveBulkRegisterModal.tsx` 생성 (시간 바 + 확인자 + 동의 + 서명)
- [x] `heatwave/page.tsx`에 일괄 등록 버튼·모드·달력 선택 로직 추가
- [x] `handleBulkRegister` 구현 (날짜별 체감온도 조회 → 중복 시각 건너뜀 → 서명 1회 업로드 → 일괄 insert)
- [x] 진행률 오버레이 + 결과 요약 alert
- [x] `npx tsc --noEmit` 통과 (신규·수정 파일 오류 0, 기존 무관 파일 오류 19건은 종전과 동일)
- [x] `npm run lint` 통과 (신규 파일 오류 0, page.tsx 오류 9건은 전부 기존 코드 소행 — 원본 대조 확인)
- [x] Advisor diff 검증
- [x] 커밋·푸시 (main = 운영 배포)
