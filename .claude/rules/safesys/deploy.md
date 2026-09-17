# 배포 — main 푸시는 즉시 운영 반영

- `git push origin main`은 Vercel 자동 프로덕션 배포를 유발한다. main 푸시는 곧 운영 반영임을 인지하고 진행한다.
- `npm run build` 프로덕션 빌드는 사용자 동의 없이 시작하지 않는다. 검증은 `npm run lint`와 `npx tsc --noEmit`으로 한다.
- 모든 명령어는 `safesys-app` 디렉터리에서 실행한다.

상세 → [docs/environment.md](../../../docs/environment.md#배포--main-푸시--자동-배포-중요)
