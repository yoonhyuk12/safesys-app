-- 본부 사용자 권한 정책 최적화 마이그레이션
-- 기존 중복된 정책들을 정리하고 최적화된 정책으로 교체

-- 1. 기존 중복된 본부 정책들 삭제
DROP POLICY IF EXISTS "본부사용자_산하지사_점검현황_조회" ON heat_wave_checks;
DROP POLICY IF EXISTS "본부사용자는_산하모든지사_점검현황_조회" ON heat_wave_checks;

-- 2. 최적화된 본부 사용자 열중질환 점검 조회 정책 생성
CREATE POLICY "본부사용자_열중질환점검_조회_최적화" ON heat_wave_checks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() 
            AND up.role = '발주청'
            AND up.branch_division LIKE '%본부'
            AND project_id IN (
                SELECT p.id FROM projects p
                WHERE p.managing_hq = up.hq_division
            )
        )
    );

-- 3. 본부 사용자 열중질환 점검 생성 정책
CREATE POLICY "본부사용자_열중질환점검_생성_최적화" ON heat_wave_checks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() 
            AND up.role = '발주청'
            AND up.branch_division LIKE '%본부'
            AND project_id IN (
                SELECT p.id FROM projects p
                WHERE p.managing_hq = up.hq_division
            )
        )
    );

-- 4. 본부 사용자 열중질환 점검 수정 정책
CREATE POLICY "본부사용자_열중질환점검_수정_최적화" ON heat_wave_checks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() 
            AND up.role = '발주청'
            AND up.branch_division LIKE '%본부'
            AND project_id IN (
                SELECT p.id FROM projects p
                WHERE p.managing_hq = up.hq_division
            )
        )
    );

-- 5. 본부 사용자 열중질환 점검 삭제 정책
CREATE POLICY "본부사용자_열중질환점검_삭제_최적화" ON heat_wave_checks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() 
            AND up.role = '발주청'
            AND up.branch_division LIKE '%본부'
            AND project_id IN (
                SELECT p.id FROM projects p
                WHERE p.managing_hq = up.hq_division
            )
        )
    );

-- 6. 본부 사용자 프로젝트 조회 정책 (기존 정책과 통합)
-- 기존 "프로젝트_조회_개선" 정책이 이미 본부 사용자를 지원하므로 추가 정책 불필요

-- 7. 본부 사용자 프로젝트 수정 정책 (기존 정책과 통합)
-- 기존 "프로젝트_수정" 정책이 이미 본부 사용자를 지원하므로 추가 정책 불필요

-- 8. 본부 사용자 프로젝트 삭제 정책
CREATE POLICY "본부사용자_프로젝트_삭제_최적화" ON projects
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() 
            AND up.role = '발주청'
            AND up.branch_division LIKE '%본부'
            AND managing_hq = up.hq_division
        )
    );

-- 9. 성능 최적화를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_profiles_role_branch_division 
ON user_profiles(role, branch_division) 
WHERE role = '발주청' AND branch_division LIKE '%본부';

CREATE INDEX IF NOT EXISTS idx_projects_managing_hq 
ON projects(managing_hq);

CREATE INDEX IF NOT EXISTS idx_heat_wave_checks_project_id 
ON heat_wave_checks(project_id);

-- 마이그레이션 완료 메시지
-- 본부 사용자 권한이 최적화되었습니다.
-- 중복된 정책들이 정리되고 성능이 개선되었습니다.
-- 경기본부 사용자는 경기본부 산하 모든 지사의 데이터를 관리할 수 있습니다. 