-- 관리자 점검 테이블의 UPDATE 정책을 모든 역할이 수정 가능하도록 변경

-- 기존 UPDATE 정책 삭제
DROP POLICY IF EXISTS "관리자점검_수정_권한" ON manager_inspections;

-- 새로운 UPDATE 정책 생성 (모든 역할이 수정 가능)
CREATE POLICY "관리자점검_수정_권한"
ON manager_inspections
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('발주청', '시공사', '감리단')
  )
);

-- 기존 DELETE 정책도 모든 역할이 삭제 가능하도록 변경 (요청하신 경우)
DROP POLICY IF EXISTS "관리자점검_삭제_권한" ON manager_inspections;

CREATE POLICY "관리자점검_삭제_권한"
ON manager_inspections
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('발주청', '시공사', '감리단')
  )
);

-- 기존 INSERT 정책도 모든 역할이 생성 가능하도록 변경
DROP POLICY IF EXISTS "관리자점검_생성_권한" ON manager_inspections;

CREATE POLICY "관리자점검_생성_권한"
ON manager_inspections
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('발주청', '시공사', '감리단')
  )
  AND created_by = auth.uid()
);
