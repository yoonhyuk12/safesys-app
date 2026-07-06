// 지적사항 판별 공용 규칙 — 지적사항 관리대장 페이지와 프로젝트 카드 건수가 같은 기준을 쓰도록 단일 출처

// 정기점검 결과의 실지적 판별 키워드 (projects.ts 집계 로직과 동일 기준)
export const NO_FINDING_KEYWORDS = ['양호', '적정', '이상없음', '이상 없음', '지적없음', '지적 없음', '해당없음', '해당 없음', '없음', '특이사항 없음', '특이사항없음']

// 정기점검 결과 항목: 지적사진이 있거나 findings가 양호류 키워드가 아니면 실지적
export const isRealFinding = (r: { photo_url?: string | null; findings?: string | null }): boolean => {
  if (r.photo_url && r.photo_url.trim() !== '') return true
  const f = (r.findings || '').trim()
  return !!f && !NO_FINDING_KEYWORDS.includes(f)
}

// 해빙기/우기/특별점검 추가 점검항목: action이 있고 '해당없음'이 아니면 지적
export const isAdditionalFinding = (item: { action?: string | null } | null | undefined): boolean =>
  !!item?.action && item.action !== '해당없음'

// 본부 안전점검 1건의 지적 수 (issue_content1/2 중 내용이 있는 것)
export const countHqIssues = (ins: { issue_content1?: string | null; issue_content2?: string | null }): number =>
  [ins.issue_content1, ins.issue_content2].filter((c) => (c || '').trim() !== '').length

// 조치사진 '해당없음' 표기 값 (정기점검 'N/A', 본부점검 '해당 사항 없음')
export const isNaValue = (v: string | null | undefined): boolean => v === 'N/A' || v === '해당 사항 없음'

// 조치사진 파일명의 Date.now() 타임스탬프에서 업로드(조치완료) 날짜 추출
export const extractUploadDate = (url: string | null): string | null => {
  if (!url || !url.startsWith('http')) return null
  const name = url.split('/').pop() || ''
  const m = name.match(/(\d{13})/)
  if (!m) return null
  const d = new Date(parseInt(m[1], 10))
  if (isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
