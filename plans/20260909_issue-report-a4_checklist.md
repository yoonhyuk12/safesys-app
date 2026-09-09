# 별지 6호·7호 Excel 사진/A4 체크리스트

## 조사
- [x] 두 exporter 와 `quality-excel-utils.ts` 정독
- [x] ExcelJS 4.4.0 이 `<col width>` 를 가공 없이 쓰는지 확인 (`col-xform.js:20`)
- [x] `ws.views` 미지정 시 `<sheetViews>` 자체가 빠지는 것을 생성 XML 로 확인
- [x] Coordinator COM 실측(baseline/views-measurements.json) 대조 — 초안 진단(MDW=7) 폐기
- [x] 행 높이 양자화 모형 `round(pt×4/3×배율)` 을 실측 −2.0pt 와 대조해 검증
- [x] `addPhotoImageInArea` 호출부 4곳 / `addSignatureImage` 호출부 7곳 영향 조사
- [x] 기존 `printArea` 관례 확인 (`ptw-permit-export.ts:717` 등)
- [x] A4 수납 재계산 (별지 7호 여유 약 12pt)

## 테스트 (RED → GREEN)
- [x] `tests/issue-report-a4.test.mjs` 작성 — 수정 전 실패 확인 (sheetViews·행 격자·printArea)
- [x] 서식별 사진 여백 검증 추가 (request 32 / report 16) — 값을 줄이면 실패함을 확인
- [x] `package.json` 에 `test:issue-report` 스크립트 추가

## 구현 (최소 수정 5가지)
- [x] 두 exporter `addWorksheet` 옵션에 `views: [{ state: 'normal' }]`
- [x] `corrective-action-request-export.ts` `ROW_H` 22 → 21
- [x] 두 exporter `ws.pageSetup.printArea` 명시
- [x] 별지 7호 사진 `padding` 6 → 16
- [x] 별지 6호 사진 `padding` 6 → 32 (텍스트와 칸을 공유해 세로 여유가 적음)
- [x] `quality-excel-utils.ts` 무변경 유지
- [x] 서명 이미지 `(인)` 겹침 배치 그대로 유지

## 검증
- [x] `node --test tests/issue-report-a4.test.mjs` 통과
- [x] 기존 테스트 회귀 없음 (`test:g2b`, `test:csi`, `test:merge-sql`)
- [x] `npm run lint`
- [x] `npx tsc --noEmit`
- [x] 커밋·푸시·빌드 하지 않음
- [x] 코드 동결
- [x] (Coordinator) 최종 코드로 생성한 8개 Excel의 사진 경계·인쇄 영역 확인, 8개 PDF의 A4 1쪽·사진 비율·표 경계 침범 없음 확인
