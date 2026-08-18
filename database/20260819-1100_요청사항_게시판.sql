-- 요청사항 게시판의 게시글·댓글·투표 테이블과 권한·집계 트리거를 추가하는 마이그레이션

CREATE TABLE public.board_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  content TEXT NOT NULL CHECK (BTRIM(content) <> ''),
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '접수' CHECK (status IN ('접수', '검토중', '반영완료', '보류')),
  upvotes INT NOT NULL DEFAULT 0,
  downvotes INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.board_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.board_posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (BTRIM(content) <> ''),
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  upvotes INT NOT NULL DEFAULT 0,
  downvotes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.board_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.board_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.board_comments(id) ON DELETE CASCADE,
  vote SMALLINT NOT NULL CHECK (vote IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL))
);

CREATE UNIQUE INDEX idx_board_votes_post
  ON public.board_votes(user_id, post_id)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX idx_board_votes_comment
  ON public.board_votes(user_id, comment_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX idx_board_posts_created_at
  ON public.board_posts(created_at DESC);

CREATE INDEX idx_board_comments_post
  ON public.board_comments(post_id, created_at);

ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view board posts"
  ON public.board_posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own board posts"
  ON public.board_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own board posts"
  ON public.board_posts FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete their own board posts"
  ON public.board_posts FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Authenticated users can view board comments"
  ON public.board_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own board comments"
  ON public.board_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own board comments"
  ON public.board_comments FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete their own board comments"
  ON public.board_comments FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Users can view their own board votes"
  ON public.board_votes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own board votes"
  ON public.board_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own board votes"
  ON public.board_votes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own board votes"
  ON public.board_votes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_board_post_status_and_update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 관리자 목록은 서버 전용 env(ADMIN_EMAILS)에 있어 RLS로 판별할 수 없다.
  -- 그래서 상태 변경은 service-role API(/api/board/moderate)에서만 통과시킨다.
  -- service-role 호출은 JWT에 sub가 없어 auth.uid()가 NULL이며, role 클레임으로 한 번 더 확인한다.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION '처리 상태는 관리자만 변경할 수 있습니다';
  END IF;

  -- 투표·댓글 카운터 트리거도 이 행을 UPDATE하므로, 본문이 실제로 바뀔 때만 수정 시각을 올린다.
  -- 그러지 않으면 추천만 눌러도 화면에 "(수정됨)"이 붙는다.
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER board_posts_before_update_trigger
  BEFORE UPDATE ON public.board_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_board_post_status_and_update_timestamp();

CREATE OR REPLACE FUNCTION public.update_board_comment_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 투표 카운터 트리거도 이 행을 UPDATE하므로, 내용이 실제로 바뀔 때만 수정 시각을 올린다.
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER board_comments_before_update_trigger
  BEFORE UPDATE ON public.board_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_board_comment_timestamp();

CREATE OR REPLACE FUNCTION public.update_board_vote_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.board_posts
         SET upvotes = GREATEST(0, upvotes - CASE WHEN OLD.vote = 1 THEN 1 ELSE 0 END),
             downvotes = GREATEST(0, downvotes - CASE WHEN OLD.vote = -1 THEN 1 ELSE 0 END)
       WHERE id = OLD.post_id;
    ELSE
      UPDATE public.board_comments
         SET upvotes = GREATEST(0, upvotes - CASE WHEN OLD.vote = 1 THEN 1 ELSE 0 END),
             downvotes = GREATEST(0, downvotes - CASE WHEN OLD.vote = -1 THEN 1 ELSE 0 END)
       WHERE id = OLD.comment_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.board_posts
         SET upvotes = upvotes + CASE WHEN NEW.vote = 1 THEN 1 ELSE 0 END,
             downvotes = downvotes + CASE WHEN NEW.vote = -1 THEN 1 ELSE 0 END
       WHERE id = NEW.post_id;
    ELSE
      UPDATE public.board_comments
         SET upvotes = upvotes + CASE WHEN NEW.vote = 1 THEN 1 ELSE 0 END,
             downvotes = downvotes + CASE WHEN NEW.vote = -1 THEN 1 ELSE 0 END
       WHERE id = NEW.comment_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER board_votes_update_counts_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.board_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_board_vote_counts();

CREATE OR REPLACE FUNCTION public.update_board_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.board_posts
       SET comment_count = comment_count + 1
     WHERE id = NEW.post_id;
    RETURN NEW;
  END IF;

  UPDATE public.board_posts
     SET comment_count = GREATEST(0, comment_count - 1)
   WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER board_comments_update_count_trigger
  AFTER INSERT OR DELETE ON public.board_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_board_comment_count();

COMMENT ON TABLE public.board_posts IS '전체 사용자가 공유하는 요청사항 게시글';
COMMENT ON COLUMN public.board_posts.author_id IS '게시글 작성자 계정. 계정 삭제 시 NULL로 보존';
COMMENT ON COLUMN public.board_posts.author_name IS '게시글 작성 시점의 표시 이름 스냅샷';
COMMENT ON COLUMN public.board_posts.status IS '관리자만 변경하는 처리 상태';
COMMENT ON COLUMN public.board_posts.upvotes IS '투표 트리거가 유지하는 추천 수';
COMMENT ON COLUMN public.board_posts.downvotes IS '투표 트리거가 유지하는 비추천 수';
COMMENT ON COLUMN public.board_posts.comment_count IS '댓글 트리거가 유지하는 댓글 수';

COMMENT ON TABLE public.board_comments IS '요청사항 게시글에 달린 댓글';
COMMENT ON COLUMN public.board_comments.post_id IS '댓글이 속한 게시글';
COMMENT ON COLUMN public.board_comments.author_id IS '댓글 작성자 계정. 계정 삭제 시 NULL로 보존';
COMMENT ON COLUMN public.board_comments.author_name IS '댓글 작성 시점의 표시 이름 스냅샷';
COMMENT ON COLUMN public.board_comments.upvotes IS '투표 트리거가 유지하는 추천 수';
COMMENT ON COLUMN public.board_comments.downvotes IS '투표 트리거가 유지하는 비추천 수';

COMMENT ON TABLE public.board_votes IS '게시글 또는 댓글에 대한 사용자별 추천·비추천';
COMMENT ON COLUMN public.board_votes.user_id IS '투표한 사용자 계정';
COMMENT ON COLUMN public.board_votes.post_id IS '게시글 투표 대상. 댓글 투표이면 NULL';
COMMENT ON COLUMN public.board_votes.comment_id IS '댓글 투표 대상. 게시글 투표이면 NULL';
COMMENT ON COLUMN public.board_votes.vote IS '추천은 1, 비추천은 -1';
