# Worker B 브리프 — 순회점검대장 HWPX 출력 (템플릿 치환)

너는 SafeSys(Next.js 15 · React 19 · Supabase) 저장소의 구현 Worker다. 저장소 루트는 이 파일이 있는 리포지토리이고, 모든 npm 명령은 `safesys-app/`에서 실행한다. 먼저 `CLAUDE.md`, `.claude/rules/safesys/signature-overlay.md`, `.claude/skills/hwpx-authoring/SKILL.md`, `plans/20260917_AI_순회점검대장.md`, 같은 폴더의 `context-notes.md`를 읽어라. 한국어로 보고하고 문장을 콜론으로 끝내지 마라. 새 소스 파일 첫 줄에는 파일 역할을 밝히는 한국어 한 줄 주석을 단다. 요청과 무관한 코드는 손대지 않는다. `npm run build` 금지. git commit·push 금지.

## 목표

저장된 순회점검 1건(`PatrolLedgerInspection`, `safesys-app/src/lib/patrol-ledger/types.ts` — 읽기 전용, 바꾸지 마라)을 사용자가 준 한글 양식 `safesys-app/public/순회점검 양식.hwpx`에 채워 넣은 HWPX를 브라우저에서 내려받게 한다. 양식의 배치·글꼴·로고는 그대로여야 한다.

## 산출물

### `safesys-app/src/lib/hwpx/patrol-ledger-hwpx-export.ts`

```ts
export const PATROL_LEDGER_TEMPLATE_PATH = '/순회점검 양식.hwpx'
export interface PatrolLedgerHwpxOptions { projectName: string; templateUrl?: string }
export async function buildPatrolLedgerHwpxBlob(record: PatrolLedgerInspection, options: PatrolLedgerHwpxOptions): Promise<Blob>
export async function downloadPatrolLedgerHwpx(record: PatrolLedgerInspection, options: PatrolLedgerHwpxOptions): Promise<void>
// 파일명 `${projectName}_순회점검_${inspection_date}.hwpx` (경로 금지문자는 _ 로), blob MIME application/hwp+zip
```

접근은 **템플릿 기반**이다. `fetch(templateUrl ?? PATROL_LEDGER_TEMPLATE_PATH)` → JSZip으로 열기 → `Contents/section0.xml`의 셀 본문만 치환 → 이미지 추가 → zip 재생성(mimetype을 첫 항목·STORE로). 사고보고 모듈 `src/lib/hwpx/accident-report-hwpx-export.ts`와 `accident-report-xml.ts`(`topLevelRanges`, `rebuild`, `stripLineseg`)가 같은 방식의 정본이니 헬퍼를 재사용하거나 복사해라. 그림 XML은 반드시 `src/lib/hwpx/tbm-submission-hwpx-export.ts`의 `buildPicXml`/`buildInlinePicXml`/`buildFloatingPicXml`(완전한 hp:pic 구조)을 복사해서 쓴다. 다른 템플릿 모듈의 최소 pic 구조는 한글을 죽인다.

### 채울 자리 (셀 주소는 `hp:cellAddr colAddr/rowAddr`, 표 순서는 section0.xml 등장 순서)

표 1(rowCnt 14, colCnt 5).
- r0 c0 제목 `작업장 순회 점검표(시공사명)` → `작업장 순회 점검표(${contractor_name})`. contractor_name이 비면 원문 유지.
- r3~r12: c1 → ` (${category}) ${text}` (양식처럼 앞에 공백 한 칸), c4 → `result`(빈 문자열이면 빈 셀). c0의 번호는 원문 유지. items가 10건 미만이면 남는 행은 c1·c4를 비운다. items의 `no` 순서대로 채운다.
- r13 c1(원문 `(없는 경우 점검사진)`) → `finding_photo_url`이 있으면 사진을 셀 안 인라인 그림으로 넣고 원문 텍스트는 지운다. 사진은 흰 배경 JPEG로 정규화(maxEdge 1200)하고 원본 비율을 유지해 셀 내부(폭 26198, 높이 18750에서 셀 패딩 뺀 크기)에 fit. 없으면 원문 그대로.
- r13 c3(colSpan 2, 지적사항 내용) → `finding_text`를 줄바꿈마다 문단으로. 비면 빈 셀.

표 2(rowCnt 3, colCnt 8).
- r0 c1 → `YYYY년 M월 D일` (inspection_date에서), r1 c1 → `district_name`.
- r2 c2 → `inspector_affiliation`, r2 c4 → `inspector_position`, r2 c6 → `inspector_name`.
- r2 c7 `(서명)` 문구는 **남기고**, `signature`(PNG dataURL)를 그 문구 위에 겹치는 떠 있는 그림으로 넣는다. `treatAsChar="0" allowOverlap="1" vertRelTo/horzRelTo="PAPER" textWrap="IN_FRONT_OF_TEXT"`, 앵커는 표 2를 감싼 문단의 run. 크기는 셀(6441 × 3589) 안에 들어가게 비율 유지, 좌표는 여백(좌 4251, 상 4251+머리말 2834)과 표 1 높이·사이 문단·표 2 행 높이를 합산해 계산하고 **PDF 렌더로 실측 보정**한다. 투명 PNG는 정규화하지 말고 원본 바이트 그대로 넣는다.

셀 치환 방법. 각 대상 `<hp:tc>`의 `<hp:subList>` 안 문단들을 통째로 새 문단으로 갈아 끼운다. 새 문단은 그 셀의 첫 문단이 쓰던 `paraPrIDRef`·`styleIDRef`·첫 run의 `charPrIDRef`를 그대로 물려받아 글꼴·정렬이 유지되게 한다. `hp:linesegarray`는 지워도 된다(한글이 재계산). XML 특수문자는 이스케이프한다.

이미지 등록. `BinData/imageN.jpg|png` 추가(N은 기존 image1 다음부터), `Contents/content.hpf` `<opf:manifest>`에 `<opf:item id="imageN" href="BinData/imageN.ext" media-type="image/jpeg|png" isEmbeded="1"/>` 추가. `Preview/PrvText.txt`는 손대지 않아도 된다.

### 테스트 `safesys-app/tests/patrol-ledger-hwpx.test.mjs`

`tests/equipment-inspection-export.test.mjs`의 Node 로더(브라우저 모듈을 `ts.transpileModule`로 실행, `document`/`URL.createObjectURL`/`Image` 스텁)를 본뜬다. `fetch`를 스텁해 `public/순회점검 양식.hwpx`와 표본 이미지를 돌려준다. 검증 항목.
- zip 첫 항목이 `mimetype`이고 STORE.
- section0.xml에서 제목·10행 항목·결과·날짜·지구명·소속/직급/성명이 채워졌고 `(서명)` 문구가 남아 있다.
- 서명 pic이 `IN_FRONT_OF_TEXT`·`PAPER`·`allowOverlap="1"`이고 사진 pic이 셀 안에 있다. `hc:pt0`~`pt3`, `imgRect`, `renderingInfo` 등 완전한 구조.
- content.hpf에 새 이미지 항목이 있고 BinData 파일이 있다.
- 사진·서명이 없는 레코드도 정상 생성되고 원문 `(없는 경우 점검사진)`이 남는다.
- 환경변수 `PATROL_LEDGER_HWPX_SAMPLES=1`이면 표본 hwpx를 `safesys-app/scratch/patrol-ledger/`에 쓴다(폴더는 .gitignore 확인, 없으면 추가하지 말고 보고).
- `package.json`에 `"test:patrol-ledger-hwpx": "node --test tests/patrol-ledger-hwpx.test.mjs"` 추가. (`test:patrol-ledger`는 다른 Worker가 만든다 — 손대지 마라.)

### 한글 검증 루프 (필수)

한글 2022 실행파일은 `C:\Program Files (x86)\Hnc\Office 2022\HOffice120\Bin\Hwp.exe`다. 표본 hwpx(사진+서명 포함, 지적사항 3줄)를 만든 뒤 PowerShell로 다음을 한다.
1. 크래시 테스트 — `Start-Process`로 열고 12초 뒤 `Get-Process Hwp`가 살아 있으면 ALIVE. 끝나면 프로세스를 종료한다.
2. COM(`HWPFrame.HwpObject`, `RegisterModule("FilePathCheckDLL","FilePathCheckerModule")`, `Open(file,"HWPX","")`, `SaveAs(pdf,"PDF","")`, `Quit()`)으로 PDF 저장 후 Read 도구로 PDF를 직접 보고 양식과 배치가 같은지, 서명이 `(서명)` 위에 겹치는지, 사진이 셀 안에 있는지, 표가 한 쪽에 들어가는지 확인한다. 어긋나면 좌표·크기를 고쳐 반복한다.
3. 서명 겹침 좌표는 최종 실측값을 코드 주석에 근거와 함께 남긴다.

## 절차

테스트를 먼저 써서 실패를 본 뒤 구현한다. 끝나기 전에 `safesys-app`에서 `npm run test:patrol-ledger-hwpx`, `npx eslint <변경 파일>`, `npx tsc --noEmit`을 돌린다. 같은 시각에 다른 Worker가 `src/lib/patrol-ledger/records.ts`, `tbm-work.ts`, `src/app/api/ai/patrol-ledger/route.ts`, `database/…순회점검대장.sql`을 만들고 있다 — 그 파일들은 건드리지 말고, tsc 오류가 그 파일에서만 나면 보고에 적고 넘어가라.

## 완료 보고

`worker_done`에 변경 파일, 테스트 결과, lint·tsc 결과, 한글 ALIVE 여부와 PDF 육안 확인 결과(표본 파일 경로 포함), 남은 의심 지점을 담는다.
