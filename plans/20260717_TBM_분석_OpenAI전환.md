# TBM 분석 OpenAI 전환 계획

- TBM 텔레그램 분석 라우트의 Gemini 호출만 OpenAI Chat Completions로 교체한다.
- 기존 프롬프트, 검증, 권한 확인, 청크 처리, 결과 스키마는 유지한다.
- AI 분석 시작 버튼 아래에 사용 모델명을 표시한다.
- 타입 검사와 대상 파일 ESLint로 검증한다.
