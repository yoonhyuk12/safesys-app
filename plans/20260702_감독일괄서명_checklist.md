# 감독 일괄서명 구현 체크리스트

계획서: `plans/20260702_감독일괄서명.md`

- [x] 계획 산출물(plan·checklist·context-notes) 생성
- [x] API `src/app/api/supervisor-bulk-sign/route.ts` (Bearer 인증, 발주청 확인, 타입 화이트리스트, 미서명 조건 포함 update)
- [x] 모달 `SupervisorBulkSignModal.tsx` (5종 미서명 목록, 전체/부분 선택, SignaturePad 연동)
- [x] 발주청 캐비넷에 "감독 일괄서명" 서류철 추가
- [x] ESLint / tsc 신규 오류 0건
- [x] `.or('col.is.null,col.eq.')` 미서명 필터 실 DB 검증 (work_daily_reports 6건=SQL 6건 일치)
- [x] 커밋 dac0c3a (푸시는 사용자 판단)
- [ ] 수동 검증 (발주청 계정: 모달 열기 → 목록 확인 → 부분 선택 서명 → 재조회로 감소 확인)
