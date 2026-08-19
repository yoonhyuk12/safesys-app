-- 요청사항 게시글에 조회수 컬럼과 증가용 RPC를 추가하는 마이그레이션

ALTER TABLE public.board_posts
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.board_posts.view_count IS
  '상세 화면을 연 횟수. increment_board_post_view()로만 증가하며 중복 조회는 걸러내지 않는다';

-- 조회수는 글쓴이가 아닌 사람도 올려야 하는데, board_posts의 UPDATE 정책은 작성자 본인만 허용한다.
-- 그래서 SECURITY DEFINER 함수로 이 컬럼만 증가시킨다.
-- 이 UPDATE는 board_posts의 BEFORE UPDATE 가드 트리거를 지나가지만
-- status도 title/content도 건드리지 않으므로 예외도, updated_at 변경도 발생하지 않는다.
CREATE OR REPLACE FUNCTION public.increment_board_post_view(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.board_posts
     SET view_count = view_count + 1
   WHERE id = p_post_id;
END;
$$;

COMMENT ON FUNCTION public.increment_board_post_view(UUID) IS
  '요청사항 게시글의 조회수를 1 올린다. 로그인 사용자만 호출할 수 있다.';

REVOKE EXECUTE ON FUNCTION public.increment_board_post_view(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.increment_board_post_view(UUID) TO authenticated;
