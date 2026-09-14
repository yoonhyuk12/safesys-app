# 작업 로그

<!-- worklog -->
260915_060618 : safesys-app/src/app/api/quality-summary/reject/route.ts 삭제, safesys-app/tests/quality-rejection-cancel.test.mjs 삭제
260915_060609 : .gitignore 수정 — "# Temporary files safesys-app/addresses.txt safesys-app/temp…"
260915_055633 : safesys-app/scratch/equipment-inspection/onepage-samples/edited-visible-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-05-signed.hwpx 수정 외 20건
260915_055614 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const itemRows = restRows.filter(row => row.kind === 'item')…"
260915_055609 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "/** * 점검 행·비고를 뺀 고정 골격. `head`는 제목·기본정보·서명, `tail`은 표머리다. * …"
260915_055437 : plans/20260915_equipment_single_page/checklist.md 수정, plans/20260915_equipment_single_page/context-notes.md 수정, safesys-app/scratch/equipment-inspection/onepage-invariants.mjs 삭제, safesys-app/scratch/equipment-inspection/onepage-verify.mjs 삭제
260915_055424 : safesys-app/scratch/equipment-inspection/onepage-samples/edited-visible-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/onepage-samples/equipment-05-signed.hwpx 추가 외 20건
260915_055415 : docs/architecture.md 수정 — "HWPX는 서명 행과 표머리 사이에 안내 행을 하나 두고 그 위에 그림을 겹치며, 그 높이를 쪽 예산에 반영…"
260915_055334 : plans/20260915_equipment_single_page/checklist.md 수정
260915_055326 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('23종 전부가 보통 길이 비고와 함께 A4 한 장으로 나온다', async () => { cons…"
260915_055307 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('비고는 한 행에 통째로 실리고 원문과 한 글자도 다르지 않다', async () => { cons…"
260915_055240 : safesys-app/scratch/equipment-inspection/single-page-verify/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-verify/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-verify/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-verify/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-verify/equipment-05-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-verify/equipment-06-signed.hwpx 추가 외 19건
260915_055228 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "const withGuide = fixture.find(item => item.id === 'equipmen…"
260915_055216 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "assert.ok(Math.abs(picture.width / picture.height - source.w…"
260915_055210 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('안내 그림은 서명 아래·표머리 위 행 안에 비율 그대로 담긴다', async () => { con…"
260915_055202 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "const filename = `${checklist.id}-signed.hwpx` if (generateS…"
260915_055155 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "const body = $('hp\\:t').text().replace(/\s/g, '') for (cons…"
260915_055150 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "assert.equal(signaturePic.x, left + Math.round((guide.width …"
260915_055145 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('점검 항목 행은 높이가 1 HWPUNIT 이내로 균등하다', async () => { const …"
260915_055141 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('모든 셀은 세로 가운데 정렬이고 본문 예산은 세로 여백 12mm A4 기준이다', async ()…"
260915_055130 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "for (const answer of data.answers) assert.ok($('hp\\:t').tex…"
260915_055119 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('서명 PNG 원본·완전한 이미지 XML·수정한 기록도 한 장', async () => { cons…"
260915_055112 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "// 한글이 어절 단위로 접는 줄 수를 세어 셀 내용이 실제로 차지하는 줄 수를 구한다(exporter와 독…"
260915_055052 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "const index = signatureIndex + 1 return { index, row: page[i…"
260915_055039 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "// 본문이 시작하는 세로 좌표. 떠 있는 그림은 쪽(PAPER) 기준이라 이 값에서 행 높이를 더해 맞춘다…"
260915_055031 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "// 현장에서 실제로 손보는 정도의 기록 — 여러 줄 비고와 수정한 점검 문장이 들어가지만 한 장에 담긴다.…"
260915_055021 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "// 원본 카탈로그의 누락과 HWPX 서명·줄바꿈·기본정보 그리드·행 높이 균등, 그리고 A4 한 장 출력을…"
260915_054938 : safesys-app/scratch/equipment-inspection/onepage-invariants.mjs 추가 — "// 한 장 출력의 불변식 확인 — 조판 단계, 행 높이가 내용 자연 높이 이상인지, 점검 행 균등인지. i…"
260915_054840 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "let layout: SinglePageLayout | null = null for (const [index…"
260915_054836 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 안내 그림을 줄일 수 있는 하한(약 32mm). 이보다 작아져야 한 장에 들어간다면 그림을 더 줄이는 …"
260915_054829 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 그림이 쓸 수 있는 높이는 "남은 자리에서 셀 여백을 뺀 만큼"이다. 하한을 밑돌면 이 단계로는 담지 …"
260915_054823 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "/** * 한 조판 단계로 A4 한 장에 담아 본다. 담기면 행 목록을, 넘치면 null을 돌려준다. * *…"
260915_054804 : plans/20260915_equipment_single_page/context-notes.md 수정, safesys-app/scratch/equipment-inspection/single-page-final/equipment-06-signed.png 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-09-signed.png 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-20-signed.png 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-23-signed.png 추가, safesys-app/scratch/equipment-inspection/single-page-final/layout-metrics.json 추가 외 15건
260915_054645 : safesys-app/scratch/equipment-inspection/single-page-final/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-01-signed.pdf 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-02-signed.pdf 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-final/equipment-03-signed.pdf 추가 외 44건
260915_054508 : safesys-app/scratch/equipment-inspection/single-page-samples/equipment-02-signed.png 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-10-signed.png 추가
260915_054504 : safesys-app/scratch/equipment-inspection/onepage-verify.mjs 수정, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-01-signed.pdf 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-02-signed.pdf 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-03-signed.pdf 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-04-signed.pdf 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-05-signed.pdf 추가 외 21건
260915_054429 : safesys-app/scratch/equipment-inspection/generate-single-page.mjs 추가, safesys-app/scratch/equipment-inspection/onepage-verify.mjs 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/single-page-samples/equipment-04-signed.hwpx 추가 외 20건
260915_054328 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "zip.file('Contents/header.xml', buildHeaderXml(profile)) zip…"
260915_054323 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const content: PageContent = { projectName, record } // 제목·기…"
260915_054238 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "/** 한 장에 담은 결과. `placed`가 비어 있으면 안내 그림이 없는 장비다. */ interface…"
260915_054217 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "/** * 안내 그림을 본문 폭 안에 나란히 눕힌다. 원본 픽셀 크기만으로 계산하므로 DOM 없이도 결과가 …"
260915_054155 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const titleBlock = (profile: FitProfile): Block => makeBlock…"
260915_054140 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 셀 내부 본문(원문 개행마다 문단 분리) 조립 function buildCellBody(ids: Doc…"
260915_054112 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 점검 항목 행에 남는 높이를 균등하게 나눠 준다 — 행 높이 차이는 최대 1 HWPUNIT이다. // …"
260915_054107 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "function makeBlock(profile: FitProfile, kind: RowKind, minHe…"
260915_054045 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "function splitDisplayLines(text: string, cellWidth: number, …"
260915_054040 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 조판 단계와 무관하게 고정인 배치 상수. const SUMMARY_ROW_HEIGHT = 3000 //…"
260915_054027 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "function lineseg(width: number, height: number): string {"
260915_054024 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const refList = `<hh:refList>${buildFontfaces()}${buildBorde…"
260915_054020 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "function buildHeaderXml(profile: FitProfile): string {"
260915_054017 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "function buildParaProperties(profile: FitProfile): string { …"
260915_054013 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "function buildCharProperties(profile: FitProfile): string { …"
260915_054003 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// ── 한 장 맞춤 조판 단계 ── /** * 한 장에 담으려고 차례로 시도하는 조판 단계. 읽기 좋은 …"
260915_053946 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 세로 여백은 위·아래 각각 12mm(여백 8.5mm + 머리말/꼬리말 3.5mm)다. 한글 기본 25.…"
260915_053938 : safesys-app/scratch/equipment-inspection/single-page-browser.mjs 수정, safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260915_053929 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 문단·그림 개체 번호표. id/instid는 문서 안에서만 유일하면 되므로 출력 한 건에 하나씩 새로 …"
260915_053919 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 장비 일일점검 기록을 안내 그림·서명과 함께 A4 한 장에 담은 HWPX로 조립한다."
260915_053913 : plans/20260915_equipment_single_page/context-notes.md 수정
260915_053629 : safesys-app/scratch/equipment-inspection/single-page-browser.mjs 추가
260915_053519 : safesys-app/scratch/equipment-inspection/inspect-single-page.py 추가, safesys-app/scratch/equipment-inspection/validate-single-page.ps1 추가
260915_053339 : plans/20260915_equipment_single_page/checklist.md 추가, plans/20260915_equipment_single_page/context-notes.md 추가, plans/20260915_장비점검표한장출력.md 추가
260915_052902 : plans/20260915_equipment_guide_images/checklist.md 수정, plans/20260915_equipment_guide_images/context-notes.md 수정
260915_052807 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260915_052719 : safesys-app/tests/fixtures/equipment-inspection-guides.json 추가
260915_052714 : plans/20260915_equipment_guide_images/checklist.md 수정, plans/20260915_equipment_guide_images/context-notes.md 수정
260915_052615 : safesys-app/scratch/equipment-inspection/guide-samples/long-visible-signed.hwpx 수정
260915_052605 : docs/architecture.md 수정, docs/auth.md 수정, safesys-app/scratch/equipment-inspection/guide-final-samples/long-visible-signed.hwpx 수정, safesys-app/src/app/project/[id]/page.tsx 수정, safesys-app/src/app/project/[id]/quality-test-ledger/page.tsx 수정, safesys-app/src/components/Dashboard.tsx 수정 외 10건
260915_052602 : safesys-app/scratch/equipment-inspection/guide-final-samples/guide-contact-1.png 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/guide-contact-2.png 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/guide-contact-3.png 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/guide-contact-4.png 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/guide-contact-5.png 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/guide-normal.png 추가 외 2건
260915_052557 : safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-14-signed.pdf 수정, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-15-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-16-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-17-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-18-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-19-signed.pdf 추가 외 7건
260915_052550 : safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-02-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-03-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-04-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-05-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-06-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-07-signed.pdf 추가 외 7건
260915_052544 : safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-01-signed.pdf 추가
260915_052543 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 수정 외 19건
260915_052539 : safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-05-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-final-samples/equipment-06-signed.hwpx 추가 외 20건
260915_052529 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260915_052516 : plans/20260915_equipment_guide_images/context-notes.md 수정, safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260915_052440 : docs/architecture.md 수정
260915_052408 : safesys-app/scratch/equipment-inspection/inspect-guide-layout.py 수정, safesys-app/scratch/equipment-inspection/validate-guide-layout.ps1 수정
260915_052337 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 수정 외 19건
260915_052329 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 수정 외 19건
260915_052326 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 수정 외 19건
260915_052316 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 수정 외 19건
260915_052259 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 수정 외 19건
260915_052254 : database/20260915-0518_품질_성과총괄표_반려기능_제거.sql 추가 — "-- 품질시험 성과총괄표 반려 통보 기능 제거 — 관련 함수와 인덱스를 정리한다. -- 컬럼(rejectio…"
260915_052251 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 비용은 "쪽을 채우려고 점검 행 하나가 늘어나야 하는 높이"의 최댓값이다. 한 쪽에 점검 행이 몰리면 …"
260915_052239 : docs/auth.md 수정, safesys-app/tests/quality-client-edit.test.mjs 수정
260915_052231 : safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-browser.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-detail.png 수정, safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-edit-mobile.png 수정, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-browser.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-detail.png 수정, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-edit-mobile.png 수정 외 11건
260915_052154 : safesys-app/scratch/equipment-inspection/tools/inspect-guide-rows.mjs 수정
260915_052147 : safesys-app/scratch/equipment-inspection/guide-samples/guide-contact-1.png 추가, safesys-app/scratch/equipment-inspection/guide-samples/guide-contact-2.png 추가, safesys-app/scratch/equipment-inspection/guide-samples/guide-contact-3.png 추가, safesys-app/scratch/equipment-inspection/guide-samples/guide-contact-4.png 추가, safesys-app/scratch/equipment-inspection/guide-samples/guide-contact-5.png 추가, safesys-app/scratch/equipment-inspection/guide-samples/guide-normal.png 추가 외 1건
260915_052140 : safesys-app/src/app/project/[id]/page.tsx 수정, safesys-app/src/app/project/[id]/quality-test-ledger/page.tsx 수정
260915_052135 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-22-signed.pdf 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-23-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/layout-render-results.json 추가, safesys-app/scratch/equipment-inspection/guide-samples/long-visible-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/normal-visible-signed.pdf 추가
260915_052131 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.pdf 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-07-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-08-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-09-signed.pdf 추가 외 14건
260915_052124 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.pdf 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.pdf 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.pdf 추가
260915_052123 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.pdf 추가
260915_052119 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 수정 외 22건
260915_052115 : safesys-app/src/app/api/quality-summary/reject/route.ts 삭제
260915_052112 : safesys-app/scratch/equipment-inspection/guide-samples/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-05-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-samples/equipment-06-signed.hwpx 추가 외 20건
260915_052106 : safesys-app/src/components/project/quality/QualitySummaryTab.tsx 수정
260915_052057 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260915_052045 : safesys-app/src/components/project/quality/QualitySummaryTab.tsx 수정
260915_051957 : safesys-app/src/components/project/equipment-inspection/EquipmentGuideImages.tsx 수정 — "alt={`${equipmentName} 안내 그림 ${index + 1}`} // 원본 비율 그대로 칸 너…"
260915_051933 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260915_051915 : safesys-app/tests/_debug-pages.mjs 삭제
260915_051905 : safesys-app/tests/_debug-pages.mjs 수정
260915_051901 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "let pages = best let budget = PAGE_CAPACITY for (;;) { const…"
260915_051854 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 쪽 예산을 줄이면 앞 쪽이 덜 담고 뒤 쪽이 더 담는다. 쪽 수가 늘지 않는 배치들 가운데 가장 높은 …"
260915_051722 : safesys-app/tests/_debug-pages.mjs 수정
260915_051658 : safesys-app/tests/_debug-pages.mjs 추가
260915_051653 : safesys-app/scratch/equipment-inspection/guide-ui/equipment-23-browser.hwpx 수정
260915_051649 : safesys-app/scratch/equipment-inspection/inspect-guide-layout.py 수정 — "// 안내 행이 들어간 뒤의 쪽 구성을 들여다본다(1회용). import { readFile } from '…"
260915_051553 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260915_051518 : safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-browser-page1.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-browser-page2.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-browser-page1.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-browser-page2.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-21-browser-page1.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-23-browser-page1.png 추가
260915_051431 : safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-browser.pdf 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-browser.pdf 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-21-browser.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-21-browser.pdf 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-21-detail.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-21-edit-mobile.png 추가 외 1건
260915_051343 : safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-browser.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-detail.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-20-edit-mobile.png 추가
260915_051339 : safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-browser.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-detail.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-06-edit-mobile.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-23-browser.hwpx 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-23-detail.png 추가, safesys-app/scratch/equipment-inspection/guide-ui/equipment-23-edit-mobile.png 추가 외 1건
260915_051231 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "BODY_TOP + heightAbove + Math.round((signatureRowHeight - si…"
260915_051224 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "signatureRow(record.inspector_name), // 안내 그림은 첫 쪽 점검 항목 바로 …"
260915_051220 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const collector = new ImageCollector() const signatureId = a…"
260915_051212 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "/** 묶음에 넣을 안내 그림 한 장 — 수집한 이미지 id와 알려진 원본 픽셀 크기. */ interfac…"
260915_051205 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "/** 안내 그림 한 장을 실제로 놓을 크기(HWPUNIT). 원본 픽셀 비율을 그대로 유지한다. */ in…"
260915_051153 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const row: Row = { kind: block.kind, signature: block.signat…"
260915_051150 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "/** item = 같은 쪽에서 높이를 균등하게 나눠 받는 점검 항목 행, note = 남는 높이를 받는 비…"
260915_051142 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const SIGNATURE_ROW_HEIGHT = 3400 const SIGNATURE_MAX_HEIGHT…"
260915_051136 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "import JSZip from 'jszip' import type { EquipmentInspection …"
260915_051130 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionDetail.tsx 수정
260915_051123 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정 — "</div> {/* 장비 안내 그림 */} <EquipmentGuideImages equipmentId={c…"
260915_051120 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정 — "import SignaturePad from '@/components/ui/SignaturePad' impo…"
260915_051117 : safesys-app/src/components/project/equipment-inspection/EquipmentGuideImages.tsx 추가 — "// 장비 안내 도해 — 작성 폼과 상세가 함께 쓰는 원본 비율 유지 이미지 묶음이다. import { eq…"
260915_051102 : safesys-app/src/lib/equipment-inspection-guides.ts 수정
260915_051049 : safesys-app/src/lib/equipment-inspection-guides.ts 수정
260915_051039 : safesys-app/src/lib/equipment-inspection-guides.ts 수정
260915_051038 : safesys-app/tests/quality-rejection.test.mjs 이름변경
260915_051020 : safesys-app/src/lib/equipment-inspection-guides.ts 추가
260915_051014 : safesys-app/src/app/api/quality-summary/reject/route.ts 수정
260915_051001 : safesys-app/public/equipment-inspection/guides/equipment-01/guide-01.jpeg 추가, safesys-app/public/equipment-inspection/guides/equipment-02/guide-01.jpeg 추가, safesys-app/public/equipment-inspection/guides/equipment-03/guide-01.jpeg 추가, safesys-app/public/equipment-inspection/guides/equipment-04/guide-01.jpeg 추가, safesys-app/public/equipment-inspection/guides/equipment-05/guide-01.jpeg 추가, safesys-app/public/equipment-inspection/guides/equipment-06/guide-01.jpeg 추가 외 16건
260915_050957 : safesys-app/src/components/project/quality/QualitySummaryTab.tsx 수정 — "</div>"
260915_050952 : safesys-app/src/components/project/quality/QualitySummaryTab.tsx 수정 — "const handleReadRejection = async () => {"
260915_050946 : safesys-app/src/components/project/quality/QualitySummaryTab.tsx 수정 — "const canReject = currentUserRole === '발주청'"
260915_050851 : safesys-app/scratch/equipment-inspection/guide-browser.mjs 추가
260915_050724 : safesys-app/scratch/equipment-inspection/inspect-guide-layout.py 추가, safesys-app/scratch/equipment-inspection/validate-guide-layout.ps1 추가
260915_050636 : plans/20260915_equipment_guide_images/checklist.md 추가, plans/20260915_equipment_guide_images/context-notes.md 추가, plans/20260915_장비점검안내이미지.md 추가, safesys-app/scratch/equipment-inspection/pdf-guidance/equipment-checklists-and-guides.zip 추가, safesys-app/scratch/equipment-inspection/pdf-guidance/extracted/equipment-01/checklist.pdf 추가, safesys-app/scratch/equipment-inspection/pdf-guidance/extracted/equipment-01/guide-01.jpeg 추가 외 49건
260915_045429 : plans/20260915_equipment_item_edit/checklist.md 수정, plans/20260915_equipment_item_edit/context-notes.md 수정
260915_045326 : docs/database.md 수정, safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정
260915_045312 : safesys-app/scratch/equipment-inspection/item-edit-browser.mjs 수정, safesys-app/scratch/equipment-inspection/item-text-edit/browser-edited.hwpx 추가, safesys-app/scratch/equipment-inspection/item-text-edit/editing-mobile.png 수정, safesys-app/scratch/equipment-inspection/item-text-edit/editing.png 수정
260915_045238 : safesys-app/tests/equipment-inspection-sql.test.mjs 수정
260915_045203 : safesys-app/tests/fixtures/equipment-inspection-db.mjs 수정
260915_045131 : database/20260915-0448_장비_일일점검_작성자_수정_정책.sql 수정, safesys-app/scratch/equipment-inspection/item-text-edit/editing-mobile.png 추가, safesys-app/scratch/equipment-inspection/item-text-edit/editing.png 수정
260915_045056 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정
260915_044927 : plans/20260915_equipment_item_edit/context-notes.md 수정
260915_044853 : database/20260915-0448_장비_일일점검_작성자_수정_정책.sql 수정 — "-- 다시 실행해도 같은 결과가 되도록 먼저 지운다. DROP POLICY IF EXISTS "Author …"
260915_044840 : safesys-app/scratch/equipment-inspection/item-text-edit/editing.png 추가
260915_044743 : docs/architecture.md 수정, docs/database.md 수정
260915_044726 : safesys-app/scratch/equipment-inspection/item-edit-browser.mjs 수정, safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정
260915_044617 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정
260915_044607 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정
260915_044536 : safesys-app/scratch/equipment-inspection/item-text-edit/baseline.png 추가, safesys-app/src/components/project/equipment-inspection/EquipmentInspectionDetail.tsx 수정
260915_044525 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정
260915_044516 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정
260915_044442 : safesys-app/scratch/equipment-inspection/item-edit-browser.mjs 수정
260915_044437 : safesys-app/scratch/equipment-inspection/item-edit-browser.mjs 수정, safesys-app/tests/fixtures/equipment-inspection-db.mjs 수정
260915_044412 : database/20260915-0120_장비_일일점검_작성자_수정_정책.sql 삭제, database/20260915-0448_장비_일일점검_작성자_수정_정책.sql 추가
260915_044352 : safesys-app/scratch/equipment-inspection/item-edit-browser.mjs 수정
260915_044327 : safesys-app/tests/equipment-inspection-sql.test.mjs 수정
260915_044251 : safesys-app/tests/fixtures/equipment-inspection-db.mjs 수정, safesys-app/tests/fixtures/equipment-inspection-schema.sql 수정
260915_044222 : database/20260915-0120_장비_일일점검_작성자_수정_정책.sql 추가 — "-- 장비 일일점검 대장에 작성자 본인 수정(UPDATE) 정책을 추가한다 -- 배경: 20260914-22…"
260915_044157 : safesys-app/src/lib/equipment-inspections.ts 수정 — "export const EQUIPMENT_INSPECTION_MISSING_TABLE = '장비 일일점검 대…"
260915_044151 : safesys-app/src/lib/equipment-inspections.ts 수정 — "/** * 고친 점검을 저장한다. 고칠 수 있는 사람은 제출한 본인뿐이다 — UPDATE RLS도 같은 판정…"
260915_044139 : safesys-app/scratch/equipment-inspection/item-edit-browser.mjs 추가, safesys-app/src/lib/equipment-inspections.ts 수정
260915_044122 : safesys-app/src/lib/equipment-inspections.ts 수정 — "const blankTexts = blankTextEquipmentItems(draft, checklist)…"
260915_044117 : safesys-app/src/lib/equipment-inspections.ts 수정 — "export function setEquipmentAnswerNote( draft: EquipmentInsp…"
260915_044107 : safesys-app/src/lib/equipment-inspections.ts 수정 — "/** * 항목 하나에 대한 점검 결과. 결과가 null이면 아직 점검하지 않은 것이다. * text는 점검…"
260915_044045 : safesys-app/tests/equipment-inspection-validation.test.mjs 수정
260915_044040 : safesys-app/scratch/equipment-inspection/check-item-text.mjs 추가, safesys-app/scratch/equipment-inspection/item-text-edit/edited.hwpx 추가, safesys-app/scratch/equipment-inspection/item-text-edit/edited.pdf 추가, safesys-app/scratch/equipment-inspection/item-text-edit/edited.png 추가
260915_043851 : safesys-app/tests/equipment-inspection-validation.test.mjs 수정
260915_043843 : plans/20260915_equipment_item_edit/context-notes.md 수정, plans/20260915_장비점검항목수정.md 수정
260915_043809 : plans/20260915_equipment_item_edit/context-notes.md 수정, plans/20260915_장비점검항목수정.md 수정
260915_043618 : plans/20260915_equipment_item_edit/checklist.md 추가, plans/20260915_equipment_item_edit/context-notes.md 추가, plans/20260915_장비점검항목수정.md 추가, safesys-app/scratch/equipment-inspection/check-summary-height.mjs 추가, safesys-app/scratch/equipment-inspection/detail-view-tests.txt 추가, safesys-app/scratch/equipment-inspection/refined-provisional/long-visible-signed.hwpx 수정 외 39건
260915_001445 : safesys-app/scratch/equipment-inspection/refined-lint.txt 추가, safesys-app/scratch/equipment-inspection/refined-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-05-signed.hwpx 수정 외 22건
260915_001423 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('문서 전체 글꼴은 휴먼명조이고 모든 언어 항목이 같은 얼굴을 가리킨다', async () => {…"
260915_001410 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "const zip = await JSZip.loadAsync(bytes) const $ = load(awai…"
260915_001401 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "assert.equal(assertEvenItemRows(readPages($)), data.answers.…"
260915_001357 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "const pages = readPages($) assertConsistentGrid(pages, 51024…"
260915_001353 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "// 모든 셀 폭이 하나의 열 그리드에서 colAddr·colSpan으로 도출되었는지 본다(한글 행 재배치 …"
260915_001339 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "const prefixRows = (first: boolean): Row[] => (first ? first…"
260915_001331 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 사용자 지정 글꼴. 모든 언어 항목이 같은 얼굴을 참조해야 한글이 본문 일부를 다른 글꼴로 대체하지 않…"
260915_001253 : safesys-app/scratch/equipment-inspection/refined-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-06-signed.hwpx 수정 외 20건
260915_001238 : safesys-app/scratch/equipment-inspection/inspect-provisional.py 추가, safesys-app/scratch/equipment-inspection/refined-provisional/layout-metrics.json 추가, safesys-app/scratch/equipment-inspection/refined-provisional/refined-contact-1.png 추가, safesys-app/scratch/equipment-inspection/refined-provisional/refined-contact-2.png 추가, safesys-app/scratch/equipment-inspection/refined-provisional/refined-contact-3.png 추가, safesys-app/scratch/equipment-inspection/refined-provisional/refined-contact-4.png 추가 외 2건
260915_001221 : safesys-app/scratch/equipment-inspection/refined-provisional/equipment-22-signed.pdf 수정, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-23-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/layout-render-results.json 추가, safesys-app/scratch/equipment-inspection/refined-provisional/long-visible-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/normal-visible-signed.pdf 추가
260915_001215 : safesys-app/scratch/equipment-inspection/refined-provisional/equipment-15-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-16-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-17-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-18-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-19-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-20-signed.pdf 추가 외 2건
260915_001211 : safesys-app/scratch/equipment-inspection/refined-provisional/equipment-01-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-02-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-03-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-04-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-05-signed.pdf 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-06-signed.pdf 추가 외 8건
260915_001205 : safesys-app/scratch/equipment-inspection/refined-provisional/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-05-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-provisional/equipment-06-signed.hwpx 추가 외 20건
260915_001201 : safesys-app/scratch/equipment-inspection/refined-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-06-signed.hwpx 수정 외 20건
260915_001138 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "test('쪽 경계로 쪼갠 긴 비고를 이어 붙이면 원문과 한 글자도 다르지 않다', async () => {…"
260915_001123 : safesys-app/scratch/equipment-inspection/refined-samples/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/refined-samples/equipment-06-signed.hwpx 수정 외 20건
260915_001115 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 조각의 마지막 개행은 넣지 않는다 — 쪽이 바뀌면 행 자체가 줄바꿈이라 빈 문단만 남는다. const …"
260915_001052 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "return (cell.text ?? '').split('\n').map(line =>"
260915_001049 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "return { spec, segments: splitDisplayLines(trimCellText(spec…"
260915_001045 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// 셀 텍스트 정규화 — 줄 끝 공백과 문자열 뒤쪽 빈 줄을 제거한다(줄 앞 들여쓰기는 의도일 수 있어 보…"
260915_001021 : safesys-app/scratch/equipment-inspection/tools/verify-lossless.mjs 추가 — "// 쪽 경계로 쪼개진 비고 셀을 이어 붙였을 때 원문이 그대로인지 검사한다. import { readFil…"
260915_000938 : safesys-app/scratch/equipment-inspection/tools/inspect-refined.mjs 추가 — "// 생성된 refined 샘플의 쪽·행 높이·셀 구성을 눈으로 확인하는 점검 도구. import { rea…"
260915_000804 : safesys-app/scratch/equipment-inspection/refined-samples/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-samples/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-samples/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-samples/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-samples/equipment-05-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/refined-samples/equipment-06-signed.hwpx 추가 외 20건
260915_000746 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// "(서명)" 문구 위에 겹치는"
260915_000737 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정 — "// A4 세로 용지와 여백(HWPUNIT). 구역 속성·쪽 예산·서명 절대 좌표가 모두 이 값에서 나온다.…"
260915_000720 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260915_000332 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260915_000328 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "return $(tbl).children('hp\\:tr').toArray().map(tr => ({ hei…"
260915_000250 : safesys-app/tests/equipment-inspection-export.test.mjs 수정 — "// 원본 카탈로그의 누락과 HWPX 서명·줄바꿈·기본정보 그리드·행 높이 균등을 검증한다. import a…"
260915_000110 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260915_000059 : safesys-app/scratch/equipment-inspection/human-font-probe.hwpx 추가, safesys-app/scratch/equipment-inspection/human-font-probe.pdf 추가, safesys-app/tests/equipment-inspection-export.test.mjs 수정
260914_235736 : plans/20260914_equipment_daily_inspection/context-notes.md 수정, safesys-app/scratch/equipment-inspection/native-wrap-probe.hwpx 추가, safesys-app/scratch/equipment-inspection/native-wrap-probe.pdf 추가
260914_235228 : safesys-app/scratch/equipment-inspection/inspect-refined-layout.py 추가, safesys-app/scratch/equipment-inspection/validate-refined-layout.ps1 추가
260914_235027 : plans/20260914_equipment_daily_inspection/checklist.md 수정, plans/20260914_equipment_daily_inspection/context-notes.md 수정, plans/20260914_장비일일점검.md 수정, safesys-app/scratch/equipment-inspection/filled-lint.txt 추가, safesys-app/scratch/equipment-inspection/filled-samples/filled-contact-1.png 추가, safesys-app/scratch/equipment-inspection/filled-samples/filled-contact-2.png 추가 외 4건
260914_234331 : safesys-app/scratch/equipment-inspection/filled-samples/equipment-01-signed.pdf 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-02-signed.pdf 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-03-signed.pdf 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-04-signed.pdf 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-05-signed.pdf 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-06-signed.pdf 추가 외 21건
260914_234238 : safesys-app/scratch/equipment-inspection/filled-samples/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-05-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/filled-samples/equipment-06-signed.hwpx 추가 외 20건
260914_234222 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260914_234122 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260914_234037 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정, safesys-app/tests/equipment-inspection-export.test.mjs 수정
260914_234031 : safesys-app/scratch/equipment-inspection/inspect-layout.py 수정, safesys-app/scratch/equipment-inspection/validate-layout.ps1 수정
260914_233949 : safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-06-signed.hwpx 수정 외 18건
260914_233928 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260914_233741 : safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-06-signed.hwpx 수정 외 18건
260914_233721 : safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-06-signed.hwpx 수정 외 18건
260914_233715 : safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-06-signed.hwpx 수정 외 18건
260914_233646 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260914_233630 : safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260914_233541 : plans/20260914_equipment_daily_inspection/context-notes.md 수정, safesys-app/tests/equipment-inspection-export.test.mjs 수정
260914_233509 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260914_233453 : safesys-app/tests/equipment-inspection-export.test.mjs 수정
260914_233402 : safesys-app/scratch/equipment-inspection/inspect-layout.py 추가
260914_233351 : safesys-app/scratch/equipment-inspection/fill-probe-68788.hwpx 추가, safesys-app/scratch/equipment-inspection/fill-probe-68788.pdf 추가, safesys-app/scratch/equipment-inspection/fill-probe-69288.hwpx 추가, safesys-app/scratch/equipment-inspection/fill-probe-69288.pdf 추가, safesys-app/scratch/equipment-inspection/fill-probe-69788.hwpx 추가, safesys-app/scratch/equipment-inspection/fill-probe-69788.pdf 추가 외 1건
260914_233116 : plans/20260914_equipment_daily_inspection/checklist.md 수정, plans/20260914_장비일일점검.md 수정, safesys-app/scratch/equipment-inspection/sticky-tests.txt 추가, safesys-app/scratch/equipment-inspection/ui-empty-revised.png 추가, safesys-app/scratch/equipment-inspection/ui-exclusive-tests.txt 추가, safesys-app/scratch/equipment-inspection/ui-lint.txt 추가 외 2건
260914_231505 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정
260914_231431 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정 — "downloadDisabled={!projectName} onStartInspection={startInsp…"
260914_231428 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정 — "<h2 className="font-semibold text-sm sm:text-base truncate">…"
260914_231422 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정 — "import { ArrowLeft, Plus, X } from 'lucide-react'"
260914_231418 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionList.tsx 수정 — "<td colSpan={5} className="px-4 py-12 text-center"> <p class…"
260914_231413 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionList.tsx 수정 — "downloadDisabled, onStartInspection, onSelect,"
260914_231410 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionList.tsx 수정 — "downloadDisabled: boolean /** 빈 목록일 때만 목록 가운데에 놓이는 점검 시작 진입점…"
260914_231406 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionList.tsx 수정 — "import { Download, Loader2, Plus, Trash2 } from 'lucide-reac…"
260914_231326 : plans/20260914_equipment_daily_inspection/checklist.md 수정, plans/20260914_equipment_daily_inspection/context-notes.md 수정, plans/20260914_장비일일점검.md 수정, safesys-app/scratch/equipment-inspection/final-equipment-script.txt 추가, safesys-app/scratch/equipment-inspection/final-lint.txt 추가, safesys-app/scratch/equipment-inspection/final-tests.txt 추가 외 2건
260914_230009 : safesys-app/src/components/project/equipment-inspection/EquipmentPicker.tsx 수정
260914_230000 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정
260914_225917 : safesys-app/src/app/project/[id]/page.tsx 수정 — "onClick={() => router.push(`/project/${projectId}/inspection…"
260914_225515 : docs/database.md 수정, plans/20260914_equipment_daily_inspection/context-notes.md 수정
260914_225448 : safesys-app/scratch/equipment-inspection/ui-desktop.png 추가
260914_225440 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정, safesys-app/src/components/project/equipment-inspection/EquipmentInspectionDetail.tsx 수정, safesys-app/src/components/project/equipment-inspection/EquipmentInspectionList.tsx 수정
260914_225311 : safesys-app/tests/equipment-inspection-validation.test.mjs 수정 — "// 장비 일일점검 대장의 제출 전 검증·장비 교체 초기화·서명 무효화·조회 오류 구분과 created_by…"
260914_225120 : database/20260914-2245_장비_일일점검_대장.sql 수정
260914_225107 : safesys-app/src/lib/equipment-inspections.ts 수정
260914_225049 : plans/20260914_equipment_daily_inspection/context-notes.md 수정
260914_225042 : safesys-app/src/lib/equipment-inspections.ts 수정
260914_225030 : safesys-app/src/lib/equipment-inspections.ts 수정
260914_225007 : safesys-app/src/lib/equipment-inspections.ts 수정
260914_224951 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 수정
260914_224922 : safesys-app/src/lib/equipment-inspections.ts 수정
260914_224859 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정
260914_224839 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 수정
260914_224824 : safesys-app/src/lib/equipment-inspections.ts 수정
260914_224738 : safesys-app/tests/equipment-inspection-sql.test.mjs 수정
260914_224703 : safesys-app/tests/equipment-inspection-sql.test.mjs 수정
260914_224655 : safesys-app/tests/equipment-inspection-sql.test.mjs 수정
260914_224637 : safesys-app/tests/fixtures/equipment-inspection-db.mjs 수정
260914_224624 : database/20260914-2245_장비_일일점검_대장.sql 수정
260914_224531 : database/20260914-2245_장비_일일점검_대장.sql 수정, database/20260914-2246_merge_projects_equipment_daily_inspections.sql 수정, safesys-app/tests/fixtures/equipment-inspection-db.mjs 수정, safesys-app/tests/fixtures/merge-projects-db.mjs 수정
260914_224526 : database/20260914-1810_장비_일일점검_대장.sql 삭제, database/20260914-1815_merge_projects_equipment_daily_inspections.sql 삭제, database/20260914-2245_장비_일일점검_대장.sql 추가, database/20260914-2246_merge_projects_equipment_daily_inspections.sql 추가
260914_224440 : plans/20260914_equipment_daily_inspection/checklist.md 수정, plans/20260914_equipment_daily_inspection/context-notes.md 수정
260914_224222 : safesys-app/package.json 수정 — ""test:equipment": "node --test tests/equipment-inspection-va…"
260914_224216 : docs/architecture.md 수정
260914_224154 : docs/database.md 수정
260914_224130 : safesys-app/src/app/project/[id]/page.tsx 수정 — "<DocumentFolder title="︵AI︶ 일일안전점검" year={new Date().getFull…"
260914_224124 : safesys-app/src/app/project/[id]/equipment-inspection/page.tsx 추가 — "'use client' // (AI) 장비 일일점검 대장 페이지 — 장비 선택·점검·서명 제출과 제출 목록/…"
260914_224045 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionDetail.tsx 추가 — "'use client' // 제출된 장비 일일점검 한 건의 상세 — 제출 당시 원문 항목·결과·서명을 그대로…"
260914_224028 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionList.tsx 추가 — "'use client' // 제출된 장비 일일점검 목록 표 — 선택·삭제·HWPX 다운로드 진입점이다. im…"
260914_224010 : safesys-app/src/components/project/equipment-inspection/EquipmentInspectionForm.tsx 추가, safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 수정
260914_223937 : safesys-app/src/components/project/equipment-inspection/EquipmentPicker.tsx 추가 — "'use client' // 장비 일일점검에서 원본 양식의 장비 23종 중 하나를 고르는 그리드다. impo…"
260914_223907 : safesys-app/src/lib/equipment-inspections.ts 수정, safesys-app/tests/equipment-inspection-export.test.mjs 수정, safesys-app/tests/equipment-inspection-validation.test.mjs 수정
260914_223840 : safesys-app/src/lib/equipment-inspections.ts 추가 — "// 장비 일일점검 대장의 작성 초안 상태·제출 전 검증·조회/제출을 담당하는 모듈이다. import { s…"
260914_223758 : database/20260914-1815_merge_projects_equipment_daily_inspections.sql 수정
260914_223710 : plans/20260914_equipment_daily_inspection/checklist.md 수정, plans/20260914_equipment_daily_inspection/context-notes.md 수정
260914_223625 : safesys-app/tests/fixtures/merge-projects-db.mjs 수정 — "return MIGRATION_PATHS.map((migrationPath) => readFileSync(m…"
260914_223612 : database/20260914-1810_장비_일일점검_대장.sql 수정
260914_223433 : safesys-app/tests/equipment-inspection-sql.test.mjs 수정, safesys-app/tests/fixtures/equipment-inspection-schema.sql 수정
260914_223416 : safesys-app/scratch/equipment-inspection/contact-1.png 추가, safesys-app/scratch/equipment-inspection/contact-2.png 추가, safesys-app/scratch/equipment-inspection/contact-3.png 추가, safesys-app/scratch/equipment-inspection/implementation-report.md 추가, safesys-app/scratch/equipment-inspection/normal-visible.png 추가, safesys-app/scratch/equipment-inspection/render-results.json 추가 외 1건
260914_223345 : safesys-app/tests/fixtures/equipment-inspection-db.mjs 추가 — "// 장비 일일점검 대장 SQL 테스트용 PGlite 인메모리 DB 준비와 로그인 사용자 전환 헬퍼. imp…"
260914_223319 : safesys-app/scratch/equipment-inspection/equipment-09-signed.pdf 수정, safesys-app/scratch/equipment-inspection/equipment-10-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-11-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-12-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-13-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-14-signed.pdf 추가 외 13건
260914_223303 : safesys-app/scratch/equipment-inspection/equipment-01-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-02-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-03-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-04-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-05-signed.pdf 추가, safesys-app/scratch/equipment-inspection/equipment-06-signed.pdf 추가 외 4건
260914_223231 : safesys-app/tests/merge-projects-sql.test.mjs 수정
260914_223218 : safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-06-signed.hwpx 수정 외 20건
260914_223206 : safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-06-signed.hwpx 수정 외 23건
260914_223151 : safesys-app/tests/fixtures/merge-projects-schema.sql 수정
260914_223139 : safesys-app/tests/fixtures/merge-projects-schema.sql 수정 — "-- FK 자식 2: 장비 일일점검 대장. 점검자 서명과 원문 답변이 병합 후에도 남아야 한다. CREATE…"
260914_223122 : database/20260914-1815_merge_projects_equipment_daily_inspections.sql 추가
260914_223105 : safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 수정, safesys-app/scratch/equipment-inspection/equipment-06-signed.hwpx 수정 외 20건
260914_223100 : database/20260914-1810_장비_일일점검_대장.sql 추가, safesys-app/scratch/equipment-inspection/equipment-01-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/equipment-02-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/equipment-03-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/equipment-04-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/equipment-05-signed.hwpx 추가 외 25건
260914_222951 : safesys-app/scratch/equipment-inspection/long-signed.hwpx 추가, safesys-app/scratch/equipment-inspection/normal-signed.hwpx 추가, safesys-app/src/lib/hwpx/equipment-inspection-hwpx-export.ts 추가, safesys-app/tests/equipment-inspection-validation.test.mjs 추가
260914_222811 : safesys-app/src/lib/equipment-inspection-catalog.ts 추가, safesys-app/src/lib/equipment-inspection-types.ts 추가
260914_222655 : safesys-app/tests/equipment-inspection-export.test.mjs 추가
260914_222601 : safesys-app/tests/equipment-inspection-extract.py 추가, safesys-app/tests/fixtures/equipment-inspection-source.json 추가
260914_222347 : docs/일일안전점검 체크리스트 양식.pdf 추가, plans/20260914_equipment_daily_inspection/checklist.md 추가, plans/20260914_equipment_daily_inspection/context-notes.md 추가, plans/20260914_equipment_daily_inspection/pdf-extracted.txt 추가, plans/20260914_equipment_daily_inspection/source-excavator.png 추가, plans/20260914_장비일일점검.md 추가
260914_171000 : plans/20260914_신규지구_안전컨설팅/checklist.md 수정
260914_170757 : plans/20260914_신규지구_안전컨설팅/context-notes.md 수정
260914_170719 : plans/20260914_신규지구_안전컨설팅/checklist.md 수정
260914_170612 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정
260914_170540 : safesys-app/tests/new-district-consulting-view.test.mjs 수정
260914_170510 : safesys-app/src/components/Dashboard.tsx 수정
260914_170504 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — ")} </div> {summary.excludedCount > 0 && ( <p className="text…"
260914_170457 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — ") : ( <> <div className="overflow-x-auto rounded-md border b…"
260914_170451 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "NewDistrictProjectTable, formatInspectionCount, formatRate, …"
260914_170448 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "{loading ? '—' : formatInspectionCount(summary.inspectionCou…"
260914_170443 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "const ProjectTableHead = () => ( <thead className="bg-gray-5…"
260914_170416 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "/** 선택 연도 코호트가 비었을 때 세 표가 함께 쓰는 안내 행. */ const EmptyCohortRo…"
260914_170411 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "))} </tbody> </table> )"
260914_170408 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "<tbody className="divide-y divide-gray-200 bg-white"> <Subto…"
260914_170404 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "))} </tbody> </table> ) export interface NewDistrictBranchTa…"
260914_170400 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "<tbody className="divide-y divide-gray-200 bg-white"> <Subto…"
260914_170354 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "<td className={`${CELL_CLASS} text-gray-700`}>{formatInspect…"
260914_170351 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "<td className={`${CELL_CLASS} ${textClass}`}> {formatInspect…"
260914_170346 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 수정 — "/** 실시율은 0~1 소수라 백분율 한 자리로 바꿔 보여준다. */ export const formatRa…"
260914_170341 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "// 업무 규칙이 아니라 입력이 터무니없이 내려가지 않게 두는 하한이다. // 2024년 이전 시작 계약이 …"
260914_170335 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "const scopeAppliedRef = useRef(false) const loadedScopeRef =…"
260914_170330 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "useEffect(() => { // 조기 종료 경로에서도 resultLoading을 반드시 내린다. 남겨두…"
260914_170316 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "import { getProjectsByUserBranch, type Project } from '@/lib…"
260914_170313 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "// 준공 프로젝트도 제외하지 않는다 — 빼면 과거 신규지구 실적이 사라진다. // isOrganizatio…"
260914_165917 : plans/20260914_신규지구_안전컨설팅/context-notes.md 수정
260914_165723 : safesys-app/package.json 수정, safesys-app/tests/new-district-consulting-view.spec.tsx 삭제
260914_165718 : safesys-app/tests/new-district-consulting-view.test.mjs 추가 — "// 신규지구 안전컨설팅 표 컴포넌트의 소계·미점검 배지·판정 불가·점검일 나열·지사 순서·빈 결과 마크업을…"
260914_165639 : safesys-app/tests/new-district-consulting.test.mjs 수정
260914_165555 : safesys-app/src/components/Dashboard.tsx 수정
260914_165544 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정
260914_165540 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "const MIN_YEAR = 2024 // 착공연도 판정 기준을 서울 달력일과 맞춘다 const CURRE…"
260914_165533 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "import { ArrowLeft, Minus, Plus, RefreshCw, Sprout } from 'l…"
260914_165529 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "{/* 장갑 낀 손을 위해 증감 버튼을 좌우로 벌려 각 44×44 터치 영역을 확보한다 */} <div cl…"
260914_165511 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "<div className="rounded-md border border-blue-200 bg-blue-50…"
260914_165506 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정
260914_165500 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정
260914_165451 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "const emptySubtotal"
260914_165446 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "/** 관할 프로젝트에서"
260914_165438 : plans/20260914_신규지구_안전컨설팅.md 수정, safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정
260914_165425 : safesys-app/src/components/dashboard/NewDistrictConsultingTables.tsx 추가 — "// 신규지구 안전컨설팅의 본부·지사·지구 표를 그리는 순수 표시 컴포넌트 모음이다. 의존성이 없어 node…"
260914_165338 : safesys-app/src/lib/new-district-consulting.ts 수정 — "DEFAULT_CONSULTING_MONTHS, MIN_CONSULTING_MONTHS,"
260914_165335 : safesys-app/src/lib/new-district-consulting-utils.ts 수정 — ".sort(([left], [right]) => compareBranch(hq, left, right))"
260914_165332 : safesys-app/src/lib/new-district-consulting-utils.ts 수정 — "function compareHq(left: string, right: string): number { co…"
260914_165325 : safesys-app/src/lib/new-district-consulting-utils.ts 수정 — "/** * 인정 기간 개월 수를 정수·최소 1개월로 맞춘다. 값이 이상하면 기본값을 쓴다. * 상한은 두지 …"
260914_165318 : safesys-app/src/lib/new-district-consulting-utils.ts 수정 — "import { BRANCH_OPTIONS, HEADQUARTERS_OPTIONS } from '@/lib/…"
260914_165233 : plans/20260914_신규지구_안전컨설팅/review.md 추가
260914_165024 : plans/20260914_신규지구_안전컨설팅/checklist.md 수정
260914_164904 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정
260914_164859 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "// 요약 타일은 지금 보고 있는 단계의 소계를 따른다. 지사로 내려갔는데 관할 전체 수치가 남아 있으면 표…"
260914_164717 : plans/20260914_신규지구_안전컨설팅.md 수정, plans/20260914_신규지구_안전컨설팅/context-notes.md 수정
260914_164704 : plans/20260914_신규지구_안전컨설팅/checklist.md 수정 — "# 작업 체크리스트 - [x] 저장소 지침·기존 패턴·재사용 조사. - [x] 계획 및 집계 기준 작성. -…"
260914_164607 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "/** @jsxImportSource react */ 'use client' // 대표 계약 착공연도로 고른…"
260914_164420 : docs/architecture.md 수정 — "| `accident-analysis-calculation.ts` | 프로젝트-월 단위 KPI, 월별 추이,…"
260914_164416 : docs/architecture.md 수정 — "│ ├── AccidentEntryModal # 본부급 이상 사용자의 사고 입력·수정 폼 │ ├── NewD…"
260914_164412 : safesys-app/package.json 수정 — ""test:new-district": "node --test tests/new-district-consult…"
260914_164409 : safesys-app/tests/new-district-consulting-view.spec.tsx 수정 — "const branches: NewDistrictBranchGroup[] = [ { branch: '수원지사…"
260914_164404 : safesys-app/tests/new-district-consulting-view.spec.tsx 수정 — "// 지사 A 4개 중 2개(50%), 지사 B 1개 중 1개(100%) → 율 평균 75.0%가 아니라 원…"
260914_164346 : safesys-app/tests/new-district-consulting-view.spec.tsx 추가 — "// 신규지구 안전컨설팅 표 컴포넌트의 소계·미점검·판정 불가·점검일 나열·빈 결과 마크업을 검증한다 imp…"
260914_164322 : safesys-app/src/components/Dashboard.tsx 수정 — "<h4 className="text-xs font-medium text-gray-900 mb-1">KRC 패…"
260914_164313 : safesys-app/src/components/Dashboard.tsx 수정 — "{selectedSafetyCard === 'patrol' && ( <PatrolInspectionView …"
260914_164305 : safesys-app/src/components/Dashboard.tsx 수정 — "if (card === 'heatwave' || card === 'manager' || card === 'h…"
260914_164302 : safesys-app/src/components/Dashboard.tsx 수정 — "const card = segments[3] if (card === 'heatwave' || card ===…"
260914_164257 : safesys-app/src/components/Dashboard.tsx 수정 — "ShieldAlert, MessageSquare, Car, Sprout } from 'lucide-react…"
260914_164255 : safesys-app/src/components/Dashboard.tsx 수정 — "import PatrolInspectionView from '@/components/dashboard/Pat…"
260914_164251 : safesys-app/src/app/safe/branch/[branch]/new-district-consulting/page.tsx 추가 — "'use client' // 안전현황 지사별 신규지구 안전컨설팅 카드 라우트 — Dashboard가 경로로 …"
260914_164249 : safesys-app/src/app/safe/new-district-consulting/page.tsx 추가 — "'use client' // 안전현황 신규지구 안전컨설팅 카드 라우트 — Dashboard가 경로로 카드를 …"
260914_164245 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 수정 — "{/* 열 머리글이 지구 단위라 소계는 각 칸에 무엇을 센 값인지 함께 적는다 */} <tr classNam…"
260914_164230 : safesys-app/src/components/dashboard/NewDistrictConsultingView.tsx 추가 — "'use client' // 대표 계약 착공연도로 고른 신규지구의 안전컨설팅 실적을 본부→지사→프로젝트 3단…"
260914_163557 : safesys-app/package.json 수정 — ""test:patrol": "node --test tests/patrol-inspection-utils.te…"
260914_163547 : safesys-app/src/lib/new-district-consulting.ts 추가 — "// 신규지구 안전컨설팅에 필요한 대표 계약·본부 불시점검을 Supabase에서 읽어 집계 결과로 돌려주는 …"
260914_163525 : safesys-app/src/lib/new-district-consulting-utils.ts 추가 — "// 신규지구 안전컨설팅의 대표계약 시작일 해석·인정기간 계산·본부/지사 집계를 담당하는 순수 로직 모음이다…"
260914_163417 : safesys-app/tests/new-district-consulting.test.mjs 추가 — "// 신규지구 안전컨설팅의 대표계약 시작일 해석·인정기간·지구/건수 집계·소계 재계산과 조회 페이지네이션을 …"
260914_163052 : docs/architecture.md 수정
260914_162751 : plans/20260914_신규지구_안전컨설팅.md 추가, plans/20260914_신규지구_안전컨설팅/checklist.md 추가, plans/20260914_신규지구_안전컨설팅/context-notes.md 추가
260914_161856 : plans/20260914_krc_patrol/context-notes.md 수정
260914_161822 : safesys-app/tests/patrol-inspection-route.test.mjs 수정 — "const longAction = '작업 착수 전 관리감독자가 안전난간 설치 상태를 확인하고, 미설치 구간은…"
260914_161807 : safesys-app/src/app/api/ai/patrol-inspection/route.ts 수정 — "// 길이로 자르면 문장이 중간에 끊기므로 줄바꿈만 공백으로 정리하고 원문을 보존한다. const actio…"
260914_161802 : safesys-app/src/app/api/ai/patrol-inspection/route.ts 수정 — "/** 프롬프트로 요청하는 조치내용 권장 길이. 받은 응답을 이 길이로 자르지는 않는다. */ const M…"
260914_161759 : safesys-app/src/app/api/ai/patrol-inspection/route.ts 수정 — "/** * 응답을 만들기에 충분한 출력 토큰을 건수에 비례해 잡는다. * low 추론 토큰도 이 한도에 함께…"
260914_161733 : safesys-app/tests/patrol-inspection-route.test.mjs 수정 — "const rawAction = ' 작업 전 안전점검을 강화한다.\n\n 관리감독자 확인 절차를 정한다. '"
260914_161723 : plans/20260914_krc_patrol/context-notes.md 수정, safesys-app/tests/patrol-inspection-route.test.mjs 수정
260914_161654 : plans/20260914_krc_patrol/context-notes.md 수정
260914_161535 : plans/20260914_krc_patrol.md 수정, plans/20260914_krc_patrol/checklist.md 수정
260914_161339 : docs/architecture.md 수정, plans/20260914_krc_patrol.md 수정, plans/20260914_krc_patrol/context-notes.md 수정, safesys-app/package.json 수정
260914_161121 : safesys-app/src/lib/excel/patrol-inspection-export.ts 수정
260914_161052 : safesys-app/tests/patrol-inspection-export.test.mjs 수정 — "'1. 안전난간 미설치\n2. 개구부 덮개 미고정' )"
260914_161032 : safesys-app/tests/patrol-inspection-export.test.mjs 수정
260914_160917 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160849 : safesys-app/tests/projects-fetch-all.test.mjs 수정
260914_160807 : safesys-app/src/lib/projects.ts 수정
260914_160712 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160643 : safesys-app/tests/projects-fetch-all.test.mjs 추가 — "// getProjectsByUserBranch의 fetchAll 페이지네이션·안정정렬·부분성공 금지를 mo…"
260914_160546 : safesys-app/package.json 수정
260914_160534 : safesys-app/src/app/api/ai/patrol-inspection/route.ts 수정, safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160500 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160451 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160435 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160426 : safesys-app/tests/patrol-inspection-route.test.mjs 수정
260914_160420 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160410 : safesys-app/src/lib/excel/patrol-inspection-export.ts 수정, safesys-app/tests/patrol-inspection-export.test.mjs 수정
260914_160404 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_160340 : safesys-app/src/lib/excel/patrol-inspection-export.ts 수정
260914_160251 : safesys-app/src/lib/projects.ts 수정, safesys-app/tests/patrol-inspection-export.test.mjs 수정
260914_160228 : safesys-app/tests/patrol-inspection-export.test.mjs 추가 — "// 패트롤 엑셀을 실제 ExcelJS 워크북으로 다시 읽어 18열 구성·주소 보완·지연 음영·실패 시 미다…"
260914_160208 : plans/20260914_krc_patrol/context-notes.md 수정
260914_160120 : safesys-app/tests/patrol-inspection-route.test.mjs 추가 — "// 패트롤 AI 라우트의 인증·관할·입력 검증과 모델 payload·응답 엄격 검증을 확인한다. impor…"
260914_155848 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_155757 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_155740 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_155730 : docs/architecture.md 수정, safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_155712 : safesys-app/src/components/Dashboard.tsx 수정
260914_155702 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_155647 : safesys-app/src/lib/excel/patrol-inspection-export.ts 수정
260914_155601 : safesys-app/package.json 수정
260914_155518 : safesys-app/src/app/api/ai/patrol-inspection/route.ts 수정, safesys-app/src/lib/patrol-inspections.ts 수정
260914_155415 : safesys-app/src/lib/excel/patrol-inspection-export.ts 수정
260914_155352 : safesys-app/src/lib/excel/patrol-inspection-export.ts 추가 — "// 패트롤 점검 목록을 AI 작성 열(재발방지대책·재해유형)까지 채워 18열 엑셀로 내려받는다. impor…"
260914_155304 : safesys-app/src/app/api/ai/patrol-inspection/route.ts 추가 — "// 패트롤 점검 엑셀의 조치내용(재발방지대책)·재해유형을 원본 점검에서 생성하는 인증 라우트다. impor…"
260914_155205 : safesys-app/src/lib/patrol-inspections.ts 수정
260914_155202 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_155159 : safesys-app/src/lib/patrol-inspections.ts 수정
260914_155150 : safesys-app/src/lib/patrol-inspection-utils.ts 수정 — "// 패트롤 점검의 분기 범위·조치사진 등록일 복원·조치완료 판정 같은 순수 로직을 모아둔다. import …"
260914_155139 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_155112 : docs/architecture.md 수정, safesys-app/tests/patrol-inspection-utils.test.mjs 수정
260914_155028 : safesys-app/tsconfig.patrolcheck.json 삭제
260914_155021 : safesys-app/tsconfig.patrolcheck.json 추가
260914_155000 : safesys-app/src/lib/patrol-inspections.ts 추가 — "// 패트롤카를 이용한 본부 불시점검을 조직 범위·분기로 조회하고 조치 판정을 함께 제공하는 모듈이다. im…"
260914_154957 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 수정
260914_154926 : safesys-app/src/lib/patrol-inspection-utils.ts 추가 — "// 패트롤 점검의 분기 범위·조치사진 등록일 복원·조치완료 판정 같은 순수 로직을 모아둔다. import …"
260914_154856 : safesys-app/src/components/Dashboard.tsx 수정
260914_154847 : safesys-app/tests/patrol-inspection-utils.test.mjs 수정
260914_154845 : safesys-app/src/components/Dashboard.tsx 수정
260914_154837 : safesys-app/src/components/Dashboard.tsx 수정
260914_154831 : safesys-app/src/app/safe/branch/[branch]/patrol/page.tsx 추가, safesys-app/src/app/safe/patrol/page.tsx 추가, safesys-app/tests/patrol-inspection-utils.test.mjs 추가
260914_154823 : safesys-app/src/components/dashboard/PatrolInspectionView.tsx 추가 — "'use client' // KRC 패트롤 점검(패트롤카를 이용한 본부불시점검)을 본부→지사→프로젝트 점검행…"
260914_154635 : plans/20260914_krc_patrol/context-notes.md 수정
260914_154344 : plans/20260914_krc_patrol.md 추가, plans/20260914_krc_patrol/checklist.md 추가, plans/20260914_krc_patrol/context-notes.md 추가, safesys-app/src/components/dashboard/SafetyHeadquartersView.tsx 수정
260914_143827 : docs/environment.md 수정
260914_112455 : plans/20260914_hq_patrol_finding_type/checklist.md 수정, plans/20260914_hq_patrol_finding_type/context-notes.md 수정
260914_112446 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정
260914_112442 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "const handleCancelNoActionRequired = async (inspection: any,…"
260914_112435 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "const handleNoActionRequired = async (inspection: any, issue…"
260914_112424 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "import { DEFAULT_HEADQUARTERS_FINDING_TYPE, HEADQUARTERS_FIN…"
260914_112413 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "<div className="grid grid-cols-2 gap-2"> {HEADQUARTERS_FINDI…"
260914_112402 : safesys-app/src/lib/inspection/headquarters-finding-type.ts 수정
260914_112350 : safesys-app/tests/headquarters-finding-type.test.mjs 수정
260914_112343 : safesys-app/tests/headquarters-finding-type.test.mjs 수정
260914_112026 : plans/20260914_hq_patrol_finding_type/checklist.md 수정
260914_111915 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "<div className="text-gray-600"> ({inspection.inspector_name}…"
260914_111910 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "<Trash2 className="h-4 w-4" /> </button> </div> </div> </div…"
260914_111848 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "inspector_name: newRecord.inspector_name, patrol_car_used: n…"
260914_111845 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "inspector_name: inspection.inspector_name, patrol_car_used: …"
260914_111842 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "inspector_name: userProfile ? `${userProfile.position || ''}…"
260914_111837 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "setNewRecord({ inspection_date: new Date().toISOString().spl…"
260914_111832 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "inspector_name: userProfile ? `${userProfile.position || ''}…"
260914_111824 : safesys-app/src/app/project/[id]/headquarters-inspection/page.tsx 수정 — "import { downloadHeadquartersInspectionHwpx } from '@/lib/hw…"
260914_111810 : safesys-app/package.json 수정 — ""test:issue-report": "node --test tests/issue-report-a4.test…"
260914_111803 : safesys-app/src/lib/inspection/headquarters-finding-type.ts 추가 — "// 본부불시점검 지적유형 코드·라벨과 정규화 로직을 모아둔다. export type Headquarters…"
260914_111753 : safesys-app/tests/headquarters-finding-type.test.mjs 추가 — "// 본부불시점검 지적유형 정규화·라벨 매핑 순수 로직을 검증한다. import assert from 'no…"
260914_111642 : database/20260914-1116_add_patrol_car_finding_type_to_headquarters_inspections.sql 추가, plans/20260914_hq_patrol_finding_type/20260914_hq_patrol_finding_type.md 추가, plans/20260914_hq_patrol_finding_type/checklist.md 추가, plans/20260914_hq_patrol_finding_type/context-notes.md 추가
260909_152449 : plans/20260909_issue-report-a4.md 수정, plans/20260909_issue-report-a4_checklist.md 수정, plans/20260909_issue-report-a4_context-notes.md 수정
260909_152330 : safesys-app/src/lib/excel/corrective-action-request-export.ts 수정
260909_152323 : safesys-app/tests/issue-report-a4.test.mjs 수정
260909_152310 : safesys-app/src/lib/excel/corrective-action-request-export.ts 수정
260909_152159 : safesys-app/src/lib/excel/corrective-action-request-export.ts 수정
260909_152139 : plans/20260909_issue-report-a4.md 수정, plans/20260909_issue-report-a4_checklist.md 수정, plans/20260909_issue-report-a4_context-notes.md 수정
260909_152057 : safesys-app/src/lib/excel/corrective-action-request-export.ts 수정, safesys-app/src/lib/excel/issue-action-report-export.ts 수정
260909_152047 : safesys-app/tests/issue-report-a4.test.mjs 수정
260909_152025 : safesys-app/src/lib/excel/corrective-action-request-export.ts 수정, safesys-app/src/lib/excel/issue-action-report-export.ts 수정
260909_151749 : safesys-app/.probe/probe2.cjs 삭제, safesys-app/.probe/probe3.cjs 삭제, safesys-app/package.json 수정
260909_151742 : safesys-app/src/lib/excel/issue-action-report-export.ts 수정
260909_151732 : safesys-app/src/lib/excel/corrective-action-request-export.ts 수정
260909_151713 : safesys-app/tests/issue-report-a4.test.mjs 추가 — "// 지적사항 관리 별지 6호·7호 Excel 출력의 사진 셀 내부 배치·A4 인쇄영역·행 높이 픽셀 격자를…"
260909_151442 : safesys-app/.probe/probe3.cjs 추가
260909_151404 : plans/20260909_issue-report-a4_checklist.md 수정, plans/20260909_issue-report-a4_context-notes.md 수정
260909_151311 : plans/20260909_issue-report-a4.md 수정
260909_151114 : safesys-app/.probe/probe2.cjs 추가
260909_150748 : plans/20260909_issue-report-a4_context-notes.md 추가
260909_150714 : plans/20260909_issue-report-a4_checklist.md 추가
260909_150701 : plans/20260909_issue-report-a4.md 추가
260909_134223 : docs/troubleshooting.md 수정
260909_134207 : safesys-app/package.json 수정 — ""test:csi": "node --test tests/csi-sample-seal-scrape.test.m…"
260909_134203 : safesys-app/src/app/project/[id]/page.tsx 수정 — "import { countUnsignedBySigner } from '@/lib/bulk-sign/bulk-…"
260909_134153 : safesys-app/src/app/project/[id]/page.tsx 수정 — "setG2bSyncing(true) try { // latest=1 — 원계약 번호로 저장돼 있어도 최신 변…"
260909_134136 : safesys-app/src/lib/g2b-contract-period.ts 추가 — "// 장기계속 연차 계약은 확정계약번호가 해마다 바뀌어 최신 차수 조회만으로는 최초 착공일을 알 수 없다 —…"
260909_134126 : safesys-app/tests/g2b-contract-period.test.mjs 추가 — "// 장기계속 계약 목록에서 최초 착공일을 고르는 earliestStartDate 를 검증한다. import…"
260909_120133 : plans/20260909_CSI시료봉인_로그인가져오기_context-notes.md 수정
260909_120121 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "<div className="space-y-1"> <label className="flex items-cen…"
260909_120110 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "setRows(json.data.rows) setTotalCount(json.data.totalCount) …"
260909_120104 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "// CSI는 로그인 5회 실패로 계정을 잠근다 — setState는 비동기라 요청 중복은 ref로 동기 차…"
260909_120057 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "export default function CsiSampleSealImport({ onImport }: Cs…"
260909_120050 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "import React, { useEffect, useRef, useState } from 'react' i…"
260909_120040 : safesys-app/package.json 수정 — ""test:csi": "node --test tests/csi-sample-seal-scrape.test.m…"
260909_120036 : safesys-app/tests/csi-credential-store.test.mjs 추가 — "// CSI 자격증명의 기기 저장(localStorage) 왕복·삭제와 저장소를 못 쓰는 상황의 처리를 검증…"
260909_120016 : safesys-app/src/lib/quality/csi-credential-store.ts 추가 — "// CSI 아이디·비밀번호를 이 기기의 브라우저(localStorage)에만 담아 두는 저장소 — base…"
260909_114520 : safesys-app/src/lib/quality/csi-session.ts 수정
260909_114427 : safesys-app/tests/csi-session.test.mjs 수정
260909_114407 : safesys-app/tests/csi-session.test.mjs 수정 — "test('alert 문구의 제어문자를 지우고 200자로 자른다', async () => { const no…"
260909_114400 : safesys-app/tests/csi-sample-seal-scrape.test.mjs 수정 — "assert.equal(fetchCalls[0].params.smpslNo, '0000000624104') …"
260909_114353 : safesys-app/tests/csi-sample-seal-scrape.test.mjs 수정 — "test('페이지 상한을 넘으면 잘렸다고 표시한다', async () => { fetchCalls.lengt…"
260909_114342 : safesys-app/tests/csi-sample-seal-scrape.test.mjs 수정 — "test('목록 조회는 쿠키·검색어를 실어 총건수만큼 페이지를 순차 조회한다', async () => { f…"
260909_114333 : safesys-app/tests/csi-sample-seal-scrape.test.mjs 수정 — "test('총건수는 있는데 행을 못 읽으면 파싱 오류를 던진다', () => { assert.throws((…"
260909_114328 : safesys-app/tests/csi-sample-seal-scrape.test.mjs 수정 — "// 화면 개편으로 상세 링크의 키 속성이 사라진 상황 const renamedHtml = listHtml.…"
260909_114257 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "detail.catalog.find((item) => { const itemKey = normalizeCsi…"
260909_114250 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "// 시험종목 카탈로그는 시험종별 전체 목록이라 시료봉인명과 이름이 맞는 종목의 방법만 기준으로 쓴다 con…"
260909_114243 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "const samples = detail.samples const singleSample = samples.…"
260909_114238 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "target_material: detail.testKind || detail.sealNm, // 시료마다 제…"
260909_114233 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "// 시료봉인명('들밀도시험')과 시험종목명('들밀도')을 견주기 위해 공백과 끝의 '시험'을 떼어낸다 co…"
260909_114225 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "onClick={() => handleImport(row)} disabled={loading || Boole…"
260909_114219 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "id="csi-password" type="password" value={password} autoCompl…"
260909_114214 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "id="csi-user-id" type="text" value={userId} autoComplete="of…"
260909_114208 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "const json = await readJson<CsiSampleSealDetailResponse>(res…"
260909_114202 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "const json = await readJson<CsiSampleSealListResponse>(res) …"
260909_114155 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "const [importingNo, setImportingNo] = useState('') const [im…"
260909_114149 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "// SafeSys API 라우트는 Bearer 토큰을 요구한다 — 세션이 없으면 CSI 호출 자체를 시도하…"
260909_114140 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 수정 — "import React, { useRef, useState } from 'react'"
260909_114136 : safesys-app/src/app/api/csi/sample-seals/detail/route.ts 수정 — "if ( !userId || !password || userId.length > MAX_USER_ID_LEN…"
260909_114130 : safesys-app/src/app/api/csi/sample-seals/detail/route.ts 수정 — "// 로그인 + 상세 1건 조회 + 로그아웃까지 한 요청에서 끝난다 export const maxDurati…"
260909_114124 : safesys-app/src/app/api/csi/sample-seals/route.ts 수정 — "if ( !userId || !password || userId.length > MAX_USER_ID_LEN…"
260909_114119 : safesys-app/src/app/api/csi/sample-seals/route.ts 수정 — "// 로그인 + 최대 10페이지 순차 조회 + 로그아웃까지 한 요청에서 끝난다 export const max…"
260909_114114 : safesys-app/src/lib/quality/csi-session.ts 수정 — "const alertMatch = body.match(ALERT_RE) throw new CsiLoginEr…"
260909_114105 : safesys-app/src/lib/quality/csi-session.ts 수정
260909_114019 : safesys-app/src/lib/quality/csi-session.ts 수정
260909_113958 : safesys-app/src/lib/quality/csi-session.ts 수정 — "// 로그인 실패는 200 + <script>alert('...')</script> 로 돌아온다 const …"
260909_113949 : safesys-app/src/lib/quality/csi-sample-seal-scrape.ts 수정 — "sealSttsCd: '', }) const detail = parseSampleSealDetail(html…"
260909_113943 : safesys-app/src/lib/quality/csi-sample-seal-scrape.ts 수정 — "): Promise<CsiSampleSealListResult> => { const startedAt = D…"
260909_113939 : safesys-app/src/lib/quality/csi-sample-seal-scrape.ts 수정 — "const pagesAvailable = Math.max(Math.ceil(firstPage.totalCou…"
260909_113927 : safesys-app/src/lib/quality/csi-sample-seal-scrape.ts 수정 — "const totalCount = totalMatch ? Number(totalMatch[1].replace…"
260909_113922 : safesys-app/src/lib/quality/csi-sample-seal-scrape.ts 수정 — "// 정부 사이트 부하 제한 — 목록은 10행/페이지, 최대 10페이지(100행)까지만 순차로 읽는다 con…"
260909_113626 : docs/architecture.md 수정
260909_113616 : plans/20260909_CSI시료봉인_로그인가져오기_context-notes.md 수정
260909_113559 : safesys-app/src/components/project/quality/CsiReportImportModal.tsx 수정
260909_112925 : safesys-app/src/lib/quality/csi-sample-seal-scrape.ts 수정 — "$('table.table-striped tbody tr').each((_, tr) => { const ce…"
260909_112835 : docs/architecture.md 수정 — "- `/api/chat/project-assistant` — 프로젝트 현장 AI 비서(오늘 TBM 브리핑·감…"
260909_112815 : safesys-app/package.json 수정 — ""test:merge-sql": "node --test tests/merge-projects-sql.test…"
260909_112811 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "onClose={() => setShowCsiImport(false)} onImport={handleCsiI…"
260909_112807 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "title="CSI 로그인 후 시료봉인·성적서 불러오기""
260909_112803 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "const csiDateToIso = (value: string | undefined): string | n…"
260909_112756 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "setShowCsiImport(false) setIsListExpanded(false) setShowForm…"
260909_112741 : safesys-app/src/components/project/quality/QualityTestRecordsTab.tsx 수정 — "import CsiReportImportModal from '@/components/project/quali…"
260909_112725 : safesys-app/src/components/project/quality/CsiReportImportModal.tsx 수정 — "))} </div> )} </div> </> )} </div> </div> ) }"
260909_112718 : safesys-app/src/components/project/quality/CsiReportImportModal.tsx 수정 — "{activeTab === 'report' && ( <> <div className="space-y-3 bo…"
260909_112711 : safesys-app/src/components/project/quality/CsiReportImportModal.tsx 수정 — "<div className="flex border-b border-gray-200"> <button type…"
260909_112702 : safesys-app/src/components/project/quality/CsiReportImportModal.tsx 수정 — "export default function CsiReportImportModal({ projectName, …"
260909_112655 : safesys-app/src/components/project/quality/CsiReportImportModal.tsx 수정 — "// CSI(건설공사 안전관리 종합정보망) 품질검사 성적서 조회·가져오기 모달 — 실시대장 등록 폼 프리필용…"
260909_112614 : safesys-app/src/components/project/quality/CsiSampleSealImport.tsx 추가 — "'use client' // CSI 로그인 후 우리 기관이 등록한 시료봉인 목록을 조회해 실시대장 등록 폼으…"
260909_112522 : safesys-app/src/app/api/csi/sample-seals/detail/route.ts 추가 — "// CSI 로그인 세션으로 시료봉인 1건의 상세를 조회하는 API 라우트 — 자격증명은 요청마다 받아 쓰고…"
260909_112506 : safesys-app/src/app/api/csi/sample-seals/route.ts 추가 — "// CSI 로그인 세션으로 시료봉인 목록을 조회하는 API 라우트 — 자격증명은 요청마다 받아 쓰고 저장·…"
260909_112433 : safesys-app/src/lib/quality/csi-sample-seal-scrape.ts 추가 — "// 로그인한 CSI 세션으로 시료봉인 목록·상세 화면을 스크래핑해 정규화 타입으로 바꾸는 모듈 import…"
260909_112243 : safesys-app/src/lib/quality/csi-session.ts 추가 — "// CSI(gcloud.csi.go.kr) 로그인·로그아웃으로 조회용 세션 쿠키를 얻는 모듈 — 자격증명은…"
260909_112223 : safesys-app/src/lib/quality/csi-sample-seal-types.ts 추가 — "// CSI 시료봉인(품질검사 의뢰 전 단계) 목록·상세 정규화 타입 — API 라우트·가져오기 모달 공유 …"
260909_112157 : safesys-app/tests/csi-session.test.mjs 추가 — "// CSI 로그인·로그아웃 요청 형식과 성공/실패 판정을 fetch 모킹으로 검증한다. import ass…"
260909_112125 : safesys-app/tests/csi-sample-seal-scrape.test.mjs 추가 — "// CSI 시료봉인 목록·상세 HTML 파싱과 페이지 순회를 실측 픽스처로 검증한다. import asse…"
260909_111933 : safesys-app/tests/fixtures/csi-sample-seal-list.html 수정, safesys-app/tests/fixtures/csi-sample-seal-login-required.html 수정, safesys-app/tests/fixtures/csi-sample-seal-view.html 수정
260909_111911 : safesys-app/tests/fixtures/csi-sample-seal-list.html 추가, safesys-app/tests/fixtures/csi-sample-seal-login-required.html 추가, safesys-app/tests/fixtures/csi-sample-seal-view.html 추가
260909_111451 : plans/20260909_CSI시료봉인_로그인가져오기.md 추가, plans/20260909_CSI시료봉인_로그인가져오기_checklist.md 추가, plans/20260909_CSI시료봉인_로그인가져오기_context-notes.md 추가
260907_155410 : docs/database.md 수정
260907_155336 : safesys-app/tests/merge-projects-api.test.mjs 수정 — "test('충돌 안내 문구는 0건 항목을 빼고 마지막 낱말에 맞는 조사를 붙인다', () => { asser…"
260907_155326 : safesys-app/tests/merge-projects-api.test.mjs 수정 — "const mergeConflicts = await transpile('../src/lib/merge-con…"
260907_155234 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "assert.match(missingTarget.message, /target/) }) test('미리보기가…"
260907_155216 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "test('두 현장 공정표가 서로 다르면 MERGE_SCHEDULE_CONFLICT로 전체가 롤백된다', a…"
260907_155150 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "겹치는 작업일보와 품질시험 월간보고서가 없고, 시공공정표도 그대로 옮길 수 있습니다."
260907_155143 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "<ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs leadi…"
260907_155134 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "<div className="rounded-md border border-blue-200 bg-blue-50…"
260907_155110 : safesys-app/src/lib/merge-conflicts.ts 수정 — "/** 마지막 글자의 받침에 따라 주격 조사(이/가)를 고른다. */ function subjectParti…"
260907_155056 : database/20260907-1525_merge_projects_preserve_data.sql 수정
260907_155043 : database/20260907-1525_merge_projects_preserve_data.sql 수정
260907_155018 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "v_conflicts := public.preview_project_merge_v2(p_source, p_t…"
260907_155007 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "-- source 공정표를 원본 그대로 옮길 수 없는 두 경우를 모두 충돌로 본다. -- (1) 두 현장 모…"
260907_154936 : plans/20260907_프로젝트병합_데이터보존.md 수정, plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_154453 : plans/20260907_프로젝트병합_데이터보존_checklist.md 수정, plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_154259 : docs/database.md 수정 — "- **프로젝트 병합(`merge_projects` DB 함수)도 함께 갱신한다.** 병합은 자식 테이블의 …"
260907_154227 : docs/database.md 수정 — "- 2026-09-07 기준 `projects`를 참조하는 자식 테이블은 27개이며, 비용 귀속용 `ai_u…"
260907_154206 : plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_154141 : safesys-app/package.json 수정 — ""lint": "next lint", "test:merge-sql": "node --test tests/me…"
260907_154101 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "// 프로젝트 병합 SQL(merge_projects/merge_projects_safe_v2/preview…"
260907_153920 : safesys-app/tests/fixtures/merge-projects-db.mjs 수정 — "/** 스키마와 병합 마이그레이션을 적용한 새 PGlite DB를 만든다. 준비 중 실패하면 인스턴스를 닫고…"
260907_153909 : database/20260907-1525_merge_projects_preserve_data.sql 수정
260907_153903 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "construction_schedule = CASE WHEN v_copy_schedule THEN v_src…"
260907_153854 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "v_copy_address := (v_tgt.site_address IS NULL OR BTRIM(v_tgt…"
260907_153843 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "IF (v_conflicts ->> 'workDailyReports')::INT > 0 OR (v_confl…"
260907_153834 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "v_src projects%ROWTYPE; v_tgt projects%ROWTYPE; v_copy_addre…"
260907_153826 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "-- 공정표 인덱스는 착공·준공일 기준 상대 위치라, 보충 후 날짜가 달라지면 원본 의미가 훼손된다. SEL…"
260907_153816 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "DECLARE v_work_daily INT; v_quality_monthly INT; v_schedule_…"
260907_153810 : database/20260907-1525_merge_projects_preserve_data.sql 수정, plans/20260907_프로젝트병합_데이터보존_checklist.md 수정, plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_153611 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "assert.equal(dates.rows[0].end_date, '2026-12-30')"
260907_153605 : safesys-app/tests/merge-projects-sql.test.mjs 수정 — "await callMerge(db) const target = await projectRow(db, IDS.…"
260907_153449 : database/20260907-1525_merge_projects_preserve_data.sql 수정 — "-- 프로젝트 병합에서 작업일보·품질 월간보고서 삭제를 없애고 누락 등록값을 묶음 단위로 보충한다 -- 배경…"
260907_153447 : safesys-app/tests/merge-projects-api.test.mjs 수정
260907_153425 : safesys-app/tests/merge-projects-api.test.mjs 수정
260907_153400 : safesys-app/tests/merge-projects-api-modal.test.mjs 삭제
260907_153354 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "setError('겹치는 자료가 있어 합칠 수 없습니다.')"
260907_153346 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "{previewLoading && ( <p className="flex items-center gap-2 t…"
260907_153329 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "import { hasMergeConflict, parseMergeConflictCounts, type Me…"
260907_153322 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const conflicts = previewReady && preview ? preview.conflict…"
260907_153309 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "// 4. 겹치는 보고서나 공사기간이 다른 공정표가 있으면 원본 보존을 위해 병합을 시작하지 않는다"
260907_153301 : safesys-app/src/app/api/projects/merge/route.ts 수정
260907_153253 : safesys-app/src/lib/merge-conflicts.ts 수정 — "const parts: string[] = [] if (counts.workDailyReports > 0) …"
260907_153243 : safesys-app/src/lib/merge-conflicts.ts 수정 — "const { message, details } = error as { message?: unknown; d…"
260907_153236 : safesys-app/src/lib/merge-conflicts.ts 수정 — "/** 유한한 0 이상 정수 두 개와 공정표 충돌 여부를 갖춘 객체만 충돌 정보로 인정한다. */ expor…"
260907_153225 : safesys-app/src/lib/merge-conflicts.ts 수정 — "export interface MergeConflictCounts { workDailyReports: num…"
260907_153216 : database/20260907-1525_merge_projects_preserve_data.sql 추가
260907_153125 : safesys-app/tests/fixtures/merge-projects-schema.sql 수정 — "-- 프로젝트 병합 SQL 회귀 테스트용 최소 스키마. 운영 DB 구조(projects + FK 자식 27개…"
260907_153112 : safesys-app/tests/merge-projects-sql.test.mjs 추가 — "// 프로젝트 병합 SQL(merge_projects/merge_projects_safe_v2/preview…"
260907_152854 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "disabled={loading || previewLoading || !previewReady || bloc…"
260907_152853 : safesys-app/tests/fixtures/merge-projects-db.mjs 추가 — "// 프로젝트 병합 SQL 테스트용 PGlite 인메모리 DB 준비와 표준 시드 데이터 헬퍼. import …"
260907_152849 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "{previewLoading && ( <p className="flex items-center gap-2 t…"
260907_152835 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const json = await res.json() as { success?: boolean; error?…"
260907_152822 : plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정, safesys-app/src/components/project/MergeProjectsModal.tsx 수정
260907_152806 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정, tests_tmp_placeholder.txt 삭제
260907_152752 : tests_tmp_placeholder.txt 추가 — "placeholder"
260907_152751 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const previewReady = Boolean( source && target && preview &&…"
260907_152737 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const json = await response.json() as MergePreviewResponse i…"
260907_152717 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "// 확인 모달이 열리면 서버 미리보기로 겹치는 보고서 건수와 공유자 전환 계정을 함께 조회한다. useEf…"
260907_152659 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "const [preview, setPreview] = useState<MergePreview | null>(…"
260907_152654 : safesys-app/tests/fixtures/merge-projects-schema.sql 추가 — "-- 프로젝트 병합 SQL 회귀 테스트용 최소 스키마. 운영 DB 구조(projects + FK 자식 27개…"
260907_152647 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "interface MergePreview { sourceId: string targetId: string t…"
260907_152637 : safesys-app/src/components/project/MergeProjectsModal.tsx 수정 — "import type { Project } from '@/lib/projects' import { supab…"
260907_152628 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "// 4. 겹치는 보고서가 있으면 원본 보존을 위해 병합을 시작하지 않는다 const conflictResu…"
260907_152612 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "return NextResponse.json({ success: true, targetProjectName:…"
260907_152604 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "const conflictResult = await loadMergeConflicts(sourceId, ta…"
260907_152557 : safesys-app/src/app/api/projects/merge/route.ts 수정 — "import { NextRequest, NextResponse } from 'next/server' impo…"
260907_152541 : safesys-app/src/lib/merge-conflicts.ts 추가 — "// 프로젝트 병합 미리보기의 충돌 건수를 엄격히 검증하고 안내 문구·오류 종류를 판별하는 유틸. expor…"
260907_152521 : safesys-app/tests/merge-projects-api-modal.test.mjs 추가 — "// 병합 모달이 서버 미리보기 충돌 건수만 쓰고 폐기 안내를 남기지 않는지 검증하는 정적 회귀 테스트. i…"
260907_152451 : safesys-app/tests/merge-projects-api.test.mjs 추가 — "// 프로젝트 병합 API의 권한·충돌 차단·버전 RPC 호출·오류 응답을 검증한다. import asser…"
260907_152448 : plans/20260907_프로젝트병합_데이터보존_context-notes.md 수정
260907_152323 : safesys-app/package-lock.json 수정, safesys-app/package.json 수정
260907_152136 : plans/20260907_프로젝트병합_데이터보존.md 추가, plans/20260907_프로젝트병합_데이터보존_checklist.md 추가, plans/20260907_프로젝트병합_데이터보존_context-notes.md 추가
260904_180333 : .claude/hooks/log_change.py 수정
260904_180059 : .claude/hooks/worklog.js 삭제
260904_180044 : .claude/hooks/log_change.py 수정, .claude/hooks/session_brief.py 수정
260904_175631 : .claude/skills/worklog/SKILL.md 수정
260904_175615 : .claude/skills/worklog/SKILL.md 수정
260904_175155 : .claude/skills/worklog/SKILL.md 수정 — "--- name: worklog description: log.md 작업 로그 자동 기록 장치(git sta…"
260904_175103 : .gitignore 수정 — ".claude/hooks/.log_state.json .claude/hooks/.log.lock"
260904_111449 : 수정 CLAUDE.md, docs/index.md | 실행 git checkout, git commit, git push
260904_104107 : 수정 CLAUDE.md, docs/index.md | 생성 docs/design-canvas/Controls.dc.html, docs/design-canvas/Deviations.dc.html, docs/design-canvas/Main.dc.html, docs/design-canvas/Patterns.dc.html, docs/design-canvas/Typography.dc.html, docs/design-canvas/canvas.json 외 1개
260903_102837 : 수정 docs/현행시스템_정의서.md | 실행 npm i, sed 's
260903_101323 : 수정 docs/현행시스템_정의서_조사원문.md | 생성 docs/현행시스템_정의서.md | 실행 git mv
260902_105223 : 수정 docs/environment.md
260902_104642 : 수정 docs/environment.md
260902_090759 : 수정 CLAUDE.md, docs/environment.md, docs/troubleshooting.md
260902_235928 : 실행 npm install
260902_185254 : 실행 git push
260902_184958 : 실행 git commit, git push
260902_184423 : 생성 .claude/hooks/worklog.js, .claude/settings.json, .claude/skills/worklog/SKILL.md
