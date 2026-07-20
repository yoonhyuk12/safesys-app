// 현장 AI 비서 경로 안내용 한국어 화면명 ↔ 프로젝트 라우트 세그먼트 단일 출처

export const PROJECT_ROUTE_MAP: ReadonlyArray<{ label: string; segment: string }> = [
  { label: '계약 현황(공사·용역)', segment: 'contract-status' },
  { label: '(AI) 일일안전점검', segment: 'daily-inspection' },
  { label: '(본부) 안전점검', segment: 'headquarters-inspection' },
  { label: '폭염대비점검', segment: 'heatwave' },
  { label: '휴일작업 관리대장', segment: 'holiday-work' },
  { label: '검사/검측 대장', segment: 'inspection-request' },
  { label: '단속·점검 방문일지', segment: 'inspection-visit-log' },
  { label: '지적사항 관리대장', segment: 'issue-management' },
  { label: '법적이행 확인', segment: 'legal-compliance' },
  { label: '(지사) 안전점검', segment: 'manager-inspection' },
  { label: '자재 수불부', segment: 'material-ledger' },
  { label: '신규근로자 둘러보기', segment: 'new-worker-orientation' },
  { label: '위험공종 작업허가제(PTW)', segment: 'ptw' },
  { label: '품질시험 월례보고서', segment: 'quality-monthly-report' },
  { label: '품질시험 결과 관리대장', segment: 'quality-test-ledger' },
  { label: '(AI) 수시 위험성 평가', segment: 'risk-assessment' },
  { label: '안전 서류 관리', segment: 'safe-documents' },
  { label: '정기점검(해빙,우기,종합,특별)', segment: 'safety-inspection-ledger' },
  { label: '(AI) 공사감독 일지', segment: 'supervisor-diary' },
  { label: '관리자 TBM 활동 점검', segment: 'tbm-safety-inspection' },
  { label: '일일안전교육(AI TBM일지)', segment: 'tbm-submission' },
  { label: 'AI 작업일보', segment: 'work-daily-report' },
  { label: '근로자 관리대장', segment: 'worker-management' },
  { label: '(AI) 작업계획서', segment: 'work-plan' },
  { label: '공정표', segment: 'work-schedule' },
]

export const PROJECT_ROUTE_SEGMENTS: ReadonlySet<string> = new Set(
  PROJECT_ROUTE_MAP.map((route) => route.segment)
)
