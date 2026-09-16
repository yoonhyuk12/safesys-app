# 컨텍스트 노트.

- 사용자 최신 요구로 별도 경위가 없으면 null 정책을 변경한다.
- 기존 순수 정규화와 cleanAccidentReportContent를 재사용하며 생성기나 의존성은 추가하지 않는다. 신규 구현·라이브러리가 없으므로 외부 코드 검색은 불필요하다.
- 제공된 스킬 목록과 로컬 검색에 writing-plans/test-driven-development/code-reviewer가 없어서 계획·RED/GREEN·직접 diff 검토로 수행한다. 추가 Worker 금지 및 commit 금지는 이번 명시 지시를 따른다.
- 실제 문서 및 개인정보를 테스트나 산출물에 포함하지 않는다. 시작 시 public/사고/ 및 사용방법.md가 untracked였으며 작업 대상이 아니다.
- RED에서 신규 지시문 회귀만 실패했고 기존 정규화는 합성 개요를 이미 보존했다. 따라서 정규화/helper/병합/API 모델은 변경하지 않았다.
- GREEN 추출 36/36 통과. npx tsc --noEmit 종료 0, npm run lint 종료 0(기존 경고), npm run test:accident-report 종료 0(236개 중 235 pass, 기존 TODO 1), git diff --check 통과.
- 기존 TODO는 계정 삭제 시 created_by 변경 방지 트리거가 ON DELETE SET NULL을 막는 SQL 회귀다. 이번 변경과 무관하며 원격 SQL은 실행하지 않았다.
- 직접 diff 검토에서 변경 범위는 추출 지시문/스키마 설명과 테스트 2건뿐임을 확인했다. 실제 AI 출력 품질은 부모의 PDF/HWPX 실측으로 최종 검증한다.
- 부모 실측 완료. 원본 PDF와 제품 업로더로 추출한 원본 HWPX 텍스트를 현재 Gemini 모델로 각각 분석해 HTTP 200과 사실 기반 개요 생성을 확인했다. 개인정보 포함 결과는 ignored scratch에만 보관했다.
- 브라우저에서 두 실제 AI 결과의 개요 자동 채움을 확인했다. PDF는 가상 Supabase 저장 및 실제 HWPX 다운로드까지 개요와 사진 2컷을 보존했다. HWPX는 명시 원인이 없어 원인 입력을 비워 두는 것까지 확인했고 저장 검증은 수행하지 않았다.
- 부모 소유 한글2022 COM으로 PDF 샘플의 생성 HWPX 열기·저장·재열기·PDF 변환·원본 불변을 확인했다. 출력 3쪽 전체를 렌더링해 개요·표·사진 2컷의 표시를 확인했다. 부모 추출 회귀 36/36 및 diff 검토 통과, Worker released 상태이며 회수 대상 0이다.
