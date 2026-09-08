# 체크리스트 — AI 호출 기록·토큰 집계

## 1단계 · DB와 로거

- [x] `database/20260828-1100_ai_usage_logs.sql` 작성 (ai_usage_logs 생성 + ai_model_settings 단가 컬럼 2개 추가)
- [x] `src/lib/ai-usage-log.ts` 작성 — `extractUsage`, `recordAiUsage`
- [x] `ai-models.ts`의 `AiModelSetting`에 단가 필드 추가

## 2단계 · 라우트 기록 삽입 (21곳)

OpenAI 계열
- [x] ai/translate
- [x] ai/tts (translate + speech 2건)
- [x] ai/tbm-safety-advice
- [x] ai/ptw-work-summary
- [x] ai/ptw-risk-analysis
- [x] ai/headquarters-remarks
- [x] ai/extract-equipment-count
- [x] ai/daily-inspection
- [x] ai/ocr-card
- [x] ai/write-risk-analysis
- [x] ai/supervisor-summary (remarks)
- [x] chat/project-assistant (user_id·project_id 포함)
- [x] chat/tbm (project_id 포함)
- [x] tbm-telegram/analyze (project_id 포함)

Google 계열
- [x] ai/inspection-checklist
- [x] ai/work-plan
- [x] ai/supervisor-summary (classify)
- [x] ai/risk-assessment
- [x] ai/risk-classify (user_id 포함)
- [x] ai/risk-row (user_id 포함)
- [x] ai/tbm-risk-link (user_id 포함)

## 3단계 · 집계 API와 화면

- [ ] `api/admin/ai-usage/logs/route.ts` GET — 기간 필터·기능별·모델별 집계
- [ ] `api/admin/ai-usage/route.ts` PATCH에 단가 2필드 추가
- [ ] `admin/ai-usage/page.tsx` 탭 분리 — 「모델 설정」 / 「사용 기록」
- [ ] 모델 설정 탭에 단가 입력 칸 2개

## 4단계 · 검증

- [x] `npx tsc --noEmit` 무오류
- [x] `npm run lint` 무오류
- [x] 마이그레이션 미적용 상태에서 AI 기능 정상 동작 확인 (코드 논증)
- [ ] 사용자에게 마이그레이션 SQL 실행 요청
- [ ] 실행 후 관리자 화면 집계 확인
- [ ] 커밋
