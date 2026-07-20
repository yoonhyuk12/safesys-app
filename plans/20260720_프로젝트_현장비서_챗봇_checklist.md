# 체크리스트 — 프로젝트 현장 AI 비서 챗봇

- [x] 컨텍스트 조사(페이지 구조·TBM 모델·미서명 레지스트리·기존 AI 라우트)
- [x] 모델 실존 확인(gpt-5.6-luna, 기존 chat/tbm에서 사용 중)
- [x] 사용자 결정(플로팅 버튼·하이브리드·푸시 보류) 확보
- [x] 계획서·API 계약 고정
- [x] codex 브리프 작성·Orca 디스패치 (task_b5acda42c152) — 백엔드 라우트 + unsigned-details 모듈
- [x] grok 브리프 작성·Orca 디스패치 (task_d5349389b58c) — ProjectAssistantBot + 페이지 장착
- [x] grok worker_done 수신 — 프론트엔드 완료, Fable diff 검증 통과(히스토리 중복 1건 직접 수정)
- [x] codex worker_done 수신 — 백엔드 완료, Fable diff 검증 통과
- [x] Fable diff 검증(계약 준수·project_id 강제·서명 컬럼 제거·DB 스키마 대조) — headquarters_inspections 날짜 컬럼 1줄 보완
- [x] npx tsc --noEmit 통과 (exit 0)
- [x] eslint 통과 — 신규 파일 0건, 경고 8건은 page.tsx 기존 코드
- [x] docs/architecture.md에 신규 API 라우트 반영
- [ ] 의미 단위 커밋
- [ ] (보류) 사용자 확인 후 main 푸시 = 운영 배포
