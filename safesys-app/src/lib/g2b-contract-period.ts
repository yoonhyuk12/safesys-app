// 장기계속 연차 계약은 확정계약번호가 해마다 바뀌어 최신 차수 조회만으로는 최초 착공일을 알 수 없다 — 공고번호 조회분까지 합쳐 가장 이른 착공일을 고른다.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface ContractStart {
  startDate?: string | null
}

/**
 * 계약 목록에서 'YYYY-MM-DD' 형식인 착공일 중 가장 이른 값을 돌려준다.
 * 쓸 수 있는 착공일이 없으면 빈 문자열을 돌려준다.
 */
export function earliestStartDate(contracts: ContractStart[]): string {
  return contracts
    .map((contract) => contract.startDate || '')
    .filter((startDate) => ISO_DATE.test(startDate))
    // 'YYYY-MM-DD' 는 사전순 비교가 곧 날짜순 비교다
    .reduce((earliest, startDate) => (earliest === '' || startDate < earliest ? startDate : earliest), '')
}
