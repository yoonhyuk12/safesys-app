# 재해예방 계약현황 카드 — 체크리스트 (2026-07-08)

- [x] DB 실태 확인 (project_contracts 분포, 예시 프로젝트 데이터) — 공사 107·용역 180, 재해예방기술지도 용역 실존, 상세는 context-notes
- [x] 엑셀 내보내기 모듈 `src/lib/excel/disaster-prevention-contract-export.ts` 작성
- [x] 신규 페이지 `src/app/disaster-prevention-contracts/page.tsx` 작성 (지사별→프로젝트별 계약 현황 + 우측 엑셀 버튼)
- [x] Dashboard.tsx list 뷰에 "재해예방 계약현황" 카드 추가 (발주청 전용)
- [x] `npm run lint` — 신규 파일 지적은 `(supabase as any)` 1건뿐 (contract-status 페이지와 동일한 확립된 idiom, 용인)
- [x] `npx tsc --noEmit` — 신규 파일 에러 0건 (기존 무관 선존 에러만 출력)
- [x] 실검증 — ① `projects!inner` 임베드가 FK 2개 모호성으로 실패하는 버그 발견 → `projects!project_id!inner` 컬럼 힌트로 수정 후 실쿼리 통과 확인, ② 엑셀 모듈 tsc 단독 트랜스파일+Node 하네스로 실제 xlsx 생성해 예시 파일과 병합·헤더·서식 대조 일치, ③ 라우트 HTTP 200 (Chrome 확장 미연결로 로그인 후 화면은 사용자 확인 필요)
- [x] 커밋
