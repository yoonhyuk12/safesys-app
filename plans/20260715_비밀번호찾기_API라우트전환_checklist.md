# 체크리스트 — 비밀번호 찾기 API 라우트 전환

- [x] `/api/auth/update-password` 라우트 신규 작성 (입력 검증 + 3요소 본인확인 + updateUserById)
- [x] `FindPasswordModal.tsx` — Edge Function invoke + temp_password fallback 제거, 새 라우트 호출
- [x] `npm run lint` 통과
- [x] `npx tsc --noEmit` 통과
- [x] 커밋 (fix)
- [ ] 배포 후 실서비스에서 비밀번호 변경 성공 확인 (사용자)
- [ ] 구 Edge Function `update-user-password` 삭제 여부 결정 (사용자)
