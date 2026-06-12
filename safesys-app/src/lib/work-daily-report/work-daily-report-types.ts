// 작업일보 (공사작업일지, 별지 제60호 서식) 타입 정의

// 2. 장비투입상황
export interface EquipmentRow {
  name: string             // 장비명
  spec: string             // 규격
  prevCount: string        // 전일까지투입
  todayCount: string       // 금일투입
  cumulativeCount: string  // 누계투입
}

// 3. 인력투입상황
export interface PersonnelRow {
  category: string         // 구분
  prevCount: string        // 전일까지투입인원
  todayCount: string       // 금일투입인원
  cumulativeCount: string  // 누계투입인원
  remarks: string          // 비고
}

export interface WorkDailyReport {
  id: string
  project_id: string
  report_date: string
  weather: string
  temp_high: string
  temp_low: string
  rainfall: string      // 강우량(mm)
  author_name: string   // 작성자(담당자)
  checker_name: string  // 확인자(현장대리인)
  progress_rate: string // 공정률(%) — 착공일~준공일 날짜 기반 자동 계산 스냅샷
  progress_rate_manual?: boolean // 사용자가 직접 입력한 공정률 여부 (보간 기준점으로 사용)
  today_work: string    // 1. 공사추진상황 - 금일작업
  tomorrow_work: string // 1. 공사추진상황 - 명일작업
  equipment_rows: EquipmentRow[]
  personnel_rows: PersonnelRow[]
  participants: string  // 4. 기타 특이사항
  created_by?: string
  created_at?: string
  updated_at?: string
}

export const emptyEquipmentRow = (): EquipmentRow => ({
  name: '', spec: '', prevCount: '', todayCount: '', cumulativeCount: '',
})

export const emptyPersonnelRow = (category = ''): PersonnelRow => ({
  category, prevCount: '', todayCount: '', cumulativeCount: '', remarks: '',
})

// 구분이 안 되는 장비/인력 항목 명칭 — 항상 마지막 행에 고정
export const UNCLASSIFIED_LABEL = '기타(미분류)'

// 기본 행: 기타(미분류)만 고정 — 나머지 분류는 직전 일보 이월 또는 AI 분류로 추가됨
export const defaultPersonnelRows = (): PersonnelRow[] => [emptyPersonnelRow(UNCLASSIFIED_LABEL)]

export const defaultEquipmentRows = (): EquipmentRow[] => [
  { ...emptyEquipmentRow(), name: UNCLASSIFIED_LABEL },
]

// 기타(미분류) 행이 항상 존재하고 마지막에 오도록 보장
export const ensureUnclassifiedEquipment = (rows: EquipmentRow[]): EquipmentRow[] => {
  const others = rows.filter(r => r.name.trim() !== UNCLASSIFIED_LABEL)
  const unclassified = rows.find(r => r.name.trim() === UNCLASSIFIED_LABEL)
  return [...others, unclassified ?? { ...emptyEquipmentRow(), name: UNCLASSIFIED_LABEL }]
}

export const ensureUnclassifiedPersonnel = (rows: PersonnelRow[]): PersonnelRow[] => {
  const others = rows.filter(r => r.category.trim() !== UNCLASSIFIED_LABEL)
  const unclassified = rows.find(r => r.category.trim() === UNCLASSIFIED_LABEL)
  return [...others, unclassified ?? emptyPersonnelRow(UNCLASSIFIED_LABEL)]
}

const cumValue = (v: string): number => {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// 누계 많은 순 정렬 (기타(미분류)는 항상 마지막)
export const sortEquipmentByCumulative = (rows: EquipmentRow[]): EquipmentRow[] =>
  ensureUnclassifiedEquipment(
    [...rows].sort((a, b) => cumValue(b.cumulativeCount) - cumValue(a.cumulativeCount))
  )

export const sortPersonnelByCumulative = (rows: PersonnelRow[]): PersonnelRow[] =>
  ensureUnclassifiedPersonnel(
    [...rows].sort((a, b) => cumValue(b.cumulativeCount) - cumValue(a.cumulativeCount))
  )

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// YYYY-MM-DD → 요일 (한글)
export const getWeekdayKorean = (dateStr: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}

// 공정률 수동 입력 기준점 (보간용)
export interface ProgressAnchor {
  date: string // YYYY-MM-DD
  rate: number // 0~100
}

// 날짜 기반 공정률 자동 계산: 착공일 0% → 준공일 100%, 범위 밖은 0/100으로 클램프
// 수동 입력 기준점(anchors)이 있으면 착공 → 기준점들 → 준공을 지나는 구간별 선형 보간
export const computeProgressRate = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  targetDate: string,
  anchors: ProgressAnchor[] = []
): string => {
  const isDate = (v: string | null | undefined): v is string =>
    !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (!isDate(startDate) || !isDate(endDate) || !isDate(targetDate)) return ''

  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  const target = new Date(targetDate).getTime()
  if (isNaN(start) || isNaN(end) || isNaN(target) || end <= start) return ''
  if (target <= start) return '0.0'
  if (target >= end) return '100.0'

  // 기준점: 착공(0%) + 수동 입력 기준점(공사기간 내) + 준공(100%)
  const points = [
    { t: start, r: 0 },
    ...anchors
      .filter(a => isDate(a.date) && isFinite(a.rate))
      .map(a => ({ t: new Date(a.date).getTime(), r: Math.min(100, Math.max(0, a.rate)) }))
      .filter(p => p.t > start && p.t < end)
      .sort((a, b) => a.t - b.t),
    { t: end, r: 100 },
  ]

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    if (target < p1.t || target > p2.t) continue
    if (p2.t === p1.t) return p2.r.toFixed(1)
    const rate = p1.r + ((target - p1.t) / (p2.t - p1.t)) * (p2.r - p1.r)
    const clamped = Math.min(100, Math.max(0, rate))
    return (Math.round(clamped * 10) / 10).toFixed(1)
  }
  return ''
}

// 전일까지 + 금일 → 누계 자동 계산 (숫자가 아닌 입력은 빈 문자열 유지)
export const computeCumulative = (prev: string, today: string): string => {
  const prevNum = parseFloat(prev)
  const todayNum = parseFloat(today)
  const hasPrev = prev.trim() !== '' && !isNaN(prevNum)
  const hasToday = today.trim() !== '' && !isNaN(todayNum)
  if (!hasPrev && !hasToday) return ''
  const sum = (hasPrev ? prevNum : 0) + (hasToday ? todayNum : 0)
  // 부동소수점 오차 제거
  return String(Math.round(sum * 1000) / 1000)
}
