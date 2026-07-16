// CSI(건설공사 안전관리 종합정보망) 품질검사 성적서 서비스(QTM006) 정규화 타입 — API 라우트·가져오기 모달 공유

// 성적서 안의 시험검사 결과 1행
export interface CsiReportTestItem {
  tsNm: string // 시험검사 종별 (예: 노상)
  teNm: string // 시험검사 종목 (예: 함수비)
  itmTitle: string // 시험검사 결과 항목
  itmRslt: string // 시험검사 결과 값
  itmUnit: string // 시험검사 결과 단위
  testMthd: string // 시험검사 방법 (예: KS)
  tsiStartDt: string // 시험검사 시작일 (YYYY-MM-DD)
  tsiEndDt: string // 시험검사 종료일 (YYYY-MM-DD)
}

// 성적서번호(issueNo) 기준으로 묶은 성적서 1건
export interface CsiQualityReport {
  issueNo: string // 성적서번호
  issueYmd: string // 발급일자 (YYYY-MM-DD)
  rqstNo: string // 의뢰번호
  labNm: string // 시험실
  companyNm: string // 품질검사 대행기관명
  sampleNm: string // 시료명
  constNm: string // 공사명
  orntInstNm: string // 발주자
  conInstNms: string // 시공자
  reqUserNm: string // 의뢰인
  cmptnYmd: string // 시험완료일 (YYYY-MM-DD)
  items: CsiReportTestItem[]
}

export interface CsiQualityReportsResponse {
  success: boolean
  error?: string
  data?: {
    totalCount: number // CSI가 집계한 전체 행 수 (성적서 수 아님)
    fetchedRowCount: number // 이번 조회로 받아온 행 수 (최대 100)
    reports: CsiQualityReport[]
  }
}
