# 프로젝트 합치기(병합) 구현 체크리스트

계획서: `plans/20260629_프로젝트합치기.md`

- [x] 계획 산출물(checklist·context-notes) 생성
- [x] `database/migrations/add_merge_projects_function.sql` 작성 (RPC + revoke + service_role grant)
- [x] 마이그레이션 v1 적용됨 (사용자 실행) — 단 레거시 TBM 누락 버그 있었음
- [x] 인시던트 복구 — 합치기 v1로 사라진 사리현 TBM 75건 재연결(2026-06-29)
- [x] RPC 보완 — 레거시 NULL project_id TBM도 이전(`moved_legacy_tbm`)
- [ ] **보완된 마이그레이션 재실행** — 사용자가 Supabase 콘솔에서 `add_merge_projects_function.sql` 다시 실행(create or replace)
- [ ] 재적용 전까지 "합치기" 버튼 사용 금지
- [x] `src/app/api/projects/merge/route.ts` 작성 (인증·발주청 권한·UUID 검증·RPC 호출·폐기건수 반환)
- [x] `src/components/project/MergeProjectsModal.tsx` 작성 (확인 단계 필수: 삭제/유지 명시 + 겹치는 작업일보 경고)
- [x] Dashboard 합치기 버튼 추가(플로팅 컨테이너 첫 자식, 발주청 게이팅) + 모달 state·렌더 연결
- [x] 병합 후 `loadBranchProjects()`로 목록 새로고침 연결
- [ ] 검증: 테스트용 두 프로젝트 병합 → 자식 이전·source 삭제·충돌 폐기 확인 (마이그레이션 적용 후)
- [ ] `npm run lint` 통과 / 빌드 확인(사용자 동의 후)
