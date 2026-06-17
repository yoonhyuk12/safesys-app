// 시공 예정공정표 데이터 모델과 순수 계산 (가중치·旬별 공정율·누계·월간·S커브·연동 앵커)
// 입력: projects.construction_schedule(JSONB) + 착공/준공일. 외부 의존 없음(순수 함수) — 테스트 용이.

import type { ProgressAnchor } from '@/lib/work-daily-report/work-daily-report-types'

// 공종(작업종류) 1건
export interface WorkScheduleItem {
  id: string                       // 안정적 식별자
  name: string                     // 공사종류(공종명)
  amount: number                   // 공사금액(원) — 가중치 산정 기준
  startIndex: number               // 시작 旬 인덱스 (period grid 기준, inclusive)
  endIndex: number                 // 종료 旬 인덱스 (inclusive)
  dist?: Record<number, number>    // 旬 인덱스 → 이 공종의 해당 旬 진행비율(0~1). 없으면 기간 균등.
}

// 예정공정표 전체 (projects.construction_schedule 에 저장)
export interface WorkSchedule {
  items: WorkScheduleItem[]
  contractNo?: string              // 공사관리번호 (표 상단)
  updatedAt?: string
}

export const emptyWorkSchedule = (): WorkSchedule => ({ items: [] })

const isDateStr = (v: string | null | undefined): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

const pad2 = (n: number): string => String(n).padStart(2, '0')

// month: 1~12
const lastDayOfMonth = (year: number, month: number): number => new Date(year, month, 0).getDate()
const sunOfDay = (day: number): 1 | 2 | 3 => (day <= 10 ? 1 : day <= 20 ? 2 : 3)
const sunEndDay = (year: number, month: number, sun: 1 | 2 | 3): number =>
  sun === 1 ? 10 : sun === 2 ? 20 : lastDayOfMonth(year, month)

// 旬(10일) period 한 칸
export interface SchedulePeriod {
  index: number          // 0-based 전체 통합 인덱스
  year: number
  month: number          // 1~12
  sun: 1 | 2 | 3         // 상/중/하순
  dayLabel: number       // 컬럼 하단에 찍는 날짜 (10 / 20 / 말일)
  endDate: string        // YYYY-MM-DD — 앵커 매핑용 (마지막 旬은 준공일로 클램프)
  monthKey: string       // 'YYYY-MM' (월간 집계용)
}

// 착공~준공을 旬(상/중/하순) 컬럼으로 분해. 착공이 속한 旬부터 준공이 속한 旬까지.
export function buildPeriodGrid(
  start: string | null | undefined,
  end: string | null | undefined,
): SchedulePeriod[] {
  if (!isDateStr(start) || !isDateStr(end) || start >= end) return []
  const [, , sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const [sy, sm] = start.split('-').map(Number)
  const startSun = sunOfDay(sd)
  const endSun = sunOfDay(ed)

  const periods: SchedulePeriod[] = []
  let y = sy
  let m = sm
  let sun: 1 | 2 | 3 = startSun
  let index = 0

  // (y, m, sun) <= (ey, em, endSun) 동안 반복
  while (y < ey || (y === ey && (m < em || (m === em && sun <= endSun)))) {
    const isLast = y === ey && m === em && sun === endSun
    const endDay = sunEndDay(y, m, sun)
    const endDate = isLast ? end : `${y}-${pad2(m)}-${pad2(endDay)}`
    // 마지막 旬은 준공일을 라벨로 (사진처럼 실제 종료일 표기)
    periods.push({ index, year: y, month: m, sun, dayLabel: isLast ? ed : endDay, endDate, monthKey: `${y}-${pad2(m)}` })
    index++
    if (sun === 3) {
      sun = 1
      if (m === 12) { m = 1; y++ } else { m++ }
    } else {
      sun = (sun + 1) as 1 | 2 | 3
    }
    if (index > 2000) break // 안전장치
  }
  return periods
}

// 월간 집계 한 줄
export interface MonthlyAggregate {
  monthKey: string       // 'YYYY-MM'
  year: number
  month: number          // 1~12
  firstIndex: number     // 이 월 첫 旬의 전체 인덱스
  span: number           // 이 월에 포함된 旬 수 (1~3)
  rate: number           // 월간공정율(%)
  cum: number            // 월간공정율 누계(%)
}

export interface ScheduleComputation {
  totalAmount: number
  weights: Map<string, number>      // itemId → 가중치(%)
  contrib: Map<string, number[]>    // itemId → 旬별 기여%(전체 대비), 길이 = periods.length
  itemCumAtEnd: Map<string, number> // itemId → 종료 旬 시점 누계%(우측 공정률 컬럼)
  itemSelfSum: Map<string, number>  // itemId → Σf (검증용; 1이어야 정상)
  colRate: number[]                 // 旬별 공정율(주간공정율)
  cum: number[]                     // 旬별 누계(주간공정 누계)
  monthly: MonthlyAggregate[]
  finalCum: number                  // 마지막 누계(≈100 기대)
}

// 공정표 핵심 계산 — 가중치/旬별 기여·공정율·누계/월간/공종별 우측 공정률/S커브 데이터
export function computeSchedule(schedule: WorkSchedule, periods: SchedulePeriod[]): ScheduleComputation {
  const items = schedule?.items ?? []
  const n = periods.length

  const totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const weights = new Map<string, number>()
  for (const it of items) {
    weights.set(it.id, totalAmount > 0 ? ((Number(it.amount) || 0) / totalAmount) * 100 : 0)
  }

  const contrib = new Map<string, number[]>()
  const itemSelfSum = new Map<string, number>()
  const colRate = new Array<number>(n).fill(0)

  for (const it of items) {
    const w = weights.get(it.id) || 0
    const arr = new Array<number>(n).fill(0)
    const s = Math.max(0, Math.min(n - 1, it.startIndex))
    const e = Math.max(s, Math.min(n - 1, it.endIndex))
    const span = e - s + 1
    let selfSum = 0
    if (n > 0) {
      // 명시 입력 칸(dist)은 그대로 쓰고, 나머지 칸은 잔여분(1-Σdist)을 균등 분배 → 한 칸 조정해도 합계 100% 유지
      let distSum = 0
      let explicitCount = 0
      for (let p = s; p <= e; p++) {
        if (it.dist && it.dist[p] != null) { distSum += Number(it.dist[p]) || 0; explicitCount++ }
      }
      const remainCount = span - explicitCount
      const remainF = remainCount > 0 ? Math.max(0, (1 - distSum) / remainCount) : 0
      for (let p = s; p <= e; p++) {
        const f = it.dist && it.dist[p] != null ? Number(it.dist[p]) || 0 : remainF
        selfSum += f
        const c = w * f
        arr[p] = c
        colRate[p] += c
      }
    }
    contrib.set(it.id, arr)
    itemSelfSum.set(it.id, selfSum)
  }

  const cum = new Array<number>(n).fill(0)
  let run = 0
  for (let p = 0; p < n; p++) {
    run += colRate[p]
    cum[p] = run
  }

  const itemCumAtEnd = new Map<string, number>()
  for (const it of items) {
    const e = Math.max(0, Math.min(n - 1, it.endIndex))
    itemCumAtEnd.set(it.id, n > 0 ? cum[e] : 0)
  }

  // 월간 집계
  const monthly: MonthlyAggregate[] = []
  for (let p = 0; p < n; p++) {
    const period = periods[p]
    const last = monthly[monthly.length - 1]
    if (!last || last.monthKey !== period.monthKey) {
      monthly.push({
        monthKey: period.monthKey,
        year: period.year,
        month: period.month,
        firstIndex: p,
        span: 1,
        rate: colRate[p],
        cum: 0,
      })
    } else {
      last.span += 1
      last.rate += colRate[p]
    }
  }
  let mRun = 0
  for (const mo of monthly) {
    mRun += mo.rate
    mo.cum = mRun
  }

  return {
    totalAmount,
    weights,
    contrib,
    itemCumAtEnd,
    itemSelfSum,
    colRate,
    cum,
    monthly,
    finalCum: n > 0 ? cum[n - 1] : 0,
  }
}

// 공정표 곡선과 수동 공정률(일자 조정)을 조합 — 수동 점을 정확히 통과하고, 그 사이 구간은 공정표(S커브) 형태를 따른다.
// 반환 앵커를 computeProgressRate에 넣으면 결합 곡선이 그대로 재현된다(분기점이 旬 경계·수동 날짜인 조각 선형).
//  - 공정표 곡선이 없으면(금액 미입력): 수동 앵커 그대로
//  - 수동 앵커가 없으면: 공정표 원곡선 그대로
export function combineScheduleAnchors(
  schedule: WorkSchedule | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
  manualAnchors: ProgressAnchor[] = [],
): ProgressAnchor[] {
  if (!isDateStr(start) || !isDateStr(end) || start >= end) return []
  const startT = new Date(start).getTime()
  const endT = new Date(end).getTime()

  const manual = (manualAnchors || [])
    .filter(a => isDateStr(a.date) && a.date > start && a.date < end && isFinite(a.rate))
    .map(a => ({ t: new Date(a.date).getTime(), date: a.date, rate: Math.min(100, Math.max(0, a.rate)) }))
    .sort((x, y) => x.t - y.t)

  const grid = buildPeriodGrid(start, end)
  const comp = grid.length ? computeSchedule(schedule ?? { items: [] }, grid) : null
  const hasSchedule = !!comp && comp.finalCum > 0.0001

  if (!hasSchedule) return manual.map(m => ({ date: m.date, rate: m.rate }))
  if (!manual.length) return grid.map((p, i) => ({ date: p.endDate, rate: Math.min(100, Math.max(0, comp!.cum[i])) }))

  // 공정표 누계 S(t) — 조각 선형 (start,0),(旬끝_i,cum_i)
  const sPts = [{ t: startT, s: 0 }, ...grid.map((p, i) => ({ t: new Date(p.endDate).getTime(), s: comp!.cum[i] }))]
  const S = (t: number): number => {
    if (t <= sPts[0].t) return sPts[0].s
    for (let i = 0; i < sPts.length - 1; i++) {
      if (t <= sPts[i + 1].t) {
        const dt = sPts[i + 1].t - sPts[i].t
        return dt <= 0 ? sPts[i + 1].s : sPts[i].s + ((t - sPts[i].t) / dt) * (sPts[i + 1].s - sPts[i].s)
      }
    }
    return sPts[sPts.length - 1].s
  }

  // 고정점 F: (start,0) → 수동 점들 → (end,100). 구간마다 공정표 형태를 그 두 끝값으로 리매핑.
  const F = [{ t: startT, m: 0 }, ...manual.map(x => ({ t: x.t, m: x.rate })), { t: endT, m: 100 }]
  const R = (t: number): number => {
    for (let i = 0; i < F.length - 1; i++) {
      if (t >= F[i].t && t <= F[i + 1].t) {
        const sa = S(F[i].t)
        const sb = S(F[i + 1].t)
        const dS = sb - sa
        const frac = Math.abs(dS) > 1e-9
          ? (S(t) - sa) / dS
          : (F[i + 1].t === F[i].t ? 0 : (t - F[i].t) / (F[i + 1].t - F[i].t))
        return Math.min(100, Math.max(0, F[i].m + frac * (F[i + 1].m - F[i].m)))
      }
    }
    return 0
  }

  // 분기점(旬 경계 + 수동 날짜)에서 샘플 → 조각 선형 재현. 수동 날짜는 정확히 통과(우선).
  const byDate = new Map<string, number>()
  for (const p of grid) {
    if (p.endDate > start && p.endDate < end) byDate.set(p.endDate, R(new Date(p.endDate).getTime()))
  }
  for (const m of manual) byDate.set(m.date, m.rate)
  return Array.from(byDate.entries())
    .map(([date, rate]) => ({ date, rate: Math.min(100, Math.max(0, rate)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface ScheduleValidation {
  totalWeight: number                                   // Σ 가중치(%) — 100 기대
  finalCum: number                                      // 마지막 누계(%) — 100 기대
  itemsNot100: { id: string; name: string; selfSum: number }[] // Σf ≠ 1 인 공종(분포 합 비정상)
  ok: boolean
}

// 입력 정합성 검증 — 강제 보정 없이 경고용 (사용자 입력 존중)
export function validateSchedule(schedule: WorkSchedule, comp: ScheduleComputation): ScheduleValidation {
  let totalWeight = 0
  comp.weights.forEach(w => { totalWeight += w })
  const itemsNot100: ScheduleValidation['itemsNot100'] = []
  for (const it of schedule.items ?? []) {
    const selfSum = comp.itemSelfSum.get(it.id) ?? 0
    if (Math.abs(selfSum - 1) > 0.01) itemsNot100.push({ id: it.id, name: it.name, selfSum })
  }
  const ok = Math.abs(comp.finalCum - 100) < 0.5 && itemsNot100.length === 0
  return { totalWeight, finalCum: comp.finalCum, itemsNot100, ok }
}

// 새 공종 기본값 — 전체 기간을 균등 분포로 채움
export function createScheduleItem(periodCount: number): WorkScheduleItem {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: '',
    amount: 0,
    startIndex: 0,
    endIndex: Math.max(0, periodCount - 1),
  }
}
