// 위험공종 작업허가제(PTW) 종류별 정의/타입
// 근거: 붙임6. 안전작업허가제 운영 매뉴얼(26년)

export type PermitType = 'high_risk' | 'electrical' | 'hot_work' | 'confined_space'

export type ChecklistResult = '적정' | '부적정' | '해당없음' | ''

export interface ChecklistEntry {
  result: ChecklistResult
  note: string
}

export interface SignatureEntry {
  name: string
  signature: string // base64
}

export type PermitSignatures = Record<string, SignatureEntry>

// ── 화기작업: 산소 및 유해가스 농도 측정결과
export interface HotWorkGasRow {
  substance: string // 측정물질명
  concentration: string // 측정농도
  time: string // 측정시간
  measurer: string // 측정자
  watcher_confirm: string // 감시인 확인
}

// ── 밀폐공간: 산소 및 유해가스 농도 측정결과 (전/중/중 3회)
export interface ConfinedGasRow {
  phase: string // 전/중
  time: string
  o2: string
  co2: string
  h2s: string
  co: string
  ex: string
  measurer: string
  in_count: string // 입(명)
  out_count: string // 출(명)
}

// ── 정전작업: 점검 확인 결과
export interface ElectricalDeviceRow {
  device: string // 점검 기기
  breaker_confirmer: string // 차단확인자
  electric_manager: string // 전기담당자
  site_maintenance: string // 현장정비
}

// ── 화기작업: 기기점검 결과
export interface HotWorkDeviceRow {
  device: string // 점검기기명
  inspector: string // 점검자
  witness: string // 입회자
  worker: string // 작업자
  action: string // 조치사항
}

// ── ① 위험공종 작업허가서(PTW) 전용 폼 데이터
export interface HighRiskPermitFormData {
  permit_date?: string // 허가일자 (보고서 하단 날짜)
  overview: {
    managing_dept: string // 관리부서
    project_name: string // 공사명
    work_period: string // 작업기간
    contractor: string // 수급인(원도급사)
    cost: string // 공사비
    manager: string // 책임자(연락처)
  }
  work: {
    work_type: string // 공종명
    sub_contractor: string // 작업업체명(하도급사)
    target_checks: boolean[] // 대상공종 8항목
    target_other: string // ⑧ 대상작업 기록
    work_detail: string // 작업세부공종
    personnel: string // 작업인원
    location: string // 작업위치
  }
  equipment: {
    equipment_type: string // 장비종류
    spec: string // 규격
    checks: boolean[] // 검토내용 6항목
  }
  risk: {
    factor: string // 위험요소
    measure: string // 개선대책
    disaster_type: string // 재해형태
  }
  supervisor: {
    opinion: string // 검토의견
    action: string // 조치결과
  }
}

// ── ②③④ 공용 폼 데이터 (정전/화기/밀폐공간)
export interface CommonPermitFormData {
  applicant: { company: string; position: string; name: string } // 신청인
  watcher: { dept: string; position: string; name: string } // 감시인 (밀폐공간)
  permit_date: string
  start_time: string
  end_time: string // 종료시간(사후기재)
  location: string // 작업장소
  content: string // 작업내용
  entrants: string // 출입자 명단
  pre_answers: string[] // 사전 필요유무 답변 (config preQuestions 순서)
  checklist: ChecklistEntry[]
  hot_gas_rows: HotWorkGasRow[]
  confined_gas_rows: ConfinedGasRow[]
  electrical_devices: ElectricalDeviceRow[]
  hot_devices: HotWorkDeviceRow[]
  special_note: string // 특별조치 필요사항
}

export type PtwFormData = HighRiskPermitFormData | CommonPermitFormData

// ── DB 레코드
export interface PtwPermitRecord {
  id: string
  project_id: string
  created_by: string
  permit_type: PermitType
  permit_date: string | null
  work_content: string
  applicant_name: string
  is_completed: boolean
  form_data: PtwFormData
  signatures: PermitSignatures
  remarks: string
  created_at: string
  updated_at: string
}

// ── 종류별 설정
export interface SignRole {
  key: string
  label: string // 예: (계획확인)허가자
  sublabel: string // 예: 공사감독원
}

export interface PermitTypeConfig {
  type: PermitType
  label: string // 정식 명칭
  short: string // 목록(승인대장) 표시용
  suffix: string // (수급업체용) 등
  hasWatcher: boolean // 감시인 입력 (밀폐공간)
  preQuestions: { label: string; options: [string, string] }[]
  checklistTitle: string
  checklistItems: string[]
  checklistFootnote?: string
  gasTable?: 'hot_work' | 'confined_space'
  deviceTable?: 'electrical' | 'hot_work'
  signRoles: SignRole[]
}

export const HIGH_RISK_TARGET_WORKS = [
  '2.0m 이상 고소작업',
  '1.5m 이상 굴착·가설공사',
  '철골 구조물 공사',
  '2.0m이상 외부 도장공사',
  '승강기 설치공사',
  '수중 및 수면작업',
  '복통, 잠관 공사',
  '이외의 작업계획서작성 대상',
]

export const HIGH_RISK_EQUIPMENT_CHECKS = [
  '작업계획서 작성/비치',
  '운전자 자격여부 확인',
  '작업지휘자 지정(신호수배치)',
  '작업반경내 간섭물 확인(전선, 설비 등)',
  '기상(풍속 등) 및 노면상태 확인',
  '줄걸이 용구 점검(와이어로프, 슬링벨트 등)',
]

export const PERMIT_TYPE_CONFIGS: Record<PermitType, PermitTypeConfig> = {
  high_risk: {
    type: 'high_risk',
    label: '위험공종 작업허가서(PTW)',
    short: '위험공종',
    suffix: '',
    hasWatcher: false,
    preQuestions: [],
    checklistTitle: '',
    checklistItems: [],
    signRoles: [
      { key: 'writer', label: '작성자', sublabel: '현장대리인' },
      { key: 'permitter', label: '(계획확인)허가자', sublabel: '공사감독원' },
      { key: 'confirmer', label: '(이행확인)확인자', sublabel: '공사감독원' },
    ],
  },
  electrical: {
    type: 'electrical',
    label: '정전작업 허가서',
    short: '정전작업',
    suffix: '(수급업체용)',
    hasWatcher: false,
    preQuestions: [
      { label: '밀폐공간출입 허가 필요유무', options: ['필요', '불필요'] },
      { label: '화기작업 허가 필요유무', options: ['필요', '불필요'] },
    ],
    checklistTitle: '안전조치 요구사항',
    checklistItems: [
      '주 차단 스위치 내림',
      '제어차단기 내림',
      '잠금장치',
      '시험전원 차단',
      '차단표지판 부착',
      '잔류전하 방전',
      '검전기로 충전여부 확인',
      '단락접지기구 설치',
      '현장 스위치 내림',
      '차단표지판 부착',
    ],
    deviceTable: 'electrical',
    signRoles: [
      { key: 'applicant', label: '신청인', sublabel: '수급업체' },
      { key: 'permitter', label: '(계획확인)허가자', sublabel: '용역감독' },
      { key: 'confirmer', label: '(이행확인)확인자', sublabel: '용역감독' },
    ],
  },
  hot_work: {
    type: 'hot_work',
    label: '화기작업 허가서',
    short: '화기작업',
    suffix: '(수급업체용)',
    hasWatcher: false,
    preQuestions: [
      { label: '밀폐공간출입 허가 필요유무', options: ['필요', '불필요'] },
      { label: '정전작업 허가 필요유무', options: ['필요', '불필요'] },
    ],
    checklistTitle: '안전조치 요구사항',
    checklistItems: [
      '작업구역 설정(출입경고 표지)',
      '가스농도 측정',
      '경보 장치 작동 여부 확인',
      '밸브차단 및 차단표지부착',
      '맹판설치 및 표지부착',
      '용기개방 및 압력방출',
      '위험물질방출 및 처리',
      '용기내부 세정 및 처리',
      '불활성가스 치환 및 환기',
      '비산불티차단막 설치',
      '정전/잠금/표지부착',
      '환기 장비',
      '조명 장비',
      '소화기 구비',
      '안전장구 구비',
      '안전교육 실시',
      '운전요원의 입회',
      '화재감시자 배치 및 업무수행 도구 지급여부',
      '특별교육 이수',
      '방폭형 기기 또는 도구',
    ],
    checklistFootnote: '※ 화재감시자 업무수행 도구 : 확성기, 휴대용 조명기구, 방연마스크 등',
    gasTable: 'hot_work',
    deviceTable: 'hot_work',
    signRoles: [
      { key: 'applicant', label: '신청인', sublabel: '수급업체' },
      { key: 'permitter', label: '(계획확인)허가자', sublabel: '용역감독' },
      { key: 'confirmer', label: '(이행확인)확인자', sublabel: '용역감독' },
    ],
  },
  confined_space: {
    type: 'confined_space',
    label: '밀폐공간 작업 허가서',
    short: '밀폐공간',
    suffix: '(수급업체용)',
    hasWatcher: true,
    preQuestions: [
      { label: '화기작업 필요유무', options: ['필요', '불필요'] },
      { label: '내연기관(양수기) 또는 갈탄 등의 사용여부', options: ['사용', '미사용'] },
    ],
    checklistTitle: '안전조치 확인사항',
    checklistItems: [
      '감시인 배치',
      '밸브차단, 불활성가스 치환, 용기세정',
      '측정자의 자격조건 확인',
      '산소농도 및 유해가스농도 (계속)측정',
      '환기장치 설치',
      '전화 및 무선기기 구비',
      '방폭형 전기기계기구의 사용',
      '소화기 비치',
      '관계자외 출입차단 금지 조치',
      '공기공급식 호흡용보호, 보호복, 보호장갑 등 필요',
      '대피용 기구 및 응급구조장비 구비',
      '작업 전 안전교육 실시(TBM 등)',
      '특별교육 이수',
    ],
    checklistFootnote:
      '※ 적정수치 O₂(18~23.5%) CO₂(1.5% 미만) H₂S(10ppm미만) CO(30ppm미만) EX(10%미만) / *중 : 작업을 일시 중단(작업장소 일탈)하였다가 다시 시작하기 전 재측정 필요',
    gasTable: 'confined_space',
    signRoles: [
      { key: 'applicant', label: '신청인', sublabel: '수급업체' },
      { key: 'watcher', label: '감시인', sublabel: '' },
      { key: 'permitter', label: '(계획확인)허가자', sublabel: '용역감독' },
      { key: 'confirmer', label: '(이행확인)확인자', sublabel: '용역감독' },
    ],
  },
}

export const PERMIT_TYPE_ORDER: PermitType[] = ['high_risk', 'electrical', 'hot_work', 'confined_space']

// ── 빈 폼 데이터 생성
export interface HighRiskFormDefaults {
  projectName?: string
  managingDept?: string // 관리부서 (프로젝트 관할 본부/지사)
  contractor?: string // 수급인 (프로젝트 소유자 소속 회사명)
  manager?: string // 책임자 (프로젝트 소유자 성명/연락처)
}

export const createEmptyHighRiskFormData = (defaults?: HighRiskFormDefaults): HighRiskPermitFormData => ({
  permit_date: new Date().toISOString().split('T')[0],
  overview: {
    managing_dept: defaults?.managingDept || '',
    project_name: defaults?.projectName || '',
    // 작업기간 시작일 기본값: 오늘 (종료일은 사용자 입력)
    work_period: `${new Date().toISOString().split('T')[0]} ~ `,
    contractor: defaults?.contractor || '',
    cost: '',
    manager: defaults?.manager || '',
  },
  work: {
    work_type: '',
    sub_contractor: '',
    target_checks: Array.from({ length: HIGH_RISK_TARGET_WORKS.length }, () => false),
    target_other: '',
    work_detail: '',
    personnel: '',
    location: '',
  },
  equipment: {
    equipment_type: '',
    spec: '',
    // 검토내용 기본값: 모두 체크
    checks: Array.from({ length: HIGH_RISK_EQUIPMENT_CHECKS.length }, () => true),
  },
  risk: { factor: '', measure: '', disaster_type: '' },
  supervisor: { opinion: '', action: '' },
})

export const createEmptyCommonFormData = (type: PermitType): CommonPermitFormData => {
  const config = PERMIT_TYPE_CONFIGS[type]
  return {
    applicant: { company: '', position: '', name: '' },
    watcher: { dept: '', position: '', name: '' },
    permit_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    location: '',
    content: '',
    entrants: '',
    pre_answers: Array.from({ length: config.preQuestions.length }, () => ''),
    // 점검결과 기본값: 모두 적정
    checklist: config.checklistItems.map(() => ({ result: '적정' as ChecklistResult, note: '' })),
    hot_gas_rows:
      config.gasTable === 'hot_work'
        ? Array.from({ length: 2 }, () => ({ substance: '', concentration: '', time: '', measurer: '', watcher_confirm: '' }))
        : [],
    confined_gas_rows:
      config.gasTable === 'confined_space'
        ? [
            { phase: '전', time: '', o2: '', co2: '', h2s: '', co: '', ex: '', measurer: '', in_count: '', out_count: '' },
            { phase: '중', time: '', o2: '', co2: '', h2s: '', co: '', ex: '', measurer: '', in_count: '', out_count: '' },
            { phase: '중', time: '', o2: '', co2: '', h2s: '', co: '', ex: '', measurer: '', in_count: '', out_count: '' },
          ]
        : [],
    electrical_devices:
      config.deviceTable === 'electrical'
        ? Array.from({ length: 2 }, () => ({ device: '', breaker_confirmer: '', electric_manager: '', site_maintenance: '' }))
        : [],
    hot_devices:
      config.deviceTable === 'hot_work'
        ? Array.from({ length: 2 }, () => ({ device: '', inspector: '', witness: '', worker: '', action: '' }))
        : [],
    special_note: '',
  }
}

export const createEmptySignatures = (type: PermitType): PermitSignatures => {
  const config = PERMIT_TYPE_CONFIGS[type]
  const signatures: PermitSignatures = {}
  config.signRoles.forEach((role) => {
    signatures[role.key] = { name: '', signature: '' }
  })
  return signatures
}

export const isHighRiskFormData = (data: PtwFormData): data is HighRiskPermitFormData =>
  'overview' in data
