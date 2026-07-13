// 법적이행 확인(안전활동 점검표) 항목 정의와 기본값 생성 유틸

// 여/부 2값 + 미기재('') 허용 — 원본 엑셀의 여/부 체계를 그대로 따른다
export type YN = '여' | '부' | ''

export interface LegalComplianceFormData {
  overview: {
    hq: string                 // 본부/사업단   ← projects.managing_hq
    implementer: string        // 사업시행자    ← projects.managing_branch
    sector: string             // 사업분야      ← projects.project_category
    subProject: string         // 세부사업명    (수동)
    districtName: string       // 지구명        ← projects.project_name
    phase: '기본' | '설계' | '시공' | ''  // 구분 (기본값 '시공')
    discipline: string         // 공종 (기본 '토목')
    dateBasicSurvey: string    // 기본조사 실시 (수동)
    dateDesignBid: string      // 설계입찰 공고 (수동)
    dateContract: string       // 착공(계약서)  ← 대표계약 project_contracts.start_date
    dateActualStart: string    // 착공(실착공)  ← projects.construction_start_date
    dateCompletion: string     // 준공(예정)    ← projects.construction_end_date
    costTotal: string          // 총공사비 합계(백만원) ← g2b_tot_amt ?? total_budget (원→백만원 반올림)
    costNet: string            // 순공사비(백만원, 수동)
    costMaterial: string       // 자재대(백만원, 수동)
    budgetIndustrial: string   // 산업안전보건관리비(천원, 수동)
    budgetSafety: string       // 안전관리비(천원, 수동)
    safetyPlanTarget: string   // 안전관리계획서 대상공종: '①'~'⑧' | '해당없음'
  }
  ownerBasic: {
    basicLedger: { applicable: YN; implemented: YN; adequacy: YN }
    designLedger: { provided: YN; applicable: YN; implemented: YN; adequacy: YN }
    constructionLedger: { provided: YN; applicable: YN; implemented: YN; adequacy: YN }
    designSafetyReview: { applicable: YN; implemented: YN }
    safetyMgmtPlan: { applicable: YN; implemented: YN }
    coordinator: { applicable: YN; designated: YN; notified: YN }
  }
  ownerDetail: {
    dailySelfCheck: YN
    riskWorkPermit: { applicable: YN; targetWorks: string[]; planConfirmed: YN }
    workDirector: YN
    coordinatorActivity: { multiDiscipline: YN; meeting: YN; jointInspection: YN }
    ledgerImplCheck: YN
    safetyCostCheck: YN
    industrialCostCheck: YN
    educationCheck: YN
    implMeeting: { applicable: YN; implemented: YN }
    riskAssessment: { conducted: YN; participants: YN; nearMiss: YN; reduction: YN; sharing: YN }
    smartEquipment: { adopted: YN; costTotal: string; costIndustrial: string; costSafety: string; adoptedAt: string }
  }
  isContractedWork: YN
  contractChecks: {
    qualifiedContractor: YN
    adequatePeriod: YN
    safetyManager: YN
    council: YN
    councilMeeting: YN
    contractorPatrol: YN
    jointPatrol: YN
    evacuationDrill: YN
    infoProvision: YN
  }
  remarks: string
}

// DB 레코드 타입 (legal_compliance_checks)
export interface LegalComplianceRecord {
  id: string
  project_id: string
  check_year: number
  check_quarter: number
  form_data: LegalComplianceFormData
  created_at: string
  updated_at: string
}

// 공종 / 구분 선택지
export const DISCIPLINE_OPTIONS = ['토목', '건축', '기계', '전기', '통신', '소방', '기타'] as const
export const PHASE_OPTIONS = ['기본', '설계', '시공'] as const

// 위험공종 작업허가제 대상공종 (엑셀 AN23 메모 — ①~⑧ 명시, ⑨는 예비 '기타')
export const RISK_WORK_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '①', label: '2.0m 이상 고소작업' },
  { value: '②', label: '1.5m 이상 굴착 및 가설공사' },
  { value: '③', label: '철골 구조물 공사' },
  { value: '④', label: '2.0m 이상 외부 도장공사' },
  { value: '⑤', label: '승강기 설치공사' },
  { value: '⑥', label: '취수탑 공사' },
  { value: '⑦', label: '복통·잠관 공사' },
  { value: '⑧', label: '작업계획서 작성대상 작업' },
  { value: '⑨', label: '기타' },
]

// 안전관리계획서 대상공종 (엑셀 S22 메모 — 건설기술진흥법 시행령 제98조 ①~⑧)
export const SAFETY_PLAN_TARGETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '①', label: '1종·2종 시설물' },
  { value: '②', label: '지하 10m 이상 굴착 건설공사' },
  { value: '③', label: '폭발물 사용 건설공사' },
  { value: '④', label: '10층 이상 16층 미만 건축물 건설공사' },
  { value: '⑤', label: '10층 이상 건축물 리모델링·해체공사' },
  { value: '⑥', label: '건설기계 사용 공사(천공기·항타항발기·타워크레인)' },
  { value: '⑦', label: '가설구조물 사용 건설공사' },
  { value: '⑧', label: '발주자가 안전관리 필요를 인정하는 공사' },
]

// 근거법령 툴팁 — 엑셀 셀 메모 요약(각 항목 근거법령명 포함)
export const TOOLTIPS: Record<string, string> = {
  safetyPlanTarget:
    '[근거법령] 건설기술진흥법 시행령 제98조\n해당하는 위험공종을 선택(1·2종시설물, 지하 10m 이상 굴착, 폭발물 사용, 10층 이상 건축물, 리모델링·해체, 건설기계 사용, 가설구조물, 발주자 인정 공사 등)',
  budgetIndustrial:
    '[근거법령] 산업안전보건법 제72조, 시행규칙 제89조·제89조의2\n[대상] 총 공사금액 2천만원 이상(20.7.1 이전 계약은 4천만원)\n발주자·도급인이 계상기준에 따라 계상, 사용내역서 매월 작성, 6개월마다 확인',
  budgetSafety:
    '[근거법령] 건설기술진흥법 제63조, 규칙 제60조, 건설공사 안전관리 업무수행 지침\n[대상] 모든 건설공사\n발주자가 계약 시 공사금액에 계상, 건설업자가 서류 근거로 정산',
  basicLedger:
    '[근거법령] 산업안전보건법 제67조, 시행령 제55조·제55조의2, 시행규칙 제42조\n[대상] 총 공사금액 50억원 이상(19.6.1 이후 설계입찰공고)\n[방법] 발주자가 계획단계에서 기본안전보건대장을 작성해 설계자에게 제공',
  designLedger:
    '[근거법령] 산업안전보건법 제67조, 시행령 제55조·제55조의2, 시행규칙 제42조\n[대상] 총 공사금액 50억원 이상(19.6.1 이후 설계입찰공고)\n[방법] 설계자가 설계안전보건대장을 작성, 발주자 확인 후 설계서 반영, 계약 체결 시 수급인에게 제공',
  constructionLedger:
    '[근거법령] 산업안전보건법 제67조, 시행령 제55조·제55조의2, 시행규칙 제42조\n[대상] 총 공사금액 50억원 이상(19.6.1 이후 설계입찰공고)\n[방법] 수급인이 공사안전보건대장을 작성',
  designSafetyReview:
    '[근거법령] 건설기술진흥법 제65조 및 시행령 제75조의2\n[방법] 설계자가 설계안전검토보고서 작성 → 발주청이 실시설계 시 국토관리원에 검토 의뢰 → 착공 전 CSI 제출',
  safetyMgmtPlan:
    '[근거법령] 건설기술진흥법 제62조, 시행령 제98조, 규칙 제58조\n[방법] 공사착공 전 건설사업자가 안전관리계획 수립·발주청 제출 → 점검기관 검토 의뢰 → 승인서 발급 후 CSI 제출',
  coordinator:
    '[근거법령] 산업안전보건법 제68조, 시행령 제56조\n[대상] 같은 장소 2개 이상 건설공사 금액 50억원 이상\n[내용] 발주청 공사감독을 안전보건조정자로 지정하고 각 도급인에게 지정사실 통보',
  dailySelfCheck:
    '[근거법령] 公社 건설공사 안전관리지침 제13조\n공사기간 동안 매일 자체안전점검을 실시하고 별지 제4호서식으로 점검결과를 기록·관리',
  riskWorkPermit:
    '[근거법령] 공공공사 추락사고 방지에 관한 지침\n시공자는 2m 이상 고소작업, 1.5m 이상 굴착·가설공사, 철골 구조물, 2m 이상 외부 도장, 승강기 설치 등 위험공종 작업 전 공사감독자·건설사업관리기술인의 승인을 받은 후 착수',
  workDirector:
    '[근거법령] 산업안전보건기준에 관한 규칙 제39조\n제38조제1항 일부 작업의 작업계획서를 작성한 경우 작업지휘자를 지정해 작업계획서에 따라 작업을 지휘',
  coordinatorActivity:
    '[근거법령] 산업안전보건법 제57조\n혼재작업 파악·위험성 파악, 작업 시기·내용·안전보건조치 조정, 도급인 안전보건관리책임자 간 정보공유 확인 등 조정자 업무 수행',
  ledgerImplCheck:
    '[근거법령] 산업안전보건법 제67조, 시행령 제55조·제55조의2, 시행규칙 제42조\n[방법] 발주자가 설계·공사 안전보건대장에 따른 산재예방 조치 이행여부를 공사시작 후 매 3월마다 1회 이상 확인',
  safetyCostCheck:
    '[근거법령] 건설공사 안전관리 업무수행 지침 제14조의5\n시공자는 안전관리비를 목적에 맞게 관리하고 분기별 사용현황을 작성, 건설사업관리기술인에게 집행실적을 정기 보고',
  industrialCostCheck:
    '[근거법령] 산업안전보건관리비 계상 및 사용기준 제9조제1항\n도급인은 사용내역에 대해 공사 시작 후 6개월마다 1회 이상 발주자 또는 감리자의 확인을 받아야 함(6개월 이내 종료 시 종료 시 확인)',
  educationCheck:
    '[근거] 公社 건설공사안전관리지침 제23조의2\n사업부서장은 수급인이 안전교육 내용을 기록·관리하도록 하고 감독원이 정기적으로 확인(확인 주기는 반기별로 임의 설정, 자율 변경 가능)',
  implMeeting:
    '[근거법령] 건설공사 안전관리 업무수행 지침 제9조의4[국토교통부 고시]\n[대상] 안전관리계획서 작성 대상\n발주청이 시공자·건설사업관리기술인과 함께 안전관리계획 이행·안전관리비 집행 등을 확인하는 회의를 정기 개최',
  riskAssessment:
    '[근거법령] 사업장 위험성평가에 관한 지침[고용노동부 고시] 제5·6·7·9·12·13·15조\n[대상] 모든 건설공사\n최초·정기·수시 위험성평가 실시, 근로자 참여, 아차사고 반영, 감소대책 실행·확인, 결과 공유(TBM 등)',
  smartEquipment:
    '[근거법령] 공공공사 추락사고 방지에 관한 지침\n[대상] 총 공사비 300억 이상 공사\n근로자 위치추적, 지능형 CCTV, 안전서류 DB화, 안전고리 미체결 경고 등 실시간 안전관리 장비 운영',
  qualifiedContractor:
    '[근거법령] 산업안전보건법 제61조 및 중대재해처벌법 시행령 제4조제9호 가목\n公社 적격 수급업체 선정 매뉴얼에 따라 안전보건관리 능력을 보유한 수급업체 선정',
  adequatePeriod:
    '[근거법령] 산업안전보건법 제69조 및 중대재해처벌법 시행령 제4조제9호 다목\n국토교통부 적정 공사기간 확보 가이드라인 적용(公社 개략 공사기간 산정기준 매뉴얼 참고)',
  safetyManager:
    '[근거법령] 산업안전보건법 제62조 및 公社 안전관리규정 제31조\n公社의 안전보건관리책임자를 안전보건총괄책임자로 지정',
  council:
    '[근거법령] 산업안전보건법 제64조\n도급인 및 수급인 전원으로 협의체 구성(公社 안전보건관리책임자·관리감독자·담당자, 수급인 전원)',
  councilMeeting:
    '[근거법령] 산업안전보건법 제64조\n안전보건협의체 정기회의를 월 1회 이상 개최하고 회의결과를 기록·보존',
  contractorPatrol:
    '[근거법령] 산업안전보건법 제64조\n[주기] 1주 1회 이상(건설업은 2일 1회 이상) 순회점검, 결과 기록·보존, 수급인은 시정요구 이행',
  jointPatrol:
    '[근거법령] 산업안전보건법 시행규칙 제82조\n[주기] 분기 1회 이상(건설업은 2개월 1회 이상), 점검반은 公社 관리감독자·감독과 수급업체·근로자 등으로 구성',
  evacuationDrill:
    '[근거법령] 중대재해처벌법 시행령 제4조제8호\n화재·폭발, 붕괴, 지진 등 위험장소 대상 公社-수급인 합동 또는 수급인 자체 대피훈련 실시, 결과 기록',
  infoProvision:
    '[근거법령] 산업안전보건법 제64조\n용역감독이 해당 작업 시작 전 위험성평가 결과 등 안전보건 위험정보·안전작업 프로그램을 수급인에게 제공',
}

// 안전활동 기본사항 — 발주자 항목별 하위 여/부 필드 정의 (엑셀 T~AK열)
export interface OwnerBasicItemDef {
  key: keyof LegalComplianceFormData['ownerBasic']
  label: string
  note?: string
  tooltip: string
  fields: ReadonlyArray<{ key: string; label: string }>
}
export const OWNER_BASIC_ITEMS: ReadonlyArray<OwnerBasicItemDef> = [
  {
    key: 'basicLedger', label: '기본안전보건대장', note: "'19.6.1 이후", tooltip: 'basicLedger',
    fields: [{ key: 'applicable', label: '해당여부' }, { key: 'implemented', label: '이행여부' }, { key: 'adequacy', label: '적정성확인' }],
  },
  {
    key: 'designLedger', label: '설계안전보건대장', tooltip: 'designLedger',
    fields: [{ key: 'provided', label: '기본대장 제공(공문)' }, { key: 'applicable', label: '해당여부' }, { key: 'implemented', label: '이행여부' }, { key: 'adequacy', label: '적정성확인' }],
  },
  {
    key: 'constructionLedger', label: '공사안전보건대장', tooltip: 'constructionLedger',
    fields: [{ key: 'provided', label: '설계대장 제공(공문)' }, { key: 'applicable', label: '해당여부' }, { key: 'implemented', label: '이행여부' }, { key: 'adequacy', label: '적정성확인' }],
  },
  {
    key: 'designSafetyReview', label: '설계의 안전성검토', note: "'16.5.19 이후", tooltip: 'designSafetyReview',
    fields: [{ key: 'applicable', label: '해당여부' }, { key: 'implemented', label: '이행여부' }],
  },
  {
    key: 'safetyMgmtPlan', label: '안전관리계획서 수립', note: "'97.7.1 이후", tooltip: 'safetyMgmtPlan',
    fields: [{ key: 'applicable', label: '해당여부' }, { key: 'implemented', label: '이행여부' }],
  },
  {
    key: 'coordinator', label: '안전보건조정자 지정', note: "'19.6.1 이후", tooltip: 'coordinator',
    fields: [{ key: 'applicable', label: '해당여부' }, { key: 'designated', label: '지정여부' }, { key: 'notified', label: '통보여부' }],
  },
]

// 안전활동 세부사항 — 단일 여/부 항목 (엑셀 AL~BE열)
export interface YNItemDef {
  key: keyof LegalComplianceFormData['ownerDetail']
  label: string
  period?: string
  tooltip: string
}
export const OWNER_DETAIL_SIMPLE: ReadonlyArray<YNItemDef> = [
  { key: 'dailySelfCheck', label: '일일 자체점검 확인', period: '매일/1회', tooltip: 'dailySelfCheck' },
  { key: 'workDirector', label: '작업지휘자 지정', tooltip: 'workDirector' },
  { key: 'ledgerImplCheck', label: '공사안전보건대장 이행(공사감독 점검)', period: '분기별/1회', tooltip: 'ledgerImplCheck' },
  { key: 'safetyCostCheck', label: '안전관리비 사용내역확인', period: '분기별/1회', tooltip: 'safetyCostCheck' },
  { key: 'industrialCostCheck', label: '산업안전보건관리비 사용내역확인', period: '반기별/1회', tooltip: 'industrialCostCheck' },
  { key: 'educationCheck', label: '안전교육 이행여부 확인', period: '반기별/1회', tooltip: 'educationCheck' },
]

// 안전보건조정자 활동 하위 필드 (엑셀 AY~BA열)
export const COORDINATOR_ACTIVITY_FIELDS: ReadonlyArray<{ key: string; label: string; period?: string }> = [
  { key: 'multiDiscipline', label: '복합공종 시행여부' },
  { key: 'meeting', label: '회의(최초·정기) 실시', period: '매월/1회' },
  { key: 'jointInspection', label: '합동점검 실시', period: '매월/1회' },
]

// 위험성평가 이행 점검 5항목 (엑셀 BH~BL열)
export const RISK_ASSESSMENT_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'conducted', label: '위험성평가 실시여부' },
  { key: 'participants', label: '참여자 적정성' },
  { key: 'nearMiss', label: '아차사고 등 반영여부' },
  { key: 'reduction', label: '감소대책 실행·확인' },
  { key: 'sharing', label: '결과 공유' },
]

// 도급사업 안전관리 의무사항 (엑셀 시트2 T~AB열)
export interface ContractCheckDef {
  key: keyof LegalComplianceFormData['contractChecks']
  label: string
  period?: string
  tooltip: string
}
export const CONTRACT_CHECK_ITEMS: ReadonlyArray<ContractCheckDef> = [
  { key: 'qualifiedContractor', label: '적격수급업체 선정', tooltip: 'qualifiedContractor' },
  { key: 'adequatePeriod', label: '적정공사기간 반영', tooltip: 'adequatePeriod' },
  { key: 'safetyManager', label: '안전보건관리책임자 지정', tooltip: 'safetyManager' },
  { key: 'council', label: '안전보건협의체 구성', tooltip: 'council' },
  { key: 'councilMeeting', label: '정기회의 이행', period: '월별/1회', tooltip: 'councilMeeting' },
  { key: 'contractorPatrol', label: '도급자 작업장 순회점검', period: '2일/1회', tooltip: 'contractorPatrol' },
  { key: 'jointPatrol', label: '합동 작업장 순회점검', period: '2개월/1회', tooltip: 'jointPatrol' },
  { key: 'evacuationDrill', label: '비상시 대피훈련 실시', period: '반기별/1회', tooltip: 'evacuationDrill' },
  { key: 'infoProvision', label: '안전·보건에 관한 정보 제공', tooltip: 'infoProvision' },
]

// 금액 입력 표시용 천단위 콤마 (저장값은 숫자만 유지)
export const formatThousands = (v: string): string => (v ? v.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')
export const stripNonDigits = (v: string): string => v.replace(/[^\d]/g, '')

// 총공사비 합계(백만원) = 순공사비 + 자재대. 둘 다 비면 null → 기존 총공사비(예산 자동채움값) 유지
export const sumConstructionCost = (net: string, material: string): string | null =>
  net !== '' || material !== '' ? String((Number(net) || 0) + (Number(material) || 0)) : null

// 대장 의무 대상 판정 임계 — 총 공사금액 50억원(= 5,000백만원) 이상
export const LEDGER_THRESHOLD_MILLION = 5000
export const isBelowLedgerThreshold = (costTotal: string): boolean =>
  costTotal !== '' && Number(costTotal) < LEDGER_THRESHOLD_MILLION

// 빈 form_data 생성 — 모든 여/부는 미기재(''), 구분 '시공' · 공종 '토목' 기본값
export function createEmptyFormData(): LegalComplianceFormData {
  return {
    overview: {
      hq: '', implementer: '', sector: '', subProject: '', districtName: '',
      phase: '시공', discipline: '토목',
      dateBasicSurvey: '', dateDesignBid: '', dateContract: '', dateActualStart: '',
      dateCompletion: '', costTotal: '', costNet: '', costMaterial: '',
      budgetIndustrial: '', budgetSafety: '', safetyPlanTarget: '',
    },
    ownerBasic: {
      basicLedger: { applicable: '', implemented: '', adequacy: '' },
      designLedger: { provided: '', applicable: '', implemented: '', adequacy: '' },
      constructionLedger: { provided: '', applicable: '', implemented: '', adequacy: '' },
      designSafetyReview: { applicable: '', implemented: '' },
      safetyMgmtPlan: { applicable: '', implemented: '' },
      coordinator: { applicable: '', designated: '', notified: '' },
    },
    ownerDetail: {
      dailySelfCheck: '',
      riskWorkPermit: { applicable: '', targetWorks: [], planConfirmed: '' },
      workDirector: '',
      coordinatorActivity: { multiDiscipline: '', meeting: '', jointInspection: '' },
      ledgerImplCheck: '', safetyCostCheck: '', industrialCostCheck: '', educationCheck: '',
      implMeeting: { applicable: '', implemented: '' },
      riskAssessment: { conducted: '', participants: '', nearMiss: '', reduction: '', sharing: '' },
      smartEquipment: { adopted: '', costTotal: '', costIndustrial: '', costSafety: '', adoptedAt: '' },
    },
    isContractedWork: '',
    contractChecks: {
      qualifiedContractor: '', adequatePeriod: '', safetyManager: '', council: '',
      councilMeeting: '', contractorPatrol: '', jointPatrol: '', evacuationDrill: '', infoProvision: '',
    },
    remarks: '',
  }
}

// 저장된 form_data를 빈 기본값 위에 병합 — 스키마 변경·부분 데이터에도 안전하게 렌더한다
export function hydrateFormData(raw: Partial<LegalComplianceFormData> | null | undefined): LegalComplianceFormData {
  const base = createEmptyFormData()
  if (!raw) return base
  const ob: Partial<LegalComplianceFormData['ownerBasic']> = raw.ownerBasic ?? {}
  const od: Partial<LegalComplianceFormData['ownerDetail']> = raw.ownerDetail ?? {}
  return {
    overview: { ...base.overview, ...raw.overview },
    ownerBasic: {
      basicLedger: { ...base.ownerBasic.basicLedger, ...ob.basicLedger },
      designLedger: { ...base.ownerBasic.designLedger, ...ob.designLedger },
      constructionLedger: { ...base.ownerBasic.constructionLedger, ...ob.constructionLedger },
      designSafetyReview: { ...base.ownerBasic.designSafetyReview, ...ob.designSafetyReview },
      safetyMgmtPlan: { ...base.ownerBasic.safetyMgmtPlan, ...ob.safetyMgmtPlan },
      coordinator: { ...base.ownerBasic.coordinator, ...ob.coordinator },
    },
    ownerDetail: {
      ...base.ownerDetail,
      ...od,
      riskWorkPermit: {
        ...base.ownerDetail.riskWorkPermit,
        ...od.riskWorkPermit,
        targetWorks: od.riskWorkPermit?.targetWorks ?? [],
      },
      coordinatorActivity: { ...base.ownerDetail.coordinatorActivity, ...od.coordinatorActivity },
      implMeeting: { ...base.ownerDetail.implMeeting, ...od.implMeeting },
      riskAssessment: { ...base.ownerDetail.riskAssessment, ...od.riskAssessment },
      smartEquipment: { ...base.ownerDetail.smartEquipment, ...od.smartEquipment },
    },
    isContractedWork: raw.isContractedWork ?? '',
    contractChecks: { ...base.contractChecks, ...raw.contractChecks },
    remarks: raw.remarks ?? '',
  }
}
