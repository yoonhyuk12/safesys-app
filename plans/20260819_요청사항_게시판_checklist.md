# 요청사항 게시판 체크리스트

## 설계 (Advisor)
- [x] 요구사항 확정 (범위·기능·권한·진입점)
- [x] 관리자 권한 모델 조사 (ADMIN_EMAILS + amr otp)
- [x] 헤더 앵커 특정 (`Dashboard.tsx` 아바타 버튼)
- [x] 공용 타입 계약 작성 (`src/lib/board/types.ts`)
- [x] 계획·체크리스트·컨텍스트 노트 산출

## Worker A — DB · 데이터 계층
- [x] `database/20260819-1100_요청사항_게시판.sql` 작성
- [x] `src/lib/board/queries.ts` 구현

## Worker B — UI
- [x] `/board` 목록 (데스크탑 테이블 / 모바일 카드)
- [x] `/board/new` 작성, `/board/[id]/edit` 수정
- [x] `/board/[id]` 상세 + 댓글 + 투표
- [x] 반응형 확인 (≤640px / ≥1024px)

## Worker C — 진입 · 관리자
- [x] Dashboard 헤더 "게시판" 버튼 (아바타 바로 좌측)
- [x] `POST /api/board/moderate` 라우트
- [x] `src/lib/board/admin.ts` 클라이언트 헬퍼

## 검증 (Advisor)
- [x] `npx tsc --noEmit` — 오류 0건
- [x] `npm run lint` — 오류 0건, 게시판 파일 경고 0건
- [x] diff 직접 확인 (Dashboard.tsx 변경 11줄뿐)
- [x] SQL 리뷰에서 `updated_at` 오탐 버그 수정
- [x] 의미 단위 커밋
- [ ] **사용자가 SQL 실행** — 실행 전에는 푸시(=운영 배포) 금지
- [ ] 운영 배포 후 실동작 확인
