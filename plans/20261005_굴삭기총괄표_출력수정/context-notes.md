# 컨텍스트 노트

- 조회 함수 getSpecial770SummaryRows는 projects 전체 열을 조회하므로 project_category를 추가 조회할 필요 없다.
- 기존 toSpecial770SummaryRows는 unitBusiness를 빈값, district를 원문 그대로 출력한다.
- Downloads의 특별점검(굴삭기 버킷 사고)_총괄표_2026_경기.xlsx에는 정상 JPEG가 포함돼 있지만 U7 사진의 가로 폭은 (219600-9149)/9525 = 약 22px다. ExcelJS 소수 셀 좌표가 사용자 지정 열 폭을 width*10000으로 환산하기 때문이다. 세로는 약 111px로 심하게 찌그러진다.
- quality-excel-utils.ts의 addPhotoImageInArea는 nativeColOff/nativeRowOff에 px*9525를 사용하고 ext로 크기를 지정하는 선례가 있다. 기존 다운로드 모듈의 이미지 사전 로드 구조를 유지하면서 이 배치 방식을 적용한다.
- 기존 HWPX districtName은 지구까지 추출하고 없으면 첫 단어를 쓴다. 엑셀용으로 적절한 의존성 범위에서 재사용/적용한다.
- 출력 모듈과 기존 테스트는 작업 시작 전부터 untracked다. 이번 수정과 무관한 기반 구현을 임의로 함께 커밋하지 않는다.
- Worker는 gpt-6-astra low 적용을 launch.effective로 확인했고, 수정 완료 후 diff와 독립 검증을 거쳐 release했다.
- 실제 화면에서 다시 다운로드한 파일의 D3=사업유형, D7=기반사업처(저장된 project_category), F7=점동지구를 Excel에서 확인했다. U7은 사진 1개, 가로·세로 105.75pt로 정상이며 원본 비율을 보존한다.
- 검토용 샘플은 test-files/770-summary-fix/real-photo-summary.xlsx이며 실제 다운로드 검증은 live-download-check.json, Excel 출력 확인은 excel-photo-after.pdf/png에 남겼다. 샘플 사업유형은 가상값 농촌용수개발이며 실제 다운로드와 구분한다.
- Advisor 독립 검증 결과 npm run test:special-770 37개 통과, npx tsc --noEmit 통과, npm run lint 기존 경고만. Worker의 38개는 환경변수로 켜는 실제 사진 샘플 생성 검사 1개를 포함한 수치다.
