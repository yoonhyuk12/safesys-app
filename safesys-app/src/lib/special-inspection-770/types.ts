// 특별점검(굴삭기 버킷 사고, 안전혁신건설-770) 점검표 항목 정의와 저장 데이터(excavator_inspection JSONB) 타입

export type Special770Judgement = '적정' | '부적정' | '해당없음'

export interface Special770Category {
  /** 1~4. 붙임2·붙임3·붙임4가 공유하는 대분류 번호 */
  no: 1 | 2 | 3 | 4
  title: string
}

export interface Special770ChecklistItem {
  /** '1-1' 형식. 저장 데이터의 키로 쓰므로 바꾸지 않는다. */
  code: string
  category: Special770Category['no']
  /** 붙임2 원문(번호 기호 제외) */
  text: string
  /** 붙임2 원문의 보조 설명 줄 */
  notes?: string[]
}

export const SPECIAL_770_CATEGORIES: readonly Special770Category[] = [
  { no: 1, title: '사전조사 및 절차 준수' },
  { no: 2, title: '운전 시작 전 현장 확인' },
  { no: 3, title: '운전 중 현장 확인' },
  { no: 4, title: '기타 점검 사항' },
]

/** 붙임2 「차량계 건설기계(굴착기) 안전관리 점검표」 고정 15항목. 4. 기타는 자유 기술이라 여기 없다. */
export const SPECIAL_770_CHECKLIST: readonly Special770ChecklistItem[] = [
  { code: '1-1', category: 1, text: '작업 전 위험성평가 및 TBM을 실시하였는가?' },
  { code: '1-2', category: 1, text: '작업 전 작업계획서를 작성하고, 위험공종작업허가서(PTW)를 통해 발주자의 승인을 득하였는가?' },
  { code: '1-3', category: 1, text: '굴착기 운전자의 적정 자격 확인', notes: ['* 3톤 미만: 소형건설기계 조종교육 이수', '  3톤 이상: 건설기계조종사면허(굴착기)'] },
  { code: '1-4', category: 1, text: '건설기계 법정 필수 검사 여부 확인', notes: ['* 「건설기계관리법」 제13조 등'] },
  { code: '2-1', category: 2, text: '작업계획서에서 계획한 대로 굴착기 운행경로 및 작업방법 현장 적용 여부 확인' },
  { code: '2-2', category: 2, text: '작업계획서에서 계획한 대로 작업지휘자 및 유도자 적정 위치 배치 확인' },
  { code: '2-3', category: 2, text: '인양작업 시작 전 화물의 무게가 굴착기 정격하중의 무게를 넘지 않도록 확인' },
  { code: '2-4', category: 2, text: '인양작업이 침하 우려가 없는 평평한 장소에서 진행되는지 확인' },
  { code: '2-5', category: 2, text: '퀵커플러 및 달기구에 해지 장치 설치 여부 확인' },
  { code: '2-6', category: 2, text: '인양로프 노후 및 파손 상태 확인' },
  { code: '2-7', category: 2, text: '인양물 인근의 작업자 출입 통제 및 유도자 배치' },
  { code: '3-1', category: 3, text: '버킷 등 작업 장치에 이탈 방지용 안전핀 체결' },
  { code: '3-2', category: 3, text: '굴착기 버킷에 작업자 탑승 금지' },
  { code: '3-3', category: 3, text: '운전자의 운전석 이탈 시 버킷은 지상에 내려놓고 시동키는 차에서 분리' },
  { code: '3-4', category: 3, text: '작업지휘자 및 유도자가 일시적으로 지정 장소 이탈시 작업 중지' },
]

/** 4. 기타 점검 사항 행의 저장 키 */
export const SPECIAL_770_ETC_CODE = '4-1'

/** 총괄표 증빙사진(굴착기 안전핀) 열에 대응하는 항목 */
export const SPECIAL_770_PIN_ITEM_CODE = '3-1'

/** 항목 하나의 판정과, 부적정일 때의 지적·조치 기록 */
export interface Special770ItemResult {
  judgement: Special770Judgement | null
  /** 지적사항. 부적정일 때만 의미가 있다. */
  finding?: string
  /** 조치(예정) 사항 */
  action?: string
  before_photo_url?: string | null
  /** 조치 후 사진. 있으면 조치완료로 본다(287과 같은 규칙). */
  after_photo_url?: string | null
  /** 미조치 시 조치완료 예정일 YYYY-MM-DD */
  action_due_date?: string | null
}

export interface Special770Excavator {
  /** 클라이언트에서 만든 고유 id(crypto.randomUUID) */
  id: string
  /** 건설기계 등록번호(차량번호) */
  vehicle_no: string
  /** 키는 SPECIAL_770_CHECKLIST의 code와 SPECIAL_770_ETC_CODE */
  items: Record<string, Special770ItemResult>
  /** 4. 기타 점검 사항에 현장이 직접 적은 위험요인 */
  etc_text?: string
  /** 버킷 안전핀 체결 증빙사진 */
  pin_photo_url?: string | null
}

/** safety_inspections.excavator_inspection 컬럼에 저장하는 값 */
export interface Special770InspectionData {
  /** 점검반(예: '3급 홍길동, 4급 김철수') */
  inspection_team: string
  /** 점검공종(붙임3 점검지구 현황) */
  inspected_work?: string
  excavators: Special770Excavator[]
  /** 지적사항이 하나도 없을 때 붙임3 사진대지에 넣는 현장점검 사진 */
  site_photo_urls?: string[]
}
