-- 전사(전체 본부) 보기 권한 부여 마이그레이션
-- 대상: 발주청(role='발주청') 중 본부 사용자(branch_division LIKE '%본부') 또는 관리자급(hq_division IS NULL)

-- 1) 프로젝트 전사 조회 정책
DROP POLICY IF EXISTS "본사_전사_프로젝트_조회" ON projects;
CREATE POLICY "본사_전사_프로젝트_조회" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = '발주청'
        AND (
          up.hq_division IS NULL           -- 관리자급(전사)
          OR up.branch_division LIKE '%본부'    -- 모든 본부 사용자 전사 허용
        )
    )
  );

-- 2) 열중질환 점검 전사 조회 정책
-- 주의: heat_wave_checks 테이블에 이미 RLS가 활성화되어 있어야 함
DROP POLICY IF EXISTS "본사_전사_열중질환점검_조회" ON heat_wave_checks;
CREATE POLICY "본사_전사_열중질환점검_조회" ON heat_wave_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = '발주청'
        AND (
          up.hq_division IS NULL
          OR up.branch_division LIKE '%본부'
        )
    )
  );

-- 마이그레이션 설명:
-- - 모든 본부 사용자(지사명이 '...본부') 또는 관리자급 사용자는 전사 범위로 조회할 수 있습니다.
-- - 기존 정책과 OR로 결합되어 더 넓은 권한을 부여합니다.

