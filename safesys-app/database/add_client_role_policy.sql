-- 발주청 역할 권한 설정 마이그레이션
-- 현재 user_profiles 테이블의 role은 enum 타입으로 '발주청', '감리단', '시공사' 중 하나입니다.

-- 1. 발주청이 모든 프로젝트를 생성할 수 있는 정책
CREATE POLICY "발주청은 프로젝트를 생성할 수 있습니다" ON projects
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = '발주청'
        )
    );

-- 2. 발주청이 모든 프로젝트를 수정할 수 있는 정책
CREATE POLICY "발주청은 모든 프로젝트를 수정할 수 있습니다" ON projects
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = '발주청'
        )
    );

-- 3. 발주청이 모든 프로젝트를 삭제할 수 있는 정책
CREATE POLICY "발주청은 모든 프로젝트를 삭제할 수 있습니다" ON projects
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = '발주청'
        )
    );

-- 4. 발주청이 모든 열중질환 점검을 볼 수 있는 정책
CREATE POLICY "발주청은 모든 열중질환 점검을 볼 수 있습니다" ON heat_wave_checks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = '발주청'
        )
    );

-- 5. 발주청이 모든 열중질환 점검을 생성할 수 있는 정책
CREATE POLICY "발주청은 열중질환 점검을 생성할 수 있습니다" ON heat_wave_checks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = '발주청'
        )
    );

-- 6. 발주청이 모든 열중질환 점검을 수정할 수 있는 정책
CREATE POLICY "발주청은 모든 열중질환 점검을 수정할 수 있습니다" ON heat_wave_checks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = '발주청'
        )
    );

-- 7. 발주청이 모든 열중질환 점검을 삭제할 수 있는 정책
CREATE POLICY "발주청은 모든 열중질환 점검을 삭제할 수 있습니다" ON heat_wave_checks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = '발주청'
        )
    );

-- 마이그레이션 완료 메시지
-- 발주청 사용자는 이제 모든 프로젝트와 열중질환 점검을 생성, 수정, 삭제할 수 있습니다.
-- 기존 enum 구조를 그대로 사용하므로 추가적인 스키마 변경이 필요하지 않습니다. 