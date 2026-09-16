-- 사고보고 RLS 회귀 테스트용 최소 스키마.
-- Supabase의 auth.uid()와 운영 projects 조회 RLS 세 정책을 PGlite에 재현해,
-- 사고 마이그레이션의 정책을 손대지 않고 그대로 실행해 본다.

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id UUID PRIMARY KEY
);

-- 운영의 auth.uid()와 같은 자리에서 같은 값을 돌려준다. 테스트는 이 GUC로 로그인 사용자를 바꾼다.
CREATE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID $$;

CREATE TYPE user_role AS ENUM ('발주청', '감리단', '시공사');

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  full_name TEXT,
  role user_role NOT NULL,
  hq_division TEXT,
  branch_division TEXT
);

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  managing_hq TEXT NOT NULL,
  managing_branch TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.user_profiles(id)
);

CREATE TABLE public.project_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  UNIQUE (project_id, shared_with)
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_self ON public.user_profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

-- 운영 projects의 조회 정책 셋을 이름까지 그대로 옮겼다. 셋은 OR로 합쳐진다.
-- 사고 정책이 "프로젝트를 볼 수 있는가"를 projects RLS에 얹으므로, 이 재현이 곧 판정 기준이다.
CREATE POLICY "프로젝트_조회_통합정책" ON public.projects
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'::user_role
         AND (
           (up.hq_division = '본사' AND up.branch_division = '본사')
           OR up.hq_division IS NULL
           OR (up.branch_division LIKE '%본부' AND up.hq_division = projects.managing_hq)
           OR (up.hq_division = projects.managing_hq AND up.branch_division = projects.managing_branch)
         )
    )
  );

CREATE POLICY "projects_select_shared" ON public.projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_shares ps
       WHERE ps.project_id = projects.id AND ps.shared_with = auth.uid()
    )
  );

CREATE POLICY "프로젝트 조회 권한" ON public.projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = ANY (ARRAY['시공사'::user_role, '감리단'::user_role])
         AND up.id = projects.created_by
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.role = '발주청'::user_role
         AND up.hq_division = projects.managing_hq
         AND (up.branch_division IS NULL OR up.branch_division = projects.managing_branch)
    )
  );

-- 등록 화면용 anon 조회 정책. 사고 정책이 TO authenticated라 비로그인에 새어 나가지 않음을 함께 확인한다.
CREATE POLICY "anon_can_read_projects_for_registration" ON public.projects
  FOR SELECT TO anon USING (true);

CREATE POLICY projects_delete_owner ON public.projects
  FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY project_shares_select ON public.project_shares
  FOR SELECT USING (true);

GRANT SELECT ON public.user_profiles, public.project_shares TO anon, authenticated;
GRANT SELECT, DELETE ON public.projects TO authenticated;
GRANT SELECT ON public.projects TO anon;

-- Supabase는 public 스키마 기본 권한으로 anon·authenticated에 테이블 권한을 준다.
-- 마이그레이션에 GRANT가 없는 이유이며, 권한이 있어도 정책이 허용한 행만 오간다는 점을 함께 확인한다.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
