---
name: hwpx-authoring
description: Use when adding or debugging HWPX(한글문서, OWPML) generation in SafeSys — 새 서류의 "HWPX 다운로드" 기능 추가, 생성한 hwpx가 한글에서 안 열리거나 한글 2020이 조용히 죽을 때, 표·서명·사진·여백 배치를 조정할 때, hwpx 내부 XML(hp:pic, hp:tbl, secPr)을 만질 때.
---

# HWPX 문서 생성 (OWPML 조립)

## 개요

HWPX는 OWPML XML들을 담은 zip이다. 한글(Hancom) 파서는 관대하지 않다 — 필수 요소가 빠지면 **오류창 없이 프로세스가 즉사**하므로, 이 스킬의 함정 목록과 검증 루프를 따르지 않으면 "다운로드는 되는데 안 열리는" 파일을 배포하게 된다.

**정본 구현: `safesys-app/src/lib/hwpx/tbm-submission-hwpx-export.ts`.** 이 모듈이 아래 지식이 전부 반영된 유일한 구현이다. 새 hwpx 기능은 이 모듈의 헬퍼(esc, triggerDownload, ImageCollector, buildPicXml, buildFloatingPicXml, 표 빌더, stretchRowsToFillPage)를 복사·일반화해서 시작하라. 백지에서 새로 쓰지 마라.

## 두 가지 접근

| 접근 | 방법 | 사용처 |
|------|------|--------|
| 템플릿 기반 | 한글이 만든 양식 hwpx(public/)를 JSZip으로 열어 텍스트·이미지만 치환 | 양식 파일이 이미 있을 때 (특별점검·안전점검) |
| 코드 조립 | 패키지 전체를 코드로 생성 | 양식이 없거나 동적 레이아웃이 필요할 때 (TBM) |

> 경고. 기존 특별점검·안전점검 모듈의 `buildPicXml`은 아래 "치명 함정 1"의 최소 구조라서 **사진이 포함되면 한글 2020에서 크래시할 가능성이 높다**(실험으로 확인, 미수정). 그 모듈들을 참고하되 pic XML은 TBM 모듈 것을 써라.

## 패키지 구조 (코드 조립 시)

```
mimetype                  ← "application/hwp+zip", 반드시 zip 첫 항목 + 비압축(STORE)
version.xml               ← 고정 보일러플레이트 (tagetApplication 오타는 스펙임)
settings.xml
Contents/header.xml       ← refList 순서 고정: fontfaces→borderFills→charProperties→tabProperties→numberings→paraProperties→styles→memoProperties
Contents/section0.xml     ← 본문. 첫 문단 run 안에 secPr(용지·여백) 포함
Contents/content.hpf      ← opf 매니페스트. 이미지는 여기 <opf:item id="imageN" .../>로만 선언 (header binDataList 불필요)
Preview/PrvText.txt       ← UTF-8 평문
META-INF/container.xml, container.rdf, manifest.xml
BinData/imageN.jpg|png    ← 이미지 바이트. 섹션의 binaryItemIDRef="imageN" ↔ 매니페스트 id 매칭
```

## 치명 함정 (전부 실제 크래시/깨짐으로 확인됨)

| # | 함정 | 증상 | 해결 |
|---|------|------|------|
| 1 | 최소 `hp:pic`(sz/pos/imgRect 속성형/hc:img만) | 한글 2020이 파일 여는 즉시 소리 없이 종료 | id·zOrder·numberingType·textWrap·instid 속성 + 자식을 **offset→orgSz→curSz→flip→rotationInfo→renderingInfo→imgRect(pt0~pt3 자식 노드)→imgClip→inMargin→imgDim→hc:img→effects→sz→pos→outMargin→shapeComment** 순서로 전부 넣는다. `imgRect`는 x/cx 속성이 아니라 `<hc:pt0>`~`<hc:pt3>` 자식이다. TBM 모듈 `buildPicXml` 복사 |
| 2 | 떠 있는 그림 `textWrap="THROUGH"` | 그림이 겹치지 않고 표를 아래로 밀어냄 | 도장/서명 겹침 레시피 = `treatAsChar="0" allowOverlap="1"` + `vertRelTo/horzRelTo="PAPER"` + `textWrap="IN_FRONT_OF_TEXT"` 세트로 사용 |
| 3 | 떠 있는 그림을 셀/문단(PARA) 앵커로 배치 | 좌표가 예측 불가(표 밖·엉뚱한 줄로 이동) | `vertRelTo/horzRelTo="PAPER"` 절대좌표 + 표 래퍼 문단 run에 앵커. 좌표 = 여백 + 열폭/줄높이 합산, 최종은 실측 보정 |
| 4 | 셀 명시 폭이 열 그리드(colAddr/colSpan)와 불일치 | 한글이 행을 재배치해 행 전체가 깨짐 | 셀 폭은 반드시 그리드 열폭 합산으로 도출. 그리드를 바꾸려면 정답 hwpx에서 colAddr/colSpan/width를 추출해 일관 그리드를 풀어라 |
| 5 | mimetype을 압축하거나 뒤에 배치 | 파일 인식 실패 | JSZip에서 첫 번째로 `{ compression: 'STORE' }` 지정 |

## 좌표·치수 (HWPUNIT)

- 1mm = 283.465 HWPUNIT, 1pt = 100. A4 세로 = 59528 × 84188.
- 본문 시작(위) = 위 여백 3600 + 머리말 3600 = 7200. 본문 세로 = 84188 − 상하 (3600+3600)×2 = 69788.
- 줄 전진 높이 ≈ 글자크기 × 130% (10pt → 1300). 한글 글자 폭 ≈ 100/pt (10pt → 1000). 셀 상하 패딩 282.
- 행 높이 선언값은 **최소값** — 내용이 길면 자란다. 넘치면 표 전체가 다음 페이지로 밀린다(늘릴 땐 소폭씩).
- 페이지 채움/분할 판단은 "표시 줄 수(줄바꿈+폭 기반 자동 줄바꿈) × 1300 + 282"로 행 높이를 추정해 합산한다. 가변 행(작업내용류)을 빼먹으면 조합 초과를 놓친다.

## 이미지 규칙

- 사진: 흰 배경 JPEG로 정규화(maxEdge 1200) 후 **원본 비율 유지**해 셀에 fit — 브라우저에서 `naturalWidth/Height` 측정, 측정 불가 환경은 셀 채움 폴백.
- 서명: 투명 PNG 원본 그대로(raw) 수집 — 정규화하면 투명도가 죽는다. 서명은 문구 위 겹침이 원칙(핵심 제약 #5).

## 검증 루프 (필수 — 이거 없이 "완료" 금지)

로컬에 한컴오피스 2020 있음: `C:\Program Files (x86)\Hnc\Office 2020\HOffice110\Bin\Hwp.exe`

```powershell
# 1) 크래시 테스트 — 프로세스가 사라지면 크래시(오류창 없음)
Start-Process $hwp -ArgumentList "`"$file`""; Start-Sleep 12
try { Get-Process Hwp -ErrorAction Stop; "ALIVE" } catch { "CRASHED" }

# 2) 전체 페이지 육안 검증 — COM으로 PDF 변환 후 PNG 렌더
$h = New-Object -ComObject HWPFrame.HwpObject
$null = $h.RegisterModule("FilePathCheckDLL","FilePathCheckerModule")
$null = $h.Open($file, "HWPX", ""); $h.SaveAs($pdf, "PDF", ""); $h.Quit()
# PDF→PNG: scripts/render-pdf.ps1 (Windows PowerShell 5.1로 실행, WinRT PdfDocument 사용)

# 3) 정답 XML 확보 — 한글이 직접 만든 문서를 기준으로 삼는다
#    COM으로 InsertPicture 등 수행 후 SaveAs("HWPX") → unzip해 해당 요소 XML 추출
```

- Node에서 브라우저 모듈을 그대로 실행해 hwpx를 뽑는 하니스: `tsx`로 임포트하고 `document`(더미 앵커), `URL.createObjectURL`(블롭 가로채기), `Image`(크기 스텁)만 스텁하면 된다. 타입 전용 임포트는 런타임에 지워지므로 경로 별칭 문제 없음.
- 레이아웃 수치가 미세하게 어긋나면 스크린샷 픽셀 추정으로 헤매지 말고 **정답 hwpx(한글 저장본 또는 사용자가 수정한 파일)를 unzip해 cellSz/height·colSpan·pic 좌표를 추출**해 이식하라 — 사용자가 한글에서 직접 고친 파일이 최고의 스펙이다.

## 여러 건 묶음(벌크) 문서

한 섹션에 건별 문단을 이어 붙인다. 건마다 (1) 첫 문단을 `pageBreak="1"`로 새 쪽 시작(secPr는 섹션 첫 문단에만), (2) 표 id를 건별로 유일하게(tblIdBase + n), (3) ImageCollector·pic 일련번호는 문서 전체에서 하나로 공유. PAPER 절대좌표 떠 있는 그림은 **앵커 문단이 놓인 쪽 기준**으로 적용되므로 뒤 페이지에서도 좌표 재계산 없이 그대로 동작한다(검증됨). 구현 예: TBM 모듈 `buildSubmissionParts`/`downloadTBMSubmissionBulkHwpx`.

## UI 통합 체크리스트

- 다운로드 드롭다운에 항목 추가, `handleDownloadReport`류 format 유니언에 `'hwpx'` 추가.
- 파일명 `${이름}_${종류}_${날짜}.hwpx`. `triggerDownload(blob)` 패턴 사용.
- blob MIME `application/hwp+zip`, JSZip `generateAsync({ type:'blob', compression:'DEFLATE' })`.
- 완료 기준: tsc·lint 통과 + **위 검증 루프에서 ALIVE + PDF 렌더 육안 확인**.
