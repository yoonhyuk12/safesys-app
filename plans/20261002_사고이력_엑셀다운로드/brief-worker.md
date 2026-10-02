# Worker 브리프 — 사고 이력 엑셀 다운로드 버튼

## 목표
`/safe/accident-analysis` 화면의 "사고 이력" 카드 머리글에서 `13건` 건수 표시 **왼쪽**에 엑셀 다운로드 버튼을 두고, 현재 표에 보이는 사고 이력(`analysis.accidentDetails`, 화면 필터·정렬 그대로)을 .xlsx로 내려받게 한다.

## 손댈 파일 (이 셋만)
1. 새 파일 `safesys-app/src/lib/excel/accident-history-export.ts`
2. 새 파일 `safesys-app/tests/accident-history-export.test.mjs`
3. `safesys-app/src/components/dashboard/AccidentAnalysisView.tsx` (버튼·핸들러·행 매핑만)
4. `safesys-app/package.json` 의 `scripts`에 `"test:accident-history-export": "node --test tests/accident-history-export.test.mjs"` 한 줄 추가

그 외 파일·포맷·주석은 건드리지 않는다.

## 1. 엑셀 모듈 설계 (순수하게)
- 첫 줄 한국어 역할 주석: `// 사고 분석 화면의 사고 이력 표를 화면 표기 그대로 엑셀로 내려받는 모듈`
- 표기 계산(보고 지연, 요양일수, 중대도 라벨 등)은 이미 `AccidentAnalysisView.tsx` 안의 모듈 내부 헬퍼(`formatShortDate`, `formatReportDate`, `reportDelayDays`, `isReportDelayed`, `treatmentDays`, `isCompApproved`, `severityLabel`, `formatDate`)에 있다. **엑셀 모듈은 이 로직을 복제하지 않는다.** 화면이 이미 계산한 값을 담은 행 배열을 받는다.
- export 할 것
  ```ts
  export interface AccidentHistoryExcelRow {
    hq: string; branch: string; projectName: string; isExternalSite: boolean
    accidentDate: string        // 화면 표기 그대로 (예: 26-03-04(수))
    reportDate: string          // 화면 표기, 없으면 '-'
    reportDelayDays: number | null
    reportDelayed: boolean
    severity: string            // 라벨 (예: 경상)
    accidentType: string
    compApplied: boolean
    treatmentDays: number | null
    injuredCount: number; fatalCount: number; lostWorkdays: number
    description: string; location: string; workDescription: string; cause: string; preventionAction: string
    daysSinceLatestInspection: number | null
    latestInspectionLabel: string   // 예: '본부불시 · 2026. 3. 1.' 없으면 '사고 전 점검 이력 없음'
    latestInspectionSummary: string
  }
  export function buildAccidentHistoryWorkbook(rows: AccidentHistoryExcelRow[], period: { startDate: string; endDate: string }): ExcelJS.Workbook
  export async function downloadAccidentHistoryExcel(rows: AccidentHistoryExcelRow[], period: { startDate: string; endDate: string }): Promise<void>
  ```
- 시트 이름 `사고이력`. 1행 제목(전 열 병합) `사고 이력 (${startDate} ~ ${endDate})`, 2행 헤더, 3행부터 데이터. 헤더 고정(`views frozen ySplit: 2`).
- 열 순서: 순번, 본부, 지사, 프로젝트, 구분(미등록이면 `미등록`, 아니면 `등록`), 사고일자, 보고일자, 보고 지연(일), 중대도, 사고 유형, 산재 신청(`신청`/`미신청`), 요양일수, 부상자, 사망자, 휴업일수, 사고 개요, 사고 장소, 사고 당시 작업, 사고 원인, 재발방지 대책, 점검 후 경과일, 최근 점검, 최근 점검 내용.
- 숫자 열(보고 지연, 요양일수, 부상자, 사망자, 휴업일수, 점검 후 경과일)은 숫자 셀로 넣고 null이면 빈 셀.
- 보고 지연 행(`reportDelayed`)은 보고일자·보고 지연 셀에 연한 빨강 음영 `FFFCE4E4`.
- 마지막에 **소계 행**: 첫 셀 `소계 N건`, 보고 지연 열에 `지연 K건`(문자열), 산재 신청 열에 `신청 M건`, 부상자·사망자·휴업일수 열은 합계 숫자, 점검 후 경과일 열은 null 아닌 값의 평균(소수 1자리 반올림 숫자, 없으면 빈 셀). 굵게, 회색 음영 `FFF2F2F2`.
- 스타일은 `src/lib/excel/patrol-inspection-export.ts`를 따른다(thin 테두리, 헤더 `FFD9E1F2` 음영·굵게 10pt, 데이터 10pt, 세로 가운데·wrapText). 긴 글 열(개요·장소·작업·원인·대책·최근 점검 내용)은 왼쪽 정렬, 나머지는 가운데.
- 다운로드는 patrol 모듈 끝부분 Blob/anchor 패턴 그대로. 파일명 `사고이력_${startDate}_${endDate}.xlsx` (하이픈 제거해 YYYYMMDD).
- rows가 비면 `throw new Error('내려받을 사고 이력이 없습니다.')`.

## 2. 테스트 (`node --test`, TDD로 먼저 작성)
`tests/patrol-inspection-export.test.mjs` 상단의 `transpile()` 헬퍼 패턴(ts.transpileModule + 의존성 주입 require)을 복사해 `exceljs`를 주입한다. `buildAccidentHistoryWorkbook`을 직접 호출해 검증한다.
- 제목 셀 문구, 헤더 23개 순서
- 데이터 행 값(숫자 셀이 number 타입, null → 빈 값), 미등록 표기
- 지연 행 음영 적용, 비지연 행 미적용
- 소계 행(건수·지연·신청·합계·경과일 평균 1자리, 경과일 전부 null이면 빈 셀)
- 빈 배열이면 download 함수가 예외

## 3. 화면 연결 (`AccidentAnalysisView.tsx`)
- lucide `Download` 아이콘 import 추가.
- 1389행 `<span className="text-xs text-gray-500">{...}건</span>`을 `<div className="flex items-center gap-2">` 로 감싸고, span **앞에** 버튼:
  ```tsx
  <button type="button" onClick={() => void handleHistoryExcelDownload()} disabled={historyExcelDownloading || inspectionsLoading || analysis.accidentDetails.length === 0}
    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
    {historyExcelDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    엑셀
  </button>
  ```
  (`inspectionsLoading` 중엔 경과일이 비므로 비활성화.)
- `const [historyExcelDownloading, setHistoryExcelDownloading] = useState(false)` 추가.
- 핸들러는 `analysis.accidentDetails`를 표 렌더(1434~1546행)와 **같은 규칙**으로 `AccidentHistoryExcelRow`로 매핑한다: projectName/managingHq/managingBranch/isExternalSite 계산식, `formatShortDate(accident.accident_at)`, `formatReportDate(accident)`, `reportDelayDays`, `isReportDelayed`, `severityLabel`, `isCompApproved`, `treatmentDays`, 최근 점검 라벨 `${source_label} · ${formatDate(inspected_at)}`, 요약 없으면 `기록된 점검 내용 없음`.
- 엑셀 모듈은 동적 import(`await import('@/lib/excel/accident-history-export')`)로 불러 번들 증가를 막는다. 실패하면 `setActionError('사고 이력 엑셀을 만들지 못했습니다.')` + `console.error`. finally에서 로딩 해제.
- `dark:` 클래스 금지, 이모지 금지.

## 완료 기준 (safesys-app에서 실행, 결과 원문 보고)
- `npm run test:accident-history-export` 통과
- `npx eslint src/lib/excel/accident-history-export.ts src/components/dashboard/AccidentAnalysisView.tsx` 오류 0
- `npx tsc --noEmit` 오류 0
- `npm run build` 는 실행하지 말 것. 커밋·푸시하지 말 것.
