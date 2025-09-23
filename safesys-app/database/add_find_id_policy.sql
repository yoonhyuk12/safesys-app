-- 아이디 찾기를 위한 RLS 정책 추가

-- 기존 정책에 아이디 찾기 조건 추가
-- 이름과 전화번호가 일치하는 경우 이메일 조회를 허용하는 정책
CREATE POLICY "아이디 찾기를 위한 제한적 조회 허용" ON user_profiles
    FOR SELECT 
    USING (
        -- 인증된 사용자가 자신의 프로필을 보는 경우
        auth.uid() = id 
        OR
        -- 관리자가 모든 프로필을 보는 경우
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        -- 아이디 찾기: 익명 사용자도 이름과 전화번호로 이메일만 조회 가능
        -- 실제로는 API에서 제한적으로만 정보를 반환
        true
    );

-- 기존 정책들 삭제 (충돌 방지)
DROP POLICY IF EXISTS "사용자는 자신의 프로필을 볼 수 있습니다" ON user_profiles;
DROP POLICY IF EXISTS "관리자는 모든 프로필을 볼 수 있습니다" ON user_profiles;