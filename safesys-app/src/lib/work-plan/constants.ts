// AI 작업계획서 4종 양식의 고정 문구·선택지·안전계수 상수
import type { ConstructionSurveyType, PlanType } from './types'

export const PLAN_TYPE_OPTIONS: ReadonlyArray<{
  value: PlanType
  appendix: string
  title: string
  shortTitle: string
}> = [
  { value: 'loading', appendix: '붙임2-1', title: '차량계 하역운반기계 등 사용 작업계획서', shortTitle: '하역운반기계' },
  { value: 'construction', appendix: '붙임2-2', title: '차량계 건설기계 등 사용 작업계획서', shortTitle: '건설기계' },
  { value: 'electric', appendix: '붙임2-3', title: '전기 작업계획서', shortTitle: '전기' },
  { value: 'heavy', appendix: '붙임2-4', title: '중량물 취급 작업계획서', shortTitle: '중량물' },
]

export const MAP_LEGEND = [
  { symbol: '▣', label: '장비', style: '검정 사각' },
  { symbol: '→', label: '경로', style: '빨간 화살표' },
  { symbol: '⊙', label: '유도자', style: '파란 이중원' },
  { symbol: '★', label: '작업지휘자', style: '파란 별' },
  { symbol: '⬭', label: '출입통제구역', style: '보라 점선 타원' },
  { symbol: '□', label: '안전표지판', style: '녹색 사각' },
] as const

export const MAP_FOCUS_ITEMS = [
  '속도: 20km/h 이내',
  '지반 지내력 확인',
  '후방 안전장치 확인',
  '작업지휘자·신호수 배치 및 통제',
] as const

export const MAP_FOOTNOTE = '* 필요에 따라 현장에 맞게 수정 또는 여러 장 작성'

export const LIFTING_CAPACITY_NOTES = [
  '중량물 총 하중 = 양중물 최대무게 + 샤클·와이어·슬링벨트 등 줄걸이 총 무게.',
  '최대 양중능력 = 해당 작업환경의 붐 길이 및 작업반경 상 크레인 최대 양중능력.',
] as const

export const LIFTING_CAPACITY_FORMULA = '안전율 = (중량물 총 하중 / 최대 양중능력) × 100%'
export const RIGGING_CAPACITY_FORMULA = '줄걸이 안전하중 = 절단하중 × 줄걸이 수 ÷ (안전계수 × 장력계수)'
export const RIGGING_SAFETY_RATIO_FORMULA = '안전율 = (중량물 총 하중 / 줄걸이 안전하중) × 100%'
export const CAPACITY_WARNING = '안전율 100% 초과 시 사용불가'

export const RIGGING_TOOL_OPTIONS = ['와이어로프', '섬유로프', '체인블럭', '기타'] as const
export const SLING_METHOD_OPTIONS = ['1줄걸이', '2줄걸이', '3줄걸이', '4줄걸이'] as const

export const SAFETY_FACTORS = {
  workerBoarding: { label: '근로자 탑승 작업', value: 10 },
  rigging: { label: '줄걸이 작업', value: 5 },
  fiberRopeRigging: { label: '줄걸이 작업(섬유로프)', value: 7 },
} as const

export const TENSION_FACTORS = [
  { angleDegree: 0, value: 1 },
  { angleDegree: 30, value: 1.04 },
  { angleDegree: 60, value: 1.16 },
  { angleDegree: 90, value: 1.41 },
  { angleDegree: 120, value: 2 },
] as const

export const LOADING_EQUIPMENT_FIELDS = [
  '장비명',
  '차량/장비번호',
  '모델명/생산년도',
  '보험기간',
  '소유회사명',
  '검사유효기간(건설기계검사·자동차검사·안전검사 등)',
  '차체 중량(ton)',
  '장비폭(m)',
  '최소선회반경(m)',
  '최대인양높이(m)',
  '작업반경(m)',
  '인양·운반하중 최대( )t/정격( )t',
] as const

export const LOADING_CHECKLIST = [
  '작업계획서 작성 및 내용을 근로자에게 주지하였는가?',
  '작업장소 및 시간, 이동경로, 작업방법 등을 해당 근로자는 알고 있는가?',
  '작업장소 주변에 접근통제 계획을 수립하고 있는가? (작업지휘자 또는 유도자 배치)',
  '작업경로에는 지반침하, 갓길 붕괴 등의 위험성이 없는가?',
  '운전자에게 작업장 내 운행속도(10km이하)에 대한 제한에 대해 주지하였는가?',
  '화물 적재 시 한쪽으로 치우치지 않도록 하고, 화물이 떨어지지 않도록 교육하였는가?',
  '화물의 적재·하역 등 주된 용도로만 사용토록 하는가?',
  '수리 또는 부속장치의 장착 및 해체작업을 하는 경우, 작업순서를 결정하고 작업지휘하고, 안전블록 등을 사용하는가?',
  '손상, 부식 등 섬유로프 등을 사용하지 않는가?',
  '화물을 과적재하지 않는가?',
  '적재된 화물이 운전자의 시야를 가리지 않는가?',
  '상ㆍ하차 작업 시 작업지휘자가 배치되어 있는가?',
] as const

export const CONSTRUCTION_SURVEY_ITEMS: Record<ConstructionSurveyType, readonly string[]> = {
  constructionMachine: [
    '건설기계 운행경로에 간섭되는 지형·구조물(급경사·급커브·요철 등) 여부',
    '작업구간의 지반이 건설기계가 작업하기에 충분한 지내력을 확보하였는가',
    '현장상태·작업조건 등을 종합하여 안전한 건설기계를 선정하였는가',
    '대상 건설기계의 법정 정기검사·면허 등',
    '기타 유해·위험요인 발굴, 안전대책 수립',
  ],
  excavation: [
    '형상·지질 및 지층의 상태',
    '균열·함수·용수 및 동결의 유무',
    '매설물 등의 유무 또는 상태',
    '지반의 지하수위 상태',
    '기타 유해·위험요인 발굴, 안전대책 수립',
  ],
  tunnel: [
    '형상·지질 및 지층의 상태',
    '매설물·지장물 등의 유무 또는 상태',
    '지반의 지하수위 상태',
    '기타 유해·위험요인 발굴, 안전대책 수립',
  ],
  demolition: [
    '해체 대상 구조물 조사',
    '관련된 부지상황',
    '기타 유해·위험요인 발굴, 안전대책 수립',
  ],
}

export const CONSTRUCTION_SURVEY_TYPE_OPTIONS = [
  { value: 'constructionMachine', label: '차량계 건설기계 사용 작업' },
  { value: 'excavation', label: '굴착작업' },
  { value: 'tunnel', label: '터널굴착작업' },
  { value: 'demolition', label: '건물 등의 해체작업' },
] as const

export const CONSTRUCTION_CHECKLIST = [
  '장비 상·하차는 견고하고 평탄한 장소에서 실시하는가?',
  '운전자에게 작업장 내 운행속도(10km이하)에 대한 제한에 대해 주지하였는가?',
  '장비 진입 시 유도자는 배치하였는가?',
  '장비 진입 시 도로의 노폭 및 침하 가능성은 확인하였는가?',
  '작업 장소에 지반붕괴, 토석낙하 등의 위험요인은 없는가?',
  '작업자에게 작업 및 이동 내용을 주지하였는가?',
  '주변 전신주, 전선 존재 여부 등을 확인하였는가?',
  '주변 건축물이나 지하매설물(가스관, 상수도관, 통신선 등)을 확인하였는가?',
  '장비 아웃트리거는 평탄하고, 견고한 지반에 위치하는가?',
  '작업장 주변에 출입금지띠, 출입금지표지판, 공사안내 표지판 등을 설치하였는가?',
  '작업시작 전 일일점검을 실시하였는가?',
  '개인 안전보호장구(안전화, 안전모, 귀마개 등)는 착용하였는가?',
  '소음 및 진동에 의한 작업장 주변의 영향(민가, 가축 등) 가능성은 확인하였는가?',
  '근로자 음주 상태 등을 확인하였는가?',
  '장비 승·하차 시 물기나 오일류에 의해 미끄러짐 방지를 위해 청결 및 정돈 상태는 유지하는가?',
  '화재발생 위험 장소 및 작업 구역 내 금연 및 화기 금지조치는 하였는가?',
  '기름이 묻은 손으로 장비레버 조작하지는 않는가?',
  '장비회전부에 끼임 위험이 있는 물건 소지하지 않았는가?',
] as const

export const ELECTRIC_PROTECTIVE_EQUIPMENT = [
  '절연안전모(ABE)',
  '안전화·안전모',
  '절연장화',
  '안전대',
  '보안경',
  '절연장갑',
  '방진마스크',
  '기타',
] as const

export const ELECTRIC_PROTECTIVE_EQUIPMENT_NOTE = '보호구 지급대장 관리 및 사용 전 점검하여 이상 시 교체'
export const ELECTRIC_EQUIPMENT_CATEGORIES = ['측정장비', '활선기구·장비', '방호구', '기타'] as const

export const ELECTRIC_PRE_WORK_INSTRUCTIONS = [
  '전격·아크 섬광·아크 폭발 등 전기 위험요인',
  '접근 한계거리 및 외부인 접근 통제대책',
  '감전사고 방지를 위한 안전장구 착용',
  '전로 차단 작업계획, 전원 재투입절차',
  '점검 시운전을 위한 일시운전, 작업중단 등에 대한 사항',
] as const

export const ELECTRIC_ATTACHMENT_OPTIONS = {
  facility: ['전기단선도/결선도', '기기 사양서', '공사계획표(정전작업 계획 등)', '기타'],
  safety: ['위험성평가표', '비상 시 대응조직체계', '작업계획서 평가 및 관리계획', '기타'],
} as const

export const ELECTRIC_CHECKLIST = [
  '작업자는 적정한 보호구를 착용하는가?(안전모, 안전화, 절연장갑)',
  '특별교육 이수 여부',
  '전원 차단·투입 관리를 하고 있는가?(한전측 COS개방, LOTO 게시 여부)',
  '작업장 내 자재, 부재 등의 낙하, 전도 등으로 인한 위험요인 차단하였는가?(작업공간 및 이동통로 확보)',
  '중장비 작업 시 안전조치를 하였는가?(신호수 배치 및 접근금지 표지 설치)',
  '전로 상태는 양호한가?(피복 손상 여부 등)',
  '기타 전기공사 시공 중 발생 가능 위험요인 사전 확인 및 조치하였는가?(감전, 추락 등 예방조치)',
  '고소작업 전에 추락방지를 위한 안전시설 설치하였는가?(추락방지망, 안전난간대 등)',
  '작업 중 외부인 출입금지 대책을 세웠는가?(점검장소 시건, 출입금지 표지판 설치 등)',
] as const

export const HEAVY_LOAD_SHAPE_EXAMPLES = ['박스형', '봉형', '묶음형'] as const
export const HEAVY_FIXING_METHODS = ['체인', '와이어로프', '샤클'] as const
export const HEAVY_GIRDER_TYPES = ['싱글', '더블'] as const
export const HEAVY_CONTROL_METHODS = ['펜던트스위치', '리모트컨트롤', '조종석', '기타'] as const
export const INSPECTION_RESULTS = ['합격', '불합격'] as const

export const HEAVY_MACHINE_FIELDS = [
  '기계명(장비)',
  '형식번호',
  '거더형식(싱글/더블)',
  '기계규격(스팬·양정 등)',
  '제조년월일',
  '보험가입여부',
  '정격하중',
  '조작방식(펜던트스위치/리모트컨트롤/조종석/기타)',
  '검사여부(합격/불합격)',
  '유효기간',
] as const

export const HEAVY_CHECKLIST = [
  '취급하는 중량물에 적합한 운반용구를 사용하고 있는가?',
  '경사면에서 중량물 취급 시 구름멈춤대, 쐐기 등으로 이동을 조절하고 있는가?',
  '중량물이 구르는 방향의 경사면 아래 출입금지 조치를 하였는가?',
  '추락 위험 구간에 안전난간이 설치되어 있는가?',
  '안전모, 안전화 등 보호구를 지급 및 착용하고 있는가?',
  '인양 하부 등 위험구역 출입금지를 하고 있는가?',
  '작업 전 달기구 점검을 실시하였는가? (벨트슬링, 체인슬링, 클램프, 샤클 등)',
  '인양물에 적합한 달기구를 사용하고 있는가?',
  '통행로 및 작업장 정리정돈이 되어 있는가? (미끄럼 방지 조치, 요철 제거 등)',
  '꼬임, 끊어짐, 심한 손상 및 부식된 섬유로프 등의 사용(운반 및 고정용)을 금지하고 있는가?',
  '적재 시 침하 우려가 없는 튼튼한 기반에 적재하였는가?',
  '불안정할 정도로 높이 쌓아 올리지 않았는가?',
  '편하중이 발생하지 않도록 적재하였는가?',
] as const

export const CHECKLISTS_BY_PLAN_TYPE: Record<PlanType, readonly string[]> = {
  loading: LOADING_CHECKLIST,
  construction: CONSTRUCTION_CHECKLIST,
  electric: ELECTRIC_CHECKLIST,
  heavy: HEAVY_CHECKLIST,
}
