# 관리자 페이지 체크리스트

- [x] 계획·체크리스트·컨텍스트 노트 산출
- [x] 골격: `src/lib/admin-auth.ts` (requireAdmin)
- [x] 골격: `/api/admin/me` (관리자 여부 확인)
- [x] 골격: `/admin` 레이아웃(가드+탭 네비) · `/admin` → `/admin/users` 리다이렉트
- [x] 루트 리다이렉트: admin 로그인 시 `/admin` 자동 이동
- [x] `.env.local`에 `ADMIN_EMAILS` 추가 (admin@umusun.com, sales@umusun.com)
- [x] Orca Run·Task 생성, codex 워커 2개 병렬 dispatch
- [x] Worker A: `/api/admin/users` 목록 + 인증 처리·프로필 수정·삭제 API
- [x] Worker A: `/admin/users` 페이지 (검색·필터·통계·행 액션)
- [x] Worker B: `/api/admin/projects` 목록·집계 API
- [x] Worker B: `/admin/projects` 페이지 (집계 카드·목록·삭제)
- [x] worker_done 수신 후 diff 직접 검증 (A·B 완료, 스키마 FK/컬럼 대조 확인)
- [x] 전용 admin 계정 생성 (admin@umusun.com, 프로필 발주청/경기본부)
- [x] Worker C: admin 이메일 인증번호(OTP) 로그인 (`/admin-login`, amr 서버 강제) — 아이디 admin 방식, Orca 크래시로 잔여분은 Advisor 직접 마무리
- [x] `npx tsc --noEmit` · `npm run lint` 통과 (최종 통합 검증)
- [x] 의미 단위 커밋 (bb225c7)
- [x] Vercel에 ADMIN_EMAILS·ADMIN_LOGIN_ID·ADMIN_OTP_EMAIL 등록 완료
- [ ] Supabase Magic Link 이메일 템플릿에 `{{ .Token }}` 포함 여부 확인 (인증번호 표시용, 대시보드에서 사용자 확인 필요)
