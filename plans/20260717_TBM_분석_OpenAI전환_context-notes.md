# TBM 분석 OpenAI 전환 컨텍스트 노트

- 변경 범위는 `src/app/api/tbm-telegram/analyze/route.ts`의 AI 공급자 호출부다.
- Chat Completions의 `response_format: { type: 'json_object' }`를 사용하며 temperature는 지정하지 않는다.
- `TBMTelegramBroadcastModal.tsx`에는 현재 모델을 알리는 작은 보조 문구만 추가한다.
- `.env.local`과 다른 AI 라우트는 수정하지 않는다.
