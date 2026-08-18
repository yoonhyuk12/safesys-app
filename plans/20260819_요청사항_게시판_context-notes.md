# 요청사항 게시판 컨텍스트 노트

## 2026-08-19 — 요구사항 확정

사용자 4문항 응답으로 확정했다. 네 번째 질문(프롬프트에 섞여 들어온 컨설팅 계약서 md 65행 코멘트)에는 답 대신 브라우저 디자인 피드백을 붙여 왔다 — 게시판 진입 버튼을 프로필 아바타 바로 좌측에 "게시판" 텍스트로 넣으라는 내용. 계약서 건은 이 저장소에 파일이 없고 별도 지시도 없으므로 범위 밖으로 둔다.

## 관리자 판정이 RLS로 불가능한 이유

`src/lib/admin-auth.ts`의 `isAdminEmail()`이 서버 전용 환경변수 `ADMIN_EMAILS`를 읽는다. Postgres RLS는 이 값을 볼 수 없다. 선택지는 두 가지였다.

1. `user_profiles.is_admin` 같은 컬럼을 추가해 RLS가 읽게 한다 → 관리자 목록이 env와 DB 두 곳에 존재해 드리프트가 생긴다.
2. 관리자 동작만 service-role API 라우트로 뺀다 → 기존 `/api/admin/*` 패턴과 동일, 복제 없음.

2번을 택했다. 대신 `requireAdmin()`이 `amr: otp`를 강제하므로 관리자는 `/admin` 인증번호 로그인 세션이어야 조정할 수 있다. 이건 기존 관리자 기능과 동일한 제약이라 새로 생긴 부담이 아니다.

## status 변경 방어를 트리거로 둔 이유

작성자에게 UPDATE를 열어주면 `status` 컬럼도 같이 열린다. RLS 정책만으로는 "이 컬럼만 못 바꾼다"를 표현할 수 없다(Postgres에 컬럼 단위 RLS가 없다). `BEFORE UPDATE` 트리거에서 `auth.uid() IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status`면 예외를 던진다. service-role은 `auth.uid()`가 NULL이라 통과한다.

## 투표 테이블을 하나로 합친 이유

`board_votes` 한 테이블에 `post_id` / `comment_id`를 두고 XOR CHECK로 정확히 하나만 채우게 했다. 테이블 두 개로 나누면 트리거·정책·인덱스가 전부 두 벌이 된다. NULL은 UNIQUE 제약에서 서로 구별되므로 복합 UNIQUE가 아니라 **부분 유니크 인덱스** 두 개로 1인 1표를 강제해야 한다 — 여기가 실수하기 쉬운 지점이다.

## 카스케이드 삭제 시 트리거 동작

게시글을 지우면 댓글·투표가 CASCADE로 먼저 지워지고, 그 삭제가 카운터 트리거를 깨워 이미 삭제 예정인 게시글 행을 UPDATE한다. 같은 명령 안에서 UPDATE 후 DELETE는 정상 동작이므로 그대로 둔다.

## 진입 버튼 위치

`src/components/Dashboard.tsx:4993` 아바타 버튼(`w-9 h-9 rounded-full bg-blue-600`)을 감싼 `<div className="relative" ref={userMenuRef}>` **바로 앞**에 넣는다. 헤더는 이 파일 한 곳뿐이라(`grep -n "<header"` 결과 1건) 버튼 하나로 전 페이지에 적용된다.

## 2026-08-19 — 리뷰에서 잡은 버그. 추천만 눌러도 "(수정됨)"이 붙는 문제

Worker A가 쓴 초안은 `board_posts`의 BEFORE UPDATE 트리거에서 무조건 `NEW.updated_at = NOW()` 를 했다. 그런데 투표 카운터 트리거와 댓글 수 트리거가 같은 행을 UPDATE하기 때문에, **추천을 누르거나 댓글이 달릴 때마다 게시글의 updated_at 이 올라간다.** 화면은 `updated_at !== created_at` 으로 "(수정됨)"을 판정하므로 아무도 수정하지 않은 글에 수정 표시가 붙는다.

수정. 제목이나 본문이 실제로 바뀔 때만 `updated_at` 을 올린다(`IS DISTINCT FROM`). 댓글 트리거도 `content` 변경 시에만 올린다.

교훈. 비정규화 카운터를 트리거로 유지하면 그 UPDATE가 다른 BEFORE UPDATE 트리거를 깨운다. 카운터와 타임스탬프를 같은 테이블에서 함께 관리할 땐 항상 이 상호작용을 확인해야 한다.

## 2026-08-19 — status 가드의 service_role 판정 이중화

가드 트리거는 원래 `auth.uid() IS NOT NULL` 하나로 "일반 사용자"를 판별했다. MCP로 `SELECT auth.uid(), auth.role()` 을 실행해 JWT 클레임이 없을 때 둘 다 NULL 임을 확인했지만, service_role 키의 클레임 구성에만 의존하는 건 취약하다. `AND COALESCE(auth.role(), '') <> 'service_role'` 을 덧붙여 어느 쪽이든 관리자 경로가 막히지 않게 했다.

## 2026-08-19 — 배포 순서 주의

`main` 푸시는 Vercel 운영 배포다. 테이블이 없는 상태로 배포하면 `/board` 가 즉시 깨진다. **사용자가 SQL 을 실행한 뒤에 푸시해야 한다.** 커밋까지만 해 두고 푸시는 보류했다.
