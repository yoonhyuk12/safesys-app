-- 순회점검 금주 점검 테마(회사 공통, 주 단위)와 기록별 적용 테마 컬럼을 추가한다.
-- 배경: 안전현황 대시보드의 "공사감독 순회점검" 카드 상단에서 본부급 발주청이 금주 점검 테마를 정하고,
--       현장의 순회점검 작성 화면은 그 테마를 "주요 테마" 칸에 미리 채워 AI 점검항목(테마 5건)에 반영한다.
-- 범위: 테마는 본부별이 아니라 회사 공통 한 건이다(week_start = 그 주 월요일, Asia/Seoul 기준).
-- 적용 순서: 20260917-1700 → 1701 → 1800 → 이 파일
-- 적용 방법: Supabase 콘솔 → SQL Editor 에서 아래 전체를 실행

BEGIN;

CREATE TABLE IF NOT EXISTS public.patrol_ledger_weekly_themes (
  week_start DATE PRIMARY KEY,
  theme TEXT NOT NULL CHECK (BTRIM(theme) <> '' AND LENGTH(theme) <= 200 AND theme !~ '[\r\n]'),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.patrol_ledger_weekly_themes ENABLE ROW LEVEL SECURITY;

-- 정책이 참조하므로 함수를 먼저 만든다.
CREATE OR REPLACE FUNCTION public.patrol_ledger_is_hq_level_client()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
     WHERE up.id = auth.uid()
       AND up.role = '발주청'
       AND (
         up.hq_division IS NULL
         OR up.hq_division = '본사'
         OR up.branch_division IS NULL
         OR up.branch_division = '본사'
         OR up.branch_division LIKE '%본부'
       )
  );
$$;

-- 로그인 사용자는 누구나 읽는다. 현장 작성 화면이 미리 채우는 값이다.
DROP POLICY IF EXISTS "Users can view patrol ledger weekly themes" ON public.patrol_ledger_weekly_themes;
CREATE POLICY "Users can view patrol ledger weekly themes"
  ON public.patrol_ledger_weekly_themes FOR SELECT TO authenticated
  USING (true);

-- 본부급 이상 발주청(본사, 또는 branch_division이 '…본부')만 쓴다. 사고보고 권한과 같은 판정이다.
DROP POLICY IF EXISTS "HQ level client can write patrol ledger weekly themes" ON public.patrol_ledger_weekly_themes;
CREATE POLICY "HQ level client can write patrol ledger weekly themes"
  ON public.patrol_ledger_weekly_themes FOR ALL TO authenticated
  USING (public.patrol_ledger_is_hq_level_client())
  WITH CHECK (public.patrol_ledger_is_hq_level_client() AND updated_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrol_ledger_weekly_themes TO authenticated;
GRANT ALL ON public.patrol_ledger_weekly_themes TO service_role;

COMMENT ON TABLE public.patrol_ledger_weekly_themes IS
  '순회점검 금주 점검 테마. 회사 공통으로 주(월요일 시작)마다 한 건이며 본부급 이상 발주청만 쓴다.';
COMMENT ON FUNCTION public.patrol_ledger_is_hq_level_client() IS
  '현재 사용자가 본부급 이상 발주청(본사 또는 …본부 소속)인지 판단한다. 주간 테마 쓰기 정책 전용이다.';

-- 기록에 어떤 테마로 점검항목을 만들었는지 남긴다. 빈 문자열은 테마 없이 만든 기록이다.
ALTER TABLE public.patrol_ledger_inspections
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT '';
ALTER TABLE public.patrol_ledger_inspections
  DROP CONSTRAINT IF EXISTS patrol_ledger_inspections_theme_check;
ALTER TABLE public.patrol_ledger_inspections
  ADD CONSTRAINT patrol_ledger_inspections_theme_check
  CHECK (LENGTH(theme) <= 200 AND theme !~ '[\r\n]');
GRANT UPDATE (theme) ON public.patrol_ledger_inspections TO authenticated;
COMMENT ON COLUMN public.patrol_ledger_inspections.theme IS
  '점검항목 생성에 쓴 주요 테마(한 줄, 200자 이하). 금주 점검 테마를 기본값으로 채우되 작성자가 고칠 수 있다.';

COMMIT;
