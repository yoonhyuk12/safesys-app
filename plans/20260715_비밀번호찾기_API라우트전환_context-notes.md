# 컨텍스트 노트 — 비밀번호 찾기 API 라우트 전환

## 진단 과정에서 확인된 사실 (2026-07-15)

- 전체 auth 사용자 1,023명. `listUsers()` 페이지네이션 가설은 함수 소스 확인으로 기각 — 함수는 `getUserById` 사용.
- 배포된 Edge Function 소스는 Management API(`/v1/projects/{ref}/functions/update-user-password/body`, ESZIP 번들)에서 추출. 리포에는 소스 없음.
- 판별 테스트. 실존 userId + 틀린 email → 'User not found'(키 사망 시나리오와 일치). 키가 정상이면 'Email mismatch'가 나와야 함. 이 테스트는 비밀번호 변경 전 단계에서 중단되므로 부작용 없음.
- `user_profiles.temp_password` 컬럼은 DB에 존재하지 않음(42703). 마이그레이션 이력에도 없음 — fallback은 처음부터 동작한 적 없음.
- 대상 사용자(id `04584e0a...`)의 `user_profiles.email`과 `auth.users.email` 정확히 일치(`yoonhyuk1@nate.com`) — 이메일 불일치 가설 기각.

## 설계 결정과 근거

- **userId를 클라이언트에서 받지 않는다.** 서버가 email+full_name+phone_number 3요소로 `user_profiles`를 조회해 id를 도출. 구 Edge Function의 "userId+email만 알면 타인 비밀번호 초기화 가능" 구멍을 막음.
- **전화번호 비교는 모달 1단계와 동일하게 저장 포맷 그대로(`010-1234-5678` 대시 포함) eq 비교.** DB에 대시 포함으로 저장돼 있음(실측 확인).
- **비밀번호 상한 72자.** bcrypt 72바이트 절단 한계.
- **레이트 리밋 미적용.** 프로젝트에 공용 레이트 리밋 인프라가 없고, 본 라우트의 인증 강도는 기존 모달 1단계(클라이언트 anon 조회)와 동일 수준 유지가 목표. 강화가 필요하면 별도 과제로.
- **모달 1단계(본인확인 UX)는 그대로 둠.** 외과적 변경 — 이번 요청은 "비밀번호 변경 실패" 수리.
- 메모리의 "Edge Function 자동 갱신 검증됨" 기록은 오류로 판명 → 메모리 정정 필요.

## 미결

- 구 Edge Function 삭제(또는 방치) 결정.
- 실서비스 검증은 배포 후 사용자가 직접 수행.

## 구현 및 검증 결과 (2026-07-15)

- `/api/auth/update-password`가 email+full_name+phone_number로 프로필 ID를 서버에서 다시 확인한 뒤 `auth.admin.updateUserById`를 호출하도록 구현.
- `FindPasswordModal.tsx`에서 Edge Function과 `temp_password` fallback을 제거하고 새 API 라우트 호출로 전환.
- 클라이언트와 서버 모두 비밀번호를 6~72자로 검증.
- `npm run lint` 성공. 기존 저장소 경고만 출력됐으며 신규 오류 없음.
- `npx tsc --noEmit` 성공.
- 로컬 API 무해 테스트 성공. 빈 본문은 400, 존재하지 않는 3요소 조합은 404 응답. 실제 비밀번호 변경 호출 없음.
