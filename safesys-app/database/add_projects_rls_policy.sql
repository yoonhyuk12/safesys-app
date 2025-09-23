-- 기존 프로젝트 RLS 정책 삭제
DROP POLICY IF EXISTS "사용자는 모든 프로젝트를 볼 수 있습니다" ON projects;

-- 새로운 프로젝트 조회 정책 생성
CREATE POLICY "발주청 사용자는 관할 프로젝트를 볼 수 있습니다" ON projects
    FOR SELECT USING (
        -- 자신이 생성한 프로젝트는 항상 볼 수 있음
        created_by = auth.uid()
        OR
        -- 발주청 사용자인 경우 관할 범위 내 프로젝트 조회 가능
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() 
            AND up.role = '발주청'
            AND (
                -- 본부가 일치하는 경우
                (up.hq_division IS NOT NULL AND projects.managing_hq = up.hq_division)
                OR
                -- 본부가 지정되지 않은 경우 모든 프로젝트 조회 가능 (관리자급)
                (up.hq_division IS NULL)
            )
        )
        OR
        -- 감리단, 시공사는 관련 프로젝트 조회 가능 (추후 확장 가능)
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() 
            AND up.role IN ('감리단', '시공사')
        )
    );

-- 정책 설명 주석
-- 이 정책은 다음과 같은 권한을 부여합니다:
-- 1. 모든 사용자는 자신이 생성한 프로젝트를 볼 수 있습니다
-- 2. 발주청 사용자는 자신의 본부(hq_division)에 해당하는 모든 프로젝트를 볼 수 있습니다
-- 3. 본부가 지정되지 않은 발주청 사용자는 모든 프로젝트를 볼 수 있습니다 (관리자급)
-- 4. 감리단, 시공사는 관련 프로젝트를 볼 수 있습니다 (추후 세부 권한 설정 가능) 