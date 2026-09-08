# 컨텍스트 노트 — AI 모델 화면 문구·폴백 중앙관리

## 결정

- 실제 호출 모델의 권위 있는 저장소는 `ai_model_settings`다. `DEFAULT_AI_MODELS`는 DB 조회 실패·마이그레이션 전 폴백이다.
- 2026-08-27 실측 DB. OpenAI 텍스트 기능은 모두 `gpt-5.6-luna`, 음성은 `tts-1`, Google은 `gemini-flash-lite-latest`.
- 화면 모델명은 `/api/ai/model` + `useAiModel`로만 표시한다. 클라이언트는 `ai-models.ts`(supabaseAdmin 동적 import)를 값으로 import하지 않는다.
- `useAiModel` 폴백은 API가 오기 전·실패 시에만 보인다. 예쁜 이름(`GPT-5.6 Luna`)은 API가 돌려주는 id(`gpt-5.6-luna`)와 깜빡이므로 id로 통일한다.
- 시드 SQL은 이미 적용된 이력이라 고치지 않는다. DB 값은 관리자 화면이 이미 갱신했다.

## 화면 인벤토리 (2026-08-27)

| 위치 | 현재 | 조치 |
|------|------|------|
| headquarters-inspection/page.tsx:3521 | `(GPT-4o mini)` 하드코딩 | `useAiModel('ai.headquarters-remarks')` |
| risk-assessment/WorkInputStep.tsx:464 | `RISK_AI_MODELS[0]` | `useAiModel('ai.risk-assessment')` |
| TBMChatBot.tsx | 폴백 `GPT-5.6 Luna` | `gpt-5.6-luna` |
| ProjectAssistantBot.tsx | 폴백 `GPT-5.6 Luna` | `gpt-5.6-luna` |
| TBMTelegramBroadcastModal.tsx | 폴백 `GPT-5.6 Luna` | `gpt-5.6-luna` |
| TBMSubmissionModal.tsx | 폴백 `GPT-5.4 nano` | `gpt-5.6-luna` |
| tbm-view, TBMSubmissionModal TTS | `powered by OpenAI TTS` | 유지 |
