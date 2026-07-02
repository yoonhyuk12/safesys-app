-- 프로젝트 인계 함수 수정
-- 역할별 인계 권한:
--   - 발주청: 자기에게 보이는 모든 프로젝트 인계 가능 (관할 범위 내)
--   - 시공사/감리단: 자기가 생성한 프로젝트만 인계 가능

DROP FUNCTION IF EXISTS transfer_project_ownership(UUID, TEXT);

CREATE OR REPLACE FUNCTION transfer_project_ownership(
  p_project_id UUID,
  p_recipient_email TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient_id UUID;
  v_current_user_id UUID;
  v_current_user_role TEXT;
  v_current_user_hq TEXT;
  v_current_user_branch TEXT;
  v_project_creator_id UUID;
  v_project_hq TEXT;
  v_project_branch TEXT;
  v_can_transfer BOOLEAN := FALSE;
BEGIN
  -- 현재 사용자 ID 가져오기
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  -- 현재 사용자 프로필 조회
  SELECT role, hq_division, branch_division
  INTO v_current_user_role, v_current_user_hq, v_current_user_branch
  FROM user_profiles
  WHERE id = v_current_user_id;

  IF v_current_user_role IS NULL THEN
    RAISE EXCEPTION '사용자 프로필을 찾을 수 없습니다.';
  END IF;

  -- 프로젝트 정보 조회
  SELECT created_by, managing_hq, managing_branch
  INTO v_project_creator_id, v_project_hq, v_project_branch
  FROM projects
  WHERE id = p_project_id;

  IF v_project_creator_id IS NULL THEN
    RAISE EXCEPTION '프로젝트를 찾을 수 없습니다.';
  END IF;

  -- 권한 확인 로직
  IF v_current_user_role = '발주청' THEN
    -- 발주청: 관할 범위에 따른 권한 확인

    -- 1. 본사 조직 (전사 권한)
    IF v_current_user_hq = '본사' AND v_current_user_branch = '본사' THEN
      v_can_transfer := TRUE;

    -- 2. 본부가 지정된 경우
    ELSIF v_current_user_hq IS NOT NULL THEN
      -- 2-1. 본부 대표 지사 확인 (본부와 같은 이름의 지사 또는 첫 번째 지사)
      -- 예: 경기본부 -> 경기본부 지사
      IF v_current_user_branch IS NOT NULL AND
         (v_current_user_branch LIKE '%본부' OR v_current_user_branch = v_current_user_hq) THEN
        -- 본부 대표 지사: 해당 본부 전체 관할
        IF v_project_hq = v_current_user_hq THEN
          v_can_transfer := TRUE;
        END IF;
      ELSIF v_current_user_branch IS NOT NULL THEN
        -- 일반 지사: 해당 지사만 관할
        IF v_project_branch = v_current_user_branch THEN
          v_can_transfer := TRUE;
        END IF;
      ELSE
        -- 본부만 지정되고 지사 미지정: 해당 본부 전체 관할
        IF v_project_hq = v_current_user_hq THEN
          v_can_transfer := TRUE;
        END IF;
      END IF;

    -- 3. 본부 미지정 (관리자급 - 전사 권한)
    ELSE
      v_can_transfer := TRUE;
    END IF;

  ELSE
    -- 시공사/감리단: 프로젝트 생성자만 인계 가능
    IF v_current_user_id = v_project_creator_id THEN
      v_can_transfer := TRUE;
    END IF;
  END IF;

  -- 권한 확인 실패 시 에러
  IF NOT v_can_transfer THEN
    RAISE EXCEPTION 'only creator can transfer this project';
  END IF;

  -- 수신자 ID 조회
  SELECT id INTO v_recipient_id
  FROM user_profiles
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_recipient_email))
  LIMIT 1;

  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION '해당 이메일의 사용자를 찾을 수 없습니다.';
  END IF;

  -- 자기 자신에게 인계 방지
  IF v_recipient_id = v_current_user_id THEN
    RAISE EXCEPTION '본인에게 인계할 수 없습니다.';
  END IF;

  -- 프로젝트 소유권 변경
  UPDATE projects
  SET created_by = v_recipient_id,
      updated_at = NOW()
  WHERE id = p_project_id;

  -- 성공 로그
  RAISE NOTICE 'Project % transferred from % to % by % (role: %)',
    p_project_id, v_project_creator_id, v_recipient_id, v_current_user_id, v_current_user_role;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION transfer_project_ownership(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION transfer_project_ownership IS '프로젝트 소유권을 다른 사용자에게 인계합니다. 발주청은 관할 범위 내 모든 프로젝트, 시공사/감리단은 자기가 생성한 프로젝트만 인계 가능합니다.';
