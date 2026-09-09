// CSI 시료봉인(품질검사 의뢰 전 단계) 목록·상세 정규화 타입 — API 라우트·가져오기 모달 공유

// 시료봉인 목록 1행 (로그인한 기관이 등록한 시료봉인)
export interface CsiSampleSealRow {
  smpslNo: string // 시료봉인번호 (상세 조회 키)
  purposeNm: string // 성과 이용 목적
  sealSeNm: string // 시료봉인 구분 (현장/일반)
  constNm: string // 공사명
  sealNm: string // 시료봉인명
  observerNm: string // 참관자
  sealerNm: string // 봉인자
  sealYmd: string // 봉인일 (YYYY-MM-DD)
  sealSttsNm: string // 시료상태 (예: 품질검사 의뢰신청)
}

// 상세 화면의 채취자·봉인자·참관자 1명
export interface CsiSampleSealPerson {
  role: string // 채취자 / 봉인자 / 참관자
  instNm: string // 소속
  name: string // 성명
  duty: string // 담당업무
}

// 시험종별에 딸린 시험·검사종목 카탈로그 1행 (실제 수행 종목이 아니라 종별 전체 목록)
export interface CsiSampleSealCatalogItem {
  code: string // 고유 번호
  itemNm: string // 시험·검사종목
  method: string // 시험·검사방법
}

// 상세 화면의 시료 1건
export interface CsiSampleSealSample {
  sampleNm: string // 시료명
  sampleSeNm: string // 시료구분
  creatNation: string // 생산국
  makerNm: string // 제조사
  stndrd: string // 규격
  pickPlace: string // 채취장소
  pickYmd: string // 채취일
  pickQty: string // 채취량
  sampleDesc: string // 시료설명
}

// 시료봉인 상세 1건
export interface CsiSampleSealDetail {
  smpslNo: string
  sealSttsNm: string // 시료봉인 상태
  purposeNm: string // 성과 이용 목적
  registInstNm: string // 등록기관
  sealSeNm: string // 시료봉인 구분
  constNm: string // 공사명
  beginYmd: string // 착공일
  endYmd: string // 준공예정일
  ownerNm: string // 발주자
  builderNm: string // 시공자
  sealNm: string // 시료봉인명
  sealYmd: string // 봉인일 (YYYY-MM-DD)
  people: CsiSampleSealPerson[]
  testClass: string // 시험분류 (예: 토목 > 도로공사 > 흙, 혼합골재)
  testKind: string // 시험종별 (예: 동상방지층, 보조기층)
  catalog: CsiSampleSealCatalogItem[]
  samples: CsiSampleSealSample[]
}

export interface CsiSampleSealListResponse {
  success: boolean
  error?: string
  data?: {
    totalCount: number // CSI가 집계한 전체 시료봉인 수
    fetchedRowCount: number // 이번 조회로 받아온 행 수
    rows: CsiSampleSealRow[]
    truncated: boolean // 페이지 상한 때문에 잘렸는지
  }
}

export interface CsiSampleSealDetailResponse {
  success: boolean
  error?: string
  data?: CsiSampleSealDetail
}
