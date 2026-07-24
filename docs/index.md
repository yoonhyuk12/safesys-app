<!-- SafeSys 지식 베이스 목차 — CLAUDE.md(map)가 가리키는 기록 시스템의 진입점 -->
# SafeSys 지식 베이스 (Knowledge Base)

이 디렉터리는 SafeSys의 **기록 시스템(system of record)** 이다. `CLAUDE.md`는 얇은 목차(map)이고, 실제 상세 지식은 여기에 카테고리별로 분리·색인되어 있다. 에이전트는 작은 진입점에서 시작해 필요한 문서만 열어 점진적으로 컨텍스트를 확보한다.

> 원칙. 하나의 큰 지침 파일 대신 목차 + 분리 문서. 문서가 코드 동작과 어긋나면 그것은 버그다 — 발견 즉시 갱신한다.

## 문서 지도

| 문서 | 다루는 내용 | 언제 여는가 |
|------|-------------|-------------|
| [architecture.md](./architecture.md) | 기술 스택, Dashboard 중심 라우팅, 라우트/ API 구조, 컴포넌트·유틸·타입 | 코드 위치를 찾을 때, 뷰 전환/데이터 로딩 흐름을 이해할 때 |
| [conventions.md](./conventions.md) | Advisor/Worker 역할 분담, 행동 가이드라인 10개, 코딩 스타일(불변성·파일구성·에러처리) | 작업 착수 전 항상, 새 파일/커밋 작성 시 |
| [database.md](./database.md) | 주요 테이블, `ON DELETE CASCADE` 규칙, 일괄서명 등록 규칙, 마이그레이션 규칙, Supabase MCP | 새 테이블/서류/서명 기능을 추가할 때 |
| [auth.md](./auth.md) | 역할 체계(발주청·감리단·시공사), 조직 구조, 접근 권한 패턴, 인증 플로우 | 권한/RLS/조직 계층을 다룰 때 |
| [environment.md](./environment.md) | 개발 명령어, main 푸시=자동 배포, 환경 변수, API 키 위치 | 빌드/배포/env 설정을 만질 때 |
| [troubleshooting.md](./troubleshooting.md) | 빌드 캐시, 프로필 미동기화, 권한/지도 문제, html2canvas PDF 텍스트 버그 | 증상이 재현될 때 |

## 관련 위치 (리포 내 다른 기록)

- `plans/` — 계획서(일급 아티팩트). 파일명 `YYYYMMDD_주제.md`. 진행 중·완료·기술부채가 버전 관리된다.
- `database/*.sql` — SQL 마이그레이션. 파일명 `YYYYMMDD-HHMM_설명.sql`로 적용 순서 정렬.
- `.claude/rules/` — 이식형 룰셋(공통+언어별). 이 프로젝트의 canonical 규칙은 [conventions.md](./conventions.md)이며 rules는 그 미러다.
- `.claude/skills/hwpx-authoring/` — HWPX(한글문서) 생성 참조 스킬. 새 HWPX 다운로드 기능 추가나 hwpx가 한글에서 안 열리는 문제를 다룰 때 연다 (OWPML 패키지 구조, hp:pic 필수 구조, 떠 있는 그림 좌표, 검증 루프).
- `.claude/docs/` — 별도 운영 가이드(TROUBLESHOOTING, 보안/롱폼 가이드 등).
