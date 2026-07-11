-- 계약현황 대금지급 완료 표시: project_contracts.payment_completed 컬럼 추가
-- 계약건(그룹) 토글 시 차수 행 전체에 같은 값을 쓰고, 그룹 완료 판정은 "멤버 전원 완료" —
-- 이후 새 차수가 등록되면 그 행이 false라 뱃지가 자동 해제된다 (대금지급 여부는 조달청 공개 API가 없어 수동 관리, 2026-07-12 확인)
ALTER TABLE project_contracts ADD COLUMN IF NOT EXISTS payment_completed BOOLEAN NOT NULL DEFAULT false;
