# 컨텍스트 노트.

- 기존 cheerio·CSI 로그인·Bearer 인증·기기 자격증명 저장을 재사용한다. GitHub sQltRptList 검색에는 재사용 결과가 없었다. 새 라이브러리는 필요하지 않다.
- 자체시험 목록은 bizMngNo가 없으면 로그인에 성공해도 빈 목록이다. 사업별 현황에서 사업번호를 선택해야 한다.
- 사업 목록은 /cmq/qtcSelf/qltRptRslt/qltRptPerConstList.do, 시험 목록은 /cmq/qts/sQltRptList.do, 상세는 /cmq/qts/sQltRptView.do이다.
- 목록의 등록일 대신 상세의 시험완료일을 가져온다. 상세의 측정값 여러 개는 모두 유지한다.
- feature-workflow의 superpowers 전용 도구와 Opus 작업자 모델은 현재 제공되지 않아 사용 가능한 작업 에이전트와 기존 node:test 패턴으로 구현·검증한다.
- Cheerio 공식 DOM 탐색 문서를 확인해 기존 children/next/clone 패턴을 재사용했다. https://cheerio.js.org/docs/basics/traversing/
- 실제 서버 API에서 사업 6개, 선택 사업 실적 130/130건, 상세 시험항목 4개 조회 성공을 확인했다. 기존 로그인 세션을 이용해 브라우저에서 가져오기까지 검증했고, 검사 후 취소하여 DB에는 저장하지 않았다.
- 독립 리뷰의 시간 제한 초과 지적은 페이지 조회 20초 예산·요청별 남은 시간 적용·로그아웃 5초 제한으로 보완했다. 사업 목록 잘림은 사업명 서버 검색과 별도 안내를 추가했다.
- 단일행 입력에서 줄바꿈이 사라지는 것을 실화면에서 확인하여 여러 측정값의 줄바꿈을 구분자로 변환한다.
- 최종 CSI 회귀 테스트 33개·타입 검사·변경 파일 ESLint·diff 공백 검사 통과. 전체 npm run lint도 종료 코드 0이며 기존 경고는 유지했다. 커밋 이후 푸시·운영 배포는 수행하지 않는다.
