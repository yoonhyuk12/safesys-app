# 관리자 페이지 컨텍스트 노트

- 프로필 테이블은 `public.user_profiles`(1,079행)다. `profiles`라는 별도 테이블은 없다. `is_admin` 컬럼 없음 → 관리자 판별은 `ADMIN_EMAILS` env 허용목록(서버 전용)으로 결정.
- DDL 마이그레이션은 MCP가 읽기 전용이라 사용자 실행이 필요 → env 방식 선택으로 차단 요인 제거. 추후 `is_admin` 컬럼 전환 가능.
- 인증 API 패턴은 `/api/projects/[id]/delete/route.ts`를 표준으로 삼음 — Bearer 토큰 → `supabaseAdmin.auth.getUser(token)` → 권한 확인. 클라이언트는 `supabase.auth.getSession()`의 `access_token`을 Authorization 헤더로 전송.
- `projects.is_active`는 boolean 또는 분기별 JSONB 객체 두 형태가 공존한다(architecture.md). 프로젝트 현황 집계 시 두 형태 모두 처리해야 함.
- 프로젝트 삭제는 Storage 사진 정리를 포함하는 기존 `/api/projects/[id]/delete` POST를 재사용한다. 직접 `projects` DELETE 금지.
- 사용자 목록은 `supabaseAdmin.auth.admin.listUsers`(email_confirmed_at·last_sign_in_at) + `user_profiles` 병합으로 구성. 이메일 인증 처리는 `auth.admin.updateUserById(id, { email_confirm: true })`.
- UI 선호(사용자 피드백): 흰 배경, 내용물 맞춤 폭, 컴팩트 디자인.
- 워커는 사용자 지시로 GPT(codex)를 사용. Orca 오케스트레이션(run→task→worker-start→check --wait)으로 병렬 진행. 같은 워크트리에서 파일 소유 영역을 분리(A: `*/admin/users*`, B: `*/admin/projects*`)해 충돌 방지.
- 전용 admin 계정을 Admin API로 직접 생성했다(회원가입 화면 미사용, 사용자 지시). admin@umusun.com, user_profiles 제약 두 개를 만족시켜야 했다 — phone_number NOT NULL, check_division_for_client(발주청은 hq_division 필수). 전사 조회 권한을 위해 경기/경기본부(본부급) 부여.
- 사용자 지시로 admin은 매 로그인마다 이메일 인증번호(OTP) 입력 필수. 구현 방식은 Supabase signInWithOtp/verifyOtp + JWT amr에 otp 존재를 requireAdmin에서 서버 강제. 비밀번호 로그인만으로는 관리자 API 403.
- 주의: 인증번호 숫자가 메일에 표시되려면 Supabase 대시보드의 Magic Link 이메일 템플릿에 {{ .Token }}이 있어야 한다. 기본 템플릿이면 링크만 온다. 대시보드 확인은 사용자 몫.
- admin@umusun.com 메일함 실수신 가능 여부는 미확인 — 불가 시 ADMIN_EMAILS의 sales@umusun.com으로 로그인(계정 생성 필요) 또는 이메일 교체.
