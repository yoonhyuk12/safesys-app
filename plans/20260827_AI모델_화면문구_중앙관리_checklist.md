# 체크리스트 — AI 모델 화면 문구·폴백 중앙관리

- [x] `DEFAULT_AI_MODELS` OpenAI 폴백을 현재 DB에 맞춤 (`gpt-4o-mini`·`gpt-5.4-nano` → `gpt-5.6-luna`, TTS `tts-1` 유지)
- [x] `DEFAULT_AI_MODELS` Google 폴백 3행을 `gemini-flash-lite-latest`로 맞춤 (검측 체크리스트, 작업계획서, 감독일지 분류)
- [x] 본부점검 모달 `(GPT-4o mini)` → `useAiModel('ai.headquarters-remarks', 'gpt-5.6-luna')`
- [x] 위험성평가 작업입력 `RISK_AI_MODELS[0]` 표시 → `useAiModel('ai.risk-assessment', RISK_AI_MODELS[0])`
- [x] 기존 `useAiModel` 폴백 문자열을 모델 id로 통일
- [x] TTS·감독일지 주석에서 특정 모델명 제거
- [x] `npm run lint` · `npx tsc --noEmit` 통과
