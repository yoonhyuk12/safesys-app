-- 본사 소속 사용자가 전사 프로젝트를 조회할 수 있도록 RLS 정책 수정
-- 실행 위치: Supabase SQL Editor

-- 기존 정책 삭제
DROP POLICY IF EXISTS "본사_전사_프로젝트_조회" ON projects;
DROP POLICY IF EXISTS "프로젝트_조회_개선" ON projects;

-- 새로운 통합 조회 정책 생성
CREATE POLICY "프로젝트_조회_통합정책" ON projects
FOR SELECT
TO public
USING (
  -- 1. 프로젝트 생성자 본인
  created_by = auth.uid()
  OR
  -- 2. 발주청 사용자
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.role = '발주청'
    AND (
      -- 2-1. 본사 소속 사용자: 전사 프로젝트 조회 가능
      (up.hq_division = '본사' AND up.branch_division = '본사')
      OR
      -- 2-2. 본부 미지정(관리자급): 전사 프로젝트 조회 가능
      up.hq_division IS NULL
      OR
      -- 2-3. 본부 대표 지사(예: 경기본부): 해당 본부 전체 조회 가능
      (up.branch_division LIKE '%본부' AND up.hq_division = projects.managing_hq)
      OR
      -- 2-4. 일반 지사: 본부와 지사가 모두 일치하는 프로젝트만 조회 가능
      (up.hq_division = projects.managing_hq AND up.branch_division = projects.managing_branch)
    )
  )
  OR
  -- 3. 시공사/감리단: 본인이 생성한 프로젝트만 조회
  EXISTS (
    SELECT 1
    FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.role IN ('시공사', '감리단')
    AND projects.created_by = auth.uid()
  )
);

-- 정책 확인
SELECT
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'projects'
AND cmd = 'SELECT';
