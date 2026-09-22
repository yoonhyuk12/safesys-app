// (AI) 순회점검대장 — 작업장 순회 점검표(공사감독_순회점검.hwpx 양식)의 공용 타입과 상수. 데이터·AI 라우트·HWPX·UI 모듈이 모두 이 계약을 따른다.

export const PATROL_LEDGER_TABLE = 'patrol_ledger_inspections'

/** AI가 만드는 앞 10행. 라우트는 정확히 이 건수를 강제한다. */
export const PATROL_LEDGER_AI_ITEM_COUNT = 10
/** 뒤 3행에 붙는 TBM 대책(solution_1~3) 건수. */
export const PATROL_LEDGER_TBM_SOLUTION_COUNT = 3
/** 양식 표는 점검사항 13행으로 고정되어 있다. 앞 10행은 AI, 뒤 3행은 TBM 대책 이행 여부다. */
export const PATROL_LEDGER_ITEM_COUNT = 13
/** AI 10행 중 앞 5행은 "(작업장 공통)", 뒤 5행은 "(테마)" — 양식 원본의 배치를 그대로 따른다. */
export const PATROL_LEDGER_COMMON_COUNT = 5

export const PATROL_LEDGER_CATEGORIES = ['작업장 공통', '테마', 'TBM 대책'] as const
export type PatrolLedgerCategory = (typeof PATROL_LEDGER_CATEGORIES)[number]

/** 점검결과 칸에 그대로 인쇄되는 값. 빈 문자열은 미점검이다. */
export const PATROL_LEDGER_RESULTS = ['양호', '미흡', '해당없음'] as const
export type PatrolLedgerResult = (typeof PATROL_LEDGER_RESULTS)[number] | ''

export const PATROL_LEDGER_PHOTO_KINDS = ['finding', 'overview'] as const
export type PatrolLedgerPhotoKind = (typeof PATROL_LEDGER_PHOTO_KINDS)[number]
export const PATROL_LEDGER_PHOTO_KIND_LABELS: Record<PatrolLedgerPhotoKind, string> = { finding: '지적사진', overview: '전경사진' }

export interface PatrolLedgerItem {
  /** 1부터 13까지의 행 번호. 11~13은 TBM 대책 이행 여부다. */
  no: number
  category: PatrolLedgerCategory
  /** "(카테고리)" 접두어를 뺀 점검사항 본문. 출력 시 " (작업장 공통) 본문" 형태로 합쳐 인쇄한다. */
  text: string
  result: PatrolLedgerResult
}

/** patrol_ledger_inspections 한 행. 컬럼명은 DB와 동일하다. */
export interface PatrolLedgerInspection {
  id: string
  project_id: string
  /** YYYY-MM-DD */
  inspection_date: string
  /** 표 제목 "작업장 순회 점검표(시공사명)"의 괄호 안 */
  contractor_name: string
  /** 하단 표의 지구명. 기본값은 사업명이다. */
  district_name: string
  inspector_affiliation: string
  inspector_position: string
  inspector_name: string
  /** 점검자 본인 서명 PNG dataURL — 출력물의 "(서명)" 문구 위에 겹친다. */
  signature: string
  /** AI 입력으로 쓴 당일 TBM 작업내용 요약 스냅샷 (직접 입력한 경우 그 내용) */
  tbm_work_summary: string
  items: PatrolLedgerItem[]
  /** 지적사항 (여러 줄 가능). 전경사진이면 항상 빈 문자열 */
  finding_text: string
  /** 지적사진(없으면 점검사진) 공개 URL. 없으면 null */
  finding_photo_url: string | null
  /** 사진 구분. finding=지적사진(지적사항 동반), overview=전경·점검사진(지적사항 없음) */
  finding_photo_kind: PatrolLedgerPhotoKind
  /** 점검항목 생성에 쓴 주요 테마 (한 줄, 200자 이하). 없으면 빈 문자열 */
  theme: string
  /** 지적사항 관리대장에서 등록한 조치내용. 없으면 빈 문자열 */
  action_text: string
  /** 조치사진 공개 URL. 'N/A'는 해당없음. 없으면 null */
  action_photo_url: string | null
  /** 조치사진을 올린 날(YYYY-MM-DD). 없으면 null */
  action_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** POST /api/ai/patrol-ledger 요청 본문 */
export interface PatrolLedgerAiRequest {
  projectId: string
  /** YYYY-MM-DD — 이 날짜의 TBM 제출(today_work)로 점검항목을 정한다 */
  inspectionDate: string
  /** TBM이 없거나 사용자가 직접 고쳐 쓴 작업내용. 있으면 TBM 대신 이 내용을 쓴다 */
  workDescription?: string
  /** 주요 테마 (한 줄, 200자 이하). 있으면 뒤 5건 "테마" 항목을 이 테마에 맞춰 만든다 */
  theme?: string
}

/** 최대 테마 길이 — DB CHECK, 라우트 검증, 입력칸 maxLength가 같은 값을 쓴다 */
export const PATROL_LEDGER_THEME_MAX = 200

/** patrol_ledger_weekly_themes 한 행. 회사 공통, week_start는 그 주 월요일(YYYY-MM-DD) */
export interface PatrolLedgerWeeklyTheme {
  week_start: string
  theme: string
  updated_by: string | null
  updated_at: string
}

export interface PatrolLedgerAiItem {
  category: PatrolLedgerCategory
  text: string
}

/** POST /api/ai/patrol-ledger 응답 본문 */
export interface PatrolLedgerAiResponse {
  success: boolean
  /** 정확히 PATROL_LEDGER_AI_ITEM_COUNT건. 앞 PATROL_LEDGER_COMMON_COUNT건이 "작업장 공통" */
  items?: PatrolLedgerAiItem[]
  /** 모델에 넣은 작업내용 요약 — 화면에 보여 주고 저장 시 tbm_work_summary로 남긴다 */
  workSummary?: string
  /** 요약에 쓴 TBM 제출 건수. 직접 입력이면 0 */
  tbmCount?: number
  error?: string
}
