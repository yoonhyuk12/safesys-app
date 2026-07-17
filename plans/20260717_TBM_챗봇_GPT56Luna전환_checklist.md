# TBM 챗봇 GPT-5.6 Luna 전환 체크리스트

- [x] `OPENAI_API_KEY`와 `gpt-5.6-luna`를 사용한다.
- [x] Gemini 요청 형식을 OpenAI Chat Completions 형식으로 교체한다.
- [x] 기존 대화 기록과 `{ response }` 응답 계약을 유지한다.
- [x] OpenAI 오류와 빈 응답을 사용자 친화적으로 처리한다.
- [x] 챗봇 헤더에 `GPT-5.6 Luna`를 표시한다.
- [x] 변경 파일 ESLint와 전체 타입 검사를 통과한다.
