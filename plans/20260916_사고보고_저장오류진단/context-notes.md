<!-- 사고보고 저장 오류 안내 구현 판단 기록. -->
# 컨텍스트 노트

- feature-workflow·Supabase·orchestration 스킬은 직전 작업에서 읽은 지침을 재사용한다. 사용자 지시에 따라 추가 에이전트 없이 Codex가 구현하고 부모가 독립 리뷰한다.
- 이전 산재요양 구현 파일과 PDF 담당 Modal/import/helper/types는 수정하지 않는다. 기존 회귀는 `tests/project-accident-report.test.mjs`에 추가한다.
- 실제 오류 코드는 부모가 확보 중이다. 안내 개선을 실제 저장 실패 원인 해결로 보고하지 않는다.
- 설치된 postgrest-js 소스의 통신 오류 응답은 code 빈 문자열과 `TypeError: Failed to fetch` 등의 message를 사용한다. 해당 패턴만 분류하고 stack/details는 읽지 않는다.
- 전체 기존 모달 테스트 3개는 PDF 병행 구현의 Node DOMMatrix 오류로 실패했다. 저장 분류 scoped 테스트와 기존 저장 데이터 테스트는 통과하며 이 외부 실패는 부모에게 전달했다.

부모 브라우저 검증. 가상 서버 23514·42501 응답에 오류 코드 표시, 입력 보존, 클릭당 한 요청, 원문 개인정보 비노출을 확인했다. 실제 DB의 report_details 컬럼과 expectedTreatmentDays 검증 함수는 읽기 전용 확인을 통과했다. 사용자가 17:52 저장 성공을 알렸으므로 기존 저장 시도는 해결되었으나 당시 오류 코드가 없어 원인을 단정하지 않는다.
