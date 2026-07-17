# TBM 분석 OpenAI 전환 컨텍스트 노트

- 변경 범위는 `src/app/api/tbm-telegram/analyze/route.ts`의 AI 공급자 호출부다.
- Chat Completions의 `response_format: { type: 'json_object' }`를 사용하며 temperature는 지정하지 않는다.
- `TBMTelegramBroadcastModal.tsx`의 닫기 버튼 왼쪽에 현재 모델을 알리는 작은 보조 문구를 둔다.
- 결과 단계에서만 `lg:max-w-none`을 적용해 모바일과 대상 선택 단계의 폭은 유지한다.
- 결과 표는 최소 1200px 고정 레이아웃으로 두고 분석 요약에 27%, 메시지에 남은 폭을 배분한다.
- 결과 헤더에는 오늘 작업내용, 투입인원, 투입장비만 한글로 명시한다.
- 현장명 셀은 `project_name`, `managing_branch`, `projectCategory` 순서로 표시한다.
- 결과 표에서 소관사업은 현장명 셀에만 표시하고 별도 컬럼은 두지 않는다.
- 대상 선택 표에서는 현장명 헤더와 각 현장명 아래에 지사명을 괄호로 표시한다.
- 내부 API와 컴포넌트 이름은 유지하고 사용자 노출 문구에서만 텔레그램 명칭을 제거한다.
- 현재 개발 서버의 일반 텍스트 `Internal Server Error`는 `.next` 서버 번들 로드 실패로 확인했으며 캐시를 새로 빌드한다.
- 준비, 분석, 발송 요청은 공통 JSON 파서를 사용해 비정상 응답에서 원문 파싱 오류를 노출하지 않는다.
- 새 캐시에서 `/tbm`은 200으로 로드되고 인증 없는 세 API 요청은 모두 `application/json` 형식의 401을 반환한다.
- 브라우저 자동검증 CLI가 설치되어 있지 않아 실제 HTTP 응답과 빌드 산출물로 대체 검증한다.
- `.env.local`과 다른 AI 라우트는 수정하지 않는다.
