# 지적사항 관리 별지 6호·7호 Excel 사진 넘침 / A4 출력 계획서

작성일 2026-09-09. 대상 `safesys-app/src/lib/excel/corrective-action-request-export.ts`(별지 6호 시정조치요구서),
`issue-action-report-export.ts`(별지 7호 조치결과 보고). 공용 헬퍼 `quality-excel-utils.ts` 는 **무변경**.

> 이 문서는 Coordinator 의 Excel COM 실측(`%TEMP%/safesys-a4-review/`)으로 한 차례 뒤집힌 뒤 다시 쓴 것이다.
> 초안의 "열 폭 환산이 과대하다"는 진단은 **틀렸다**. 폐기 경위는 §6 에 남긴다.

## 1. 증상

- 지적(시정 전/후) 사진이 표 칸 아래로 삐져나온다.
- 인쇄하면 A4 한 장에 깔끔히 담기지 않는다.

## 2. 원인 — 두 가지, 모두 세로 방향

### 2-1. `<sheetViews>` 누락으로 Excel 이 행 높이를 화면 배율만큼 축소 (주원인)

`ws.views` 를 지정하지 않으면 ExcelJS 는 시트 XML 에 `<sheetViews>` 요소를 **아예 쓰지 않는다**
(직접 생성해 확인). 이 상태의 파일을 Excel 이 열면 저장된 `ht` 를 무시하고 현재 디스플레이 배율로
행 높이를 다시 계산한다 — ExcelJS 공식 이슈 [#743](https://github.com/exceljs/exceljs/issues/743) 의 알려진 현상.

Coordinator 의 125% 배율 환경 COM 실측(`baseline-measurements.json`):

| 요청 행 높이 | 실측 | 비 |
|---|---|---|
| 18pt | 14.4pt | 0.8 |
| 40pt | 32pt | 0.8 |

사진은 `oneCellAnchor` + 고정 `ext` 라 크기가 그대로인데 칸만 0.8배로 줄어드니 아래로 넘친다.
별지 7호 `C10:H20` 실측 bottom 316.8pt 에 사진 bottom 351.9pt → **35.1pt 초과**,
별지 6호 세로 사진은 bottom 508.8pt 에 600.9pt → **92.1pt 초과**.

`ws.views = [{ state: 'normal' }]` 한 줄로 `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` 가
생기고, Coordinator 재측정(`views-measurements.json`)에서 별지 7호 사진 4종(가로/세로/파노라마/극세로)이
**모두 비율을 지킨 채 `inside: true`** 가 됐다.

### 2-2. 남은 3.9pt — 행 높이가 디바이스 픽셀 격자에 안 맞음

`views` 수정 후에도 별지 6호 세로·극세로 사진만 **3.9pt** 넘친다(`views-request-narrow/tall`).

Excel 은 행 높이를 정수 디바이스 픽셀로 양자화한다. 배율 s 에서

```
실제 픽셀 = round(pt × 96/72 × s)
```

125%(s=1.25) 이면 `round(pt × 5/3)`. 별지 6호 `ROW_H = 22` → `round(36.67) = 36px` → 되돌리면 **21.6pt**.
행마다 0.4pt 씩 잃고 22행이면 8.8pt. 패딩 6px(4.5pt)이 일부를 먹어 3.9pt 만 드러난 것이다.

이 모형은 실측으로 검증된다. 별지 7호 사진영역 위쪽 행 합은 명목 200pt 인데 실측 198pt 이고,
양자화 손실을 더하면 `8→7.8, 22×3→21.6×3, 26→25.8, 40→39.6` 로 정확히 **−2.0pt** 다.

**pt 가 3의 배수면 손실이 0** 이다 (`pt × 4/3 × s` 가 s = 1.00/1.25/1.50/1.75/2.00 어디서도 정수).
별지 7호 `ROW_H = 18` 은 이미 3의 배수라 `views` 수정만으로 해결됐고, 별지 6호 `ROW_H = 22` 만 어긋난다.
→ **`ROW_H` 를 21 로** 내린다 (18·21 모두 3의 배수).

### 2-3. `printArea` 미지정

두 시트 모두 `fitToPage / fitToWidth 1 / fitToHeight 1` 만 두고 인쇄 영역을 지정하지 않는다
(실측 `printArea: null`). Excel 은 그리기 개체를 포함한 사용 범위를 인쇄 대상으로 잡으므로
축소 배율이 흔들린다. 기존 exporter 관례(`ptw-permit-export.ts:717`, `supervisor-diary-export.ts:624`)대로 명시한다.

### 2-4. 남은 몇 px — 사진 여백 6px 이 모자람

`views` + `ROW_H` 21 이후에도 Coordinator 의 COM→PDF 실측에서 사진이 테두리를 **약 4px** 넘겼다
(`%TEMP%/padding-report-preview.png`). `addPhotoImageInArea` 의 기본 `padding` 6px 은
셀 테두리 두께·Excel 의 EMU 반올림을 흡수하기에 부족하다.

여백은 **서식마다 다르다**. 별지 7호는 사진 전용 칸이라 16px 이면 8종 PDF 검사를 모두 통과한다.
별지 6호는 사진 칸이 본문 텍스트와 **같은 칸**이라 세로 여유가 적어, 16px 에서도 긴 세로사진이
표 하단 646.12pt 를 넘어 653.64pt(**7.5pt 초과**)에 놓였다. **32px** 로 올려야 통과한다
(`%TEMP%/safesys-a4-review/safe-*.pdf`, `check-safe.py`).

## 3. 해결 — 최소 수정 5가지

| # | 파일 | 변경 |
|---|------|------|
| 1 | 두 exporter | `addWorksheet` 옵션에 `views: [{ state: 'normal' }]` |
| 2 | `corrective-action-request-export.ts` | `ROW_H` 22 → **21** |
| 3 | 두 exporter | `ws.pageSetup.printArea = 'A1:H{마지막 행}'` |
| 4 | `issue-action-report-export.ts` (별지 7호) | 사진 `padding` 6 → **16** |
| 5 | `corrective-action-request-export.ts` (별지 6호) | 사진 `padding` 6 → **32** |

`quality-excel-utils.ts` 는 건드리지 않는다. 서명 이미지는 지금처럼 `(인)` 문구 **위에 겹쳐** 둔다
(CLAUDE.md 핵심 제약 5).

### 채택하지 않은 안

- **twoCellAnchor 전환** — 끝 앵커를 셀 경계에 묶으면 넘침은 막지만, 세로만 0.8배가 된 상태에서는
  **사진 비율이 왜곡**된다. 2-1 이 행 높이 자체를 되살리므로 필요 없다.
- **`colWidthsPx` 를 워크시트에서 추출하는 geometry 리팩터** — §6 참조. 열 폭은 애초에 맞았다.
- **padding 확대만으로 3.9pt 해결** — 격자 어긋남을 가릴 뿐이라 `ROW_H` 21 이 근본 해결이다.
  사진 여백 확대(별지 7호 16px, 별지 6호 32px)는 그와 별개로 남은 실측 초과를 덮기 위한 것이다(2-4).

## 4. A4 한 장 수납 (양자화 반영)

여백 좌우 0.7in·상하 0.75in → 인쇄 가능 폭 659px, 높이 733.9pt.

| 서식 | 표 폭 | 행 높이 합(실측 기준) | 판정 |
|------|-------|------------------------|------|
| 별지 6호 | 608px = 456pt | 18+6+43.8+30×3+21×22+18 ≈ **638pt** | 여유 |
| 별지 7호 | 624px = 468pt | ≈ **722pt** | 약 12pt 여유, 수납 |

별지 7호가 빠듯하다. **`PHOTO_ROWS`(11) 나 `ROW_H`(18) 를 키우면 즉시 두 장이 된다.**

## 5. 공유 헬퍼 다른 호출부 영향

`quality-excel-utils.ts` 가 무변경이므로 `addPhotoImageInArea`(4곳)·`addSignatureImage`(7곳) 호출부에
**회귀 없음**. 다만 `<sheetViews>` 누락은 전 exporter 공통 결함이다 —
`inspection-photo-report.ts`, `material-ledger-export.ts` 등 사진을 넣는 다른 서식도 같은 한 줄로
고칠 수 있으나 이번 지시 범위(별지 6호·7호) 밖이라 손대지 않고 보고에 남긴다.

## 6. 폐기된 초안 진단 (기록)

초안은 OOXML 규격에서 `px = Trunc(((256w + Trunc(128/MDW))/256) × MDW)`, MDW=7(Calibri 11) 을 근거로
"코드의 `열폭 × 8` 이 14% 과대 → 가로 넘침" 이라고 결론냈다. **틀렸다.**

ExcelJS 가 쓰는 기본 글꼴은 `name="Calibri"` 이지만 **`scheme="minor"`** 다
(`styles-xform.js:118`). 한국어 Excel 은 minor scheme 을 theme1.xml 의 `<a:font script="Hang">` =
**맑은 고딕**으로 해석하고, 이때 MDW 는 **8px** 이다. 실측 역산이 이를 확증한다.

- 별지 7호 `cellRight` 468pt = 624px = `(6+6+11×6) × 8`
- 별지 6호 `cellRight` 456pt = 608px = `(8+8+11+11+8+8+11+11) × 8`

즉 기존 코드 주석의 "폭 단위당 8px — 한국어 Excel COM 실측값"이 옳았고, 넘침은 처음부터
**가로가 아니라 세로** 문제였다. 규격 문서보다 실측이 이겼다.

## 7. 하지 않는 것

- 커밋·푸시·`npm run build` 금지.
- UI/디자인 변경 없음. 서식 문구·행 구성·서명 배치 변경 없음.
- `risk-assessment-export.ts:248` 의 동일 기법 독립 구현은 별건.
