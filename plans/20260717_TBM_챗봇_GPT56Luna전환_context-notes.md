# TBM 챗봇 GPT-5.6 Luna 전환 컨텍스트 노트

- 변경 범위는 `src/app/api/chat/tbm/route.ts`와 `src/components/ui/TBMChatBot.tsx`다.
- 현재 라우트는 Gemini 3.5 Flash와 `GEMINI_API_KEY`를 직접 사용하므로 공급자 API 호출부와 응답 파싱을 함께 교체해야 한다.
- 공식 모델 ID는 `gpt-5.6-luna`이며 Chat Completions를 지원한다.
- 기존 프로젝트의 OpenAI 호출 패턴과 동일하게 `OPENAI_API_KEY`를 사용한다.
- 대화형 응답 지연과 추론 토큰 사용을 줄이기 위해 `reasoning_effort: 'none'`을 명시하고 `temperature`는 전달하지 않는다.
- 기존 Supabase 조회, 권한 범위 필터링, 프롬프트 내용, 클라이언트 API 경로와 `{ response }` 응답 형식은 변경하지 않는다.
