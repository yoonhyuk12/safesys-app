# 컨텍스트 노트 — 프로젝트 현장 AI 비서 챗봇

## 결정과 근거

- **모델 gpt-5.6-luna 확정.** 사용자가 "GTP-5.6 luna"로 요청 → 웹 검색으로 실존 확인(2026-07-09 GA, OpenAI 3-tier 중 최저가·고속). 이미 `src/app/api/chat/tbm/route.ts:8`에서 사용 중이라 키·모델 모두 운영 검증됨. Vercel에 OPENAI_API_KEY 등록돼 있어 env 작업 불필요.
- **신규 라우트/컴포넌트 분리(A안).** 대시보드 TBM 챗봇은 전사 통계용이라 프로젝트 비서와 역할이 다름. 기존 코드에 모드 분기를 섞으면 회귀 위험 → 복제·개조로 결정.
- **하이브리드 데이터 접근.** 사용자 선택. 브리핑(오늘 TBM + 감독 미서명)은 매 요청 시스템 프롬프트에 주입, 그 외 질문은 `query_project_table` 단일 함수 tool calling(화이트리스트 + 서버 측 project_id 강제).
- **인증 추가.** 기존 chat/tbm은 무인증이지만 이 라우트는 projectId 임의 지정으로 service role 조회가 가능하므로 Supabase 액세스 토큰 검증(401)을 넣기로 함. 설계 승인에 포함됨.
- **서명 컬럼 제거.** 서명·사진 컬럼은 base64라 토큰 폭발 → 도구 응답에서 signature/photo/image 포함 컬럼 제거, 긴 문자열 300자 절단.
- **레거시 TBM 호환.** tbm_submissions 레거시 행은 project_id NULL + 이름 매칭(memory: project_tbm_legacy_null_project_id) → 오늘 TBM 조회는 or 조건으로 처리.
- **미서명 상세는 신규 서버 모듈.** `bulk-sign-counts.ts`는 브라우저 anon 클라이언트에 결합돼 있어 수정하지 않고, admin 클라이언트를 주입받는 `unsigned-supervisor-details.ts`를 새로 만든다(외과적 변경 원칙).
- **오케스트레이션.** 사용자 지시로 Fable이 기획·검증, codex CLI가 백엔드, grok CLI가 프론트엔드 구현. API 계약을 먼저 고정해 병렬 진행.
- **푸시 보류.** 사용자가 "승인, 푸시는 보류" 선택 → 커밋까지만, main 푸시는 별도 확인.

## 진행 로그

- 2026-07-20 설계 승인(플로팅 버튼·하이브리드). 계획서 3종 작성.
- 2026-07-20 Orca 오케스트레이션 디스패치. grok(프론트) 완료·검증 통과 — 히스토리에 현재 질문 중복 포함 1건만 Advisor가 직접 수정. codex(백엔드)는 dispatch --inject 시 프롬프트가 붙여넣기만 되고 제출되지 않는 문제 발견 → `terminal send --enter`로 수동 제출 후 정상 착수(같은 증상 재발 시 참고).
- 2026-07-20 codex 완료. Advisor 검증 — 계약(401/400/404, project_id 강제, 서명·사진 컬럼 제거, 도구 루프 5회, 레거시 TBM 이름 매칭) 전부 준수. 날짜 컬럼 맵을 information_schema로 실검증해 전부 일치 확인, headquarters_inspections만 inspection_date 맵에 추가(점검일 기준 원칙). tsc exit 0, eslint 신규 0건. 커밋 완료(0235a2f), main 푸시는 사용자 확인 대기.
- 2026-07-20 사용자 디자인 피드백. "TBM 안전활동 점검표는 서명 누락 건에서 제외" → bulk-sign-targets.ts supervisor 대상에서 tbm_safety_inspection 항목 제거. 일괄서명 모달·펜통 뱃지·챗봇 미서명 브리핑이 같은 레지스트리를 쓰므로 세 곳 모두 일관 제외됨. unsigned-supervisor-details의 tbm_date 맵 줄도 함께 정리.
- 2026-07-20 사용자 디자인 피드백 2. 감독 일괄서명 모달을 조회 전용으로 전환 — BulkSignModal에 VIEW_ONLY_SIGNERS(['supervisor']) 도입. 닫기 외 조작(체크박스·전체선택·새로고침·서명하기) 시 가운데 "현재는 조회만 가능합니다" 토스트 1.8초 표시. 시공사(contractor) 모달은 기존대로 서명 가능. 되돌리려면 VIEW_ONLY_SIGNERS를 빈 배열로. 후속 요청으로 서명하기 버튼은 항상 disabled 처리.
- 2026-07-20 사용자 디자인 피드백 3. TBM AI 분석 모달 헤더("사용 모델" 라벨 왼쪽)에 엑셀 다운로드 버튼 — grok 워커가 tbm-telegram-analysis-export.ts(ExcelJS, 11컬럼, TBM_AI분석결과_날짜.xlsx) 신규 작성 + 모달 버튼 추가. Advisor 검증·tsc·eslint 통과.
