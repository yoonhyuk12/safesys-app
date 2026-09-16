# 컨텍스트

- 기준 커밋 1b6a44b. 사용자 제공 public/사고 원본 2개와 사용방법.md가 미추적이다. 원본 개인정보를 테스트 픽스처·배포물·계획 문서에 복사하지 않는다.
- 파주 PDF는 텍스트 추출 가능하며 본문 1쪽+사진대지 1쪽이다. 평택 HWPX는 본문과 사진대지에 BMP 이미지 3개가 담겼다. 사진 자동 추출은 요구 범위로 추정하지 않고 별도 최대 2장 첨부를 제공한다.
- 추가 필드는 실제 두 양식의 합집합이다. 원인·작업내용·향후계획은 기존 통계 필드에 연결한다. 보고일과 사고일은 서로 다르므로 별도로 유지한다.
- 기존 공동 수정 권한(소유자·공유자·관할 발주청)과 삭제 권한(작성자·관할 본부급)을 보존한다.
- 새 데이터는 JSONB 1컬럼으로 기존 행과 생명주기를 공유한다. 사진은 축소 JPEG를 사용하며 대시보드 목록에는 대용량 데이터를 로드하지 않는다.
- 업로드 결과는 초안이다. 문서 원문에 없는 사실·신고 여부·산재신청 여부는 추정 확정하지 않는다.
- 사용자 후속 지시로 출력은 평택지사 HWPX 원본 양식으로 확정됐다. 원본 서식을 보존한 익명화 템플릿을 치환하며, 논문 프로젝트의 `hwpx-thesis-editing` 스킬을 참고한다. 실제 파일 쓰기와 COM 검증은 부모가 단독·순차로 수행한다.
- 실제 설치는 한컴오피스 2022(HOffice120)다. 스킬에 적힌 2020 설치 경로와 다르므로 검증 결과는 실제 버전을 명시한다.
- 평택 원본 SHA256은 `04DE7CE17F6FA74B9F540F7330FAE5D3A372218F160F2437BBDCCE1FECB59588`이다.
- 사용자 추가 요청에 따라 로컬 한글 Automation 보안모듈을 설정했다. 다운로드 DLL과 기존 `C:/ProgramData/Hancom/HwpAutomation/FilePathCheckerModuleExample.dll`의 SHA256 일치를 확인했다. HKCU `Software/HNC/HwpAutomation/Modules`의 기존 `FilePathCheckerModuleExample` 값은 유지하고, 검증 코드가 사용하는 `FilePathCheckerModule` 이름을 같은 DLL로 추가했다. 기존 레지스트리는 LocalAppData의 Hancom/HwpAutomation에 백업했다. 별도 한글 COM에서 RegisterModule·Open·SaveAs·Reopen·PDF가 모두 True로 확인됐다.
- HWPX 담당 Claude가 사용량 한도에 도달해 최종 응답 후 중단된 것을 확인했다. 해당 dispatch를 종료 처리하고 동일 Task를 Codex 담당으로 재시도한다. 이전 opus 구현·독립 리뷰 산출물을 이어받아 남은 실측 결함을 수정하며 부모가 직접 최종 검증한다.
