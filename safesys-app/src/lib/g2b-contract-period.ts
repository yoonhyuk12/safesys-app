// 장기계속 연차 계약은 확정계약번호가 해마다 바뀌어 최신 차수 조회만으로는 최초 착공일을 알 수 없다 — 공고번호 조회분까지 합쳐 가장 이른 착공일을 고른다.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface ContractStart {
  startDate?: string | null
  endDate?: string | null
}

export interface ContractPeriodRecord {
  id: string
  contract_type: string
  cntrct_nm: string
  tot_cntrct_amt?: number | null
  thtm_cntrct_amt?: number | null
  start_date?: string | null
  end_date?: string | null
}

// 장기계속계약의 연차는 계약번호가 달라 계약명(공백·차수 접미어 제거)과 구분으로 묶는다.
// 연도만 붙은 이름은 단년도 반복 계약과 구별하기 위해 차수분 계약에만 제거한다.
export const nameGroupKey = (type: string, name: string, stripYearAffix = false): string => {
  let n = name.replace(/(?:\(\s*\d+\s*차[^)]*\)|\d+\s*차년도)\s*$/, '')
  if (stripYearAffix) {
    n = n.replace(/^20\d{2}\s*년도?\s*/, '').replace(/\(\s*20\d{2}\s*년도?\s*\)\s*$/, '')
  }
  return `${type}|${n.replace(/\s+/g, '')}`
}

export const isThtmPartial = (tot?: number | null, thtm?: number | null): boolean =>
  tot != null && thtm != null && tot > 0 && thtm > 0 && tot !== thtm

// 대표 그룹의 전체 기간과 기존 확보 기간을 보존하면서 최신 총준공일의 연장은 반영한다.
export function resolveContractPeriod(
  contracts: ContractStart[],
  records: ContractPeriodRecord[],
  representativeId?: string | null,
  existingStartDate?: string | null,
  existingEndDate?: string | null,
): { startDate: string | null; endDate: string | null } {
  const representative = records.find((record) => record.id === representativeId)
  const keyOf = (record: ContractPeriodRecord) =>
    nameGroupKey(record.contract_type, record.cntrct_nm, isThtmPartial(record.tot_cntrct_amt, record.thtm_cntrct_amt))
  const members = representative ? records.filter((record) => keyOf(record) === keyOf(representative)) : []
  // 공고의 과거 변경계약 준공일은 사용하지 않는다. 최신 응답과 현재 저장된 그룹만 근거로 삼는다.
  const ends = [existingEndDate, contracts[0]?.endDate, ...members.map((record) => record.end_date)]
    .filter((date): date is string => !!date && ISO_DATE.test(date))
  return {
    startDate: earliestStartDate([...contracts, ...members.map((record) => ({ startDate: record.start_date }))], existingStartDate) || null,
    endDate: ends.reduce((latest, date) => date > latest ? date : latest, '') || null,
  }
}

/**
 * 계약 목록에서 'YYYY-MM-DD' 형식인 착공일 중 가장 이른 값을 돌려준다.
 * 쓸 수 있는 착공일이 없으면 빈 문자열을 돌려준다.
 */
export function earliestStartDate(contracts: ContractStart[], existingStartDate?: string | null): string {
  // 보조 조회가 실패하거나 연차 계약만 반환돼도 이미 확보한 전체 착공일을 늦추지 않는다.
  return [...contracts, { startDate: existingStartDate }]
    .map((contract) => contract.startDate || '')
    .filter((startDate) => ISO_DATE.test(startDate))
    // 'YYYY-MM-DD' 는 사전순 비교가 곧 날짜순 비교다
    .reduce((earliest, startDate) => (earliest === '' || startDate < earliest ? startDate : earliest), '')
}
