# 컨텍스트 노트 — 별지 6호·7호 Excel 사진/A4

## 이 파일에서 가장 중요한 것

**규격 문서로 추론하지 말고 Excel COM 으로 재라.** 이 작업은 초안 진단이 통째로 틀렸고
Coordinator 의 COM 실측으로 뒤집혔다. 경위는 계획서 §6.

## Excel 열 폭 ↔ 픽셀 — `width × 8` 이 맞다

ExcelJS 가 styles.xml 에 쓰는 기본 글꼴은 `name="Calibri"` 이지만 **`scheme="minor"`** 다
(`node_modules/exceljs/lib/xlsx/xform/style/styles-xform.js:118`). 한국어 Excel 은 minor scheme 을
theme1.xml 의 `<a:font script="Hang" typeface="맑은 고딕"/>` 로 해석하고, 맑은 고딕 11pt 의
최대 숫자 폭(MDW)은 **8px** 이다. 그래서 `<col width="11">` 은 그대로 **88px**.

실측 역산으로 확증됨 (`%TEMP%/safesys-a4-review/baseline-measurements.json`).

- 별지 7호 `cellRight` 468pt = 624px = `(6+6+11×6) × 8`
- 별지 6호 `cellRight` 456pt = 608px = `(8+8+11+11+8+8+11+11) × 8`

> Calibri 기준 MDW=7 을 가정하면 안 된다. 규격의 `px = Trunc(((256w + Trunc(128/MDW))/256) × MDW)`
> 자체는 맞지만, **MDW 는 워크북 Normal 스타일 글꼴이 theme 을 거쳐 최종 해석된 글꼴**에서 나온다.

## 행 높이 — 두 겹의 함정

### (1) `<sheetViews>` 가 없으면 Excel 이 행 높이를 다시 계산한다

`ws.views` 미지정 → ExcelJS 가 `<sheetViews>` 요소를 통째로 생략 → Excel 이 저장된 `ht` 대신
현재 화면 배율로 행 높이를 재계산(125% 에서 0.8배). ExcelJS 이슈 #743.
`ws.views = [{ state: 'normal' }]` 로 `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` 를
만들면 해결된다. `AddWorksheetOptions.views` 는 `Array<Partial<WorksheetView>>` 라 부분 객체로 통과한다.

**사진은 `oneCellAnchor` + 고정 `ext` 라 크기가 안 변한다.** 칸만 줄면 그대로 넘친다.

### (2) 행 높이는 정수 디바이스 픽셀로 양자화된다

```
실제 픽셀 = round(pt × 96/72 × 배율)      // 125% 이면 round(pt × 5/3)
```

22pt → `round(36.67) = 36px` → **21.6pt**. 행마다 0.4pt 손실.

**규칙: 사진 영역 행 높이는 3의 배수 pt 로 둔다.** 그러면 배율 100/125/150/175/200% 어디서도
`pt × 4/3 × s` 가 정수라 손실이 0 이다. 별지 7호 18pt ✔, 별지 6호는 22 → **21** 로 내렸다.

검증: 별지 7호 사진영역 위 행 합 명목 200pt, 실측 198pt. 양자화 손실
`8→7.8, 22×3→21.6×3, 26→25.8, 40→39.6` 합 −2.0pt 로 정확히 일치.

## twoCellAnchor 를 쓰지 않은 이유

끝 앵커를 셀 경계에 묶으면 넘침은 사라지지만, 세로만 0.8배로 눌린 상태에서는 **사진 비율이 왜곡**된다.
지적사항 사진은 증빙이라 왜곡이 허용되지 않는다. 행 높이 자체를 되살리는 쪽(`views` + 3의 배수)이
비율과 수납을 동시에 만족한다.

## ExcelJS 의 소수 앵커 함정 (기존 주석 재확인 — 유효)

`Anchor.set col(v)` 이 `colWidth = width × 10000 EMU` 로 근사한다(`lib/doc/anchor.js`).
실제는 `width × 8 × 9525 = width × 76200` 이라 **7.6배 축소**된다.
그래서 `col: 2.5` 같은 소수 앵커 대신 `nativeCol` + `nativeColOff`(EMU) 를 직접 지정해야 한다.
`addPhotoImageInArea` 와 `addSignatureImage(offsetXPx/offsetYPx)` 가 그렇게 하고 있고, 옳다.

## editAs

`ext` 만 주면 `xdr:oneCellAnchor` 로 나간다(`drawing-xform.js:11`). `editAs` 는 스키마상
`CT_TwoCellAnchor` 전용이라 oneCellAnchor 의 `absolute` 는 무시된다. ExcelJS 는 속성을 항상
출력하므로(`one-cell-anchor-xform.js:29`) 없앨 수도 없다. **무해하므로 건드리지 않았다.**

## 사진 여백은 서식마다 다르다 — 별지 6호 32px, 별지 7호 16px

`views` + 3의 배수 행 높이로 계산상 딱 맞아떨어져도 COM→PDF 실측에서는 여전히 몇 px 넘쳤다.
셀 테두리 두께와 EMU 반올림이 쌓인 것으로 보인다. `addPhotoImageInArea` 기본값 6px 을 쓰지 않는다.

| 서식 | padding | 이유 |
|------|---------|------|
| 별지 7호 (report) | **16** | 사진 전용 칸이라 여유가 있다. 8종 PDF 검사 통과. |
| 별지 6호 (request) | **32** | 사진 칸이 **본문 텍스트와 같은 칸**이라 세로 여유가 적다. 16px 에서도 긴 세로사진이 표 하단 646.12pt 를 넘어 653.64pt(7.5pt 초과). 32px 에서 통과. |

**여기서 교훈은 "여백은 칸의 성격을 따른다"는 것이다.** 텍스트와 사진이 한 칸을 나눠 쓰면
`offsetYPx` 추정 오차까지 여백이 흡수해야 하므로 두 배가 필요하다.

회귀 테스트가 서식별 기준(request 32 / report 16)으로 검증하므로 누가 줄이면 바로 실패한다.

## A4 여백

- A4 = 8.27in × 11.69in, 세로 841.9pt.
- 좌우 0.7in → 인쇄 폭 6.87in = 659px. 상하 0.75in → 인쇄 높이 733.9pt.
- header/footer 여백 0.3in 은 top/bottom 안쪽이라 무관.

**별지 7호가 약 722pt 로 가장 빠듯하다(여유 12pt).** `PHOTO_ROWS`(11) 나 `ROW_H`(18) 를 키우면
곧바로 두 장이 된다. 늘려야 하면 다른 행에서 그만큼 줄일 것.

## 테스트 방식

`node --test` + `typescript.transpileModule` 로 TS 를 직접 돌린다(`tests/g2b-contract-period.test.mjs` 관례).
`@/lib/...` 별칭은 가짜 `require` 로 주입. exporter 가 쓰는 브라우저 API
(`fetch`/`FileReader`/`document`/`window.URL`/`Blob`)는 최소 스텁으로 채우고,
`downloadWorkbook` 이 만든 Blob 을 `window.URL.createObjectURL` 에서 가로채 버퍼를 얻는다.

**COM 실측용 xlsx 를 이 테스트로 뽑을 수는 없다.** 스텁이 사진 바이트 대신 URL 문자열을 넣기 때문에
Excel 이 그림을 열지 못한다. 실물 검증은 Coordinator 의 별도 harness(`generate.cjs` + `measure.ps1`)로 한다.

## 건드리지 않은 것

- `quality-excel-utils.ts` — 무변경. 따라서 `addPhotoImageInArea`(4 호출부)·
  `addSignatureImage`(7 호출부) 회귀 없음.
- `<sheetViews>` 누락은 **전 exporter 공통 결함**이다. `inspection-photo-report.ts`,
  `material-ledger-export.ts` 등도 같은 한 줄이 필요하나 이번 범위 밖. 후속 과제.
- `risk-assessment-export.ts:248` 의 동일 기법 독립 구현도 후속 과제.
