-- 계약현황 대금지급 수동 토글 폐기에 따른 컬럼 정리 (선택 실행)
-- 지급완료 표시가 나라장터 대금지급 문서 자동 조회로 대체되어(2026-07-12) payment_completed 컬럼은 더 이상 사용되지 않는다.
-- 남겨둬도 무해하므로 실행은 선택 사항.
ALTER TABLE project_contracts DROP COLUMN IF EXISTS payment_completed;
