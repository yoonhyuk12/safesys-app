-- 본부 사용자 권한 설정 마이그레이션
-- 본부 사용자(지사명이 '본부'로 끝나는 사용자)가 산하 모든 지사의 점검 현황을 볼 수 있는 정책

-- 1. 본부 사용자가 산하 모든 프로젝트를 볼 수 있는 정책
CREATE POLICY "본부사용자는_산하모든프로젝트_조회" ON projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role = '발주청'
            AND branch_division LIKE '%본부'
            AND managing_hq = user_profiles.hq_division
        )
    );

-- 2. 본부 사용자가 산하 모든 프로젝트를 수정할 수 있는 정책
CREATE POLICY "본부사용자는_산하모든프로젝트_수정" ON projects
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role = '발주청'
            AND branch_division LIKE '%본부'
            AND managing_hq = user_profiles.hq_division
        )
    );

-- 3. 본부 사용자가 산하 모든 프로젝트를 삭제할 수 있는 정책
CREATE POLICY "본부사용자는_산하모든프로젝트_삭제" ON projects
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() 
            AND role = '발주청'
            AND branch_division LIKE '%본부'
            AND managing_hq = user_profiles.hq_division
        )
    );

-- 4. 본부 사용자가 산하 모든 열중질환 점검을 볼 수 있는 정책
CREATE POLICY "본부사용자는_산하모든지사_열중질환점검_조회" ON heat_wave_checks
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

-- 5. 본부 사용자가 산하 모든 열중질환 점검을 생성할 수 있는 정책
CREATE POLICY "본부사용자는_산하모든지사_열중질환점검_생성" ON heat_wave_checks
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

-- 6. 본부 사용자가 산하 모든 열중질환 점검을 수정할 수 있는 정책
CREATE POLICY "본부사용자는_산하모든지사_열중질환점검_수정" ON heat_wave_checks
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

-- 7. 본부 사용자가 산하 모든 열중질환 점검을 삭제할 수 있는 정책
CREATE POLICY "본부사용자는_산하모든지사_열중질환점검_삭제" ON heat_wave_checks
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

-- 마이그레이션 완료 메시지
-- 본부 사용자(지사명이 '본부'로 끝나는 발주청 사용자)는 이제 산하 모든 지사의 프로젝트와 점검 현황을 관리할 수 있습니다.
-- 예: 경기본부 사용자는 경기본부 산하 모든 지사(여주·이천지사, 양평·광주·서울지사 등)의 데이터를 조회/수정/삭제할 수 있습니다. 