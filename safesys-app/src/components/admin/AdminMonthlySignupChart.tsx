// 관리자 가입자 관리 화면의 월별 누적 가입 추이 그래프(분해 축 전환 지원)
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { sortRows, type SortDirection } from '@/lib/admin-sort'
import {
  buildCategories,
  getDimensionValue,
  resolveCategoryKey,
  type ChartDimension,
  type DimensionCategory,
} from '@/lib/admin-signup-dimension'

type SignupRole = '발주청' | '감리단' | '시공사'
type SignupSortKey = 'month' | 'count'

/** 요약 카드에서 고른 그래프 집계 모수. */
export type ChartFocus = 'all' | SignupRole | 'unconfirmed'

interface SignupUser {
  created_at: string
  role: SignupRole | null
  email_confirmed_at: string | null
  position: string | null
  hq_division: string | null
}

interface AdminMonthlySignupChartProps {
  users: SignupUser[]
  focus: ChartFocus
}

interface MonthlyBucket {
  month: string
  label: string
  total: number
  counts: Record<string, number>
}

interface SignupSortState {
  key: SignupSortKey
  direction: SortDirection
}

interface SignupEntry {
  monthIndex: number
  category: string
}

const SORT_OPTIONS: readonly { key: SignupSortKey; label: string }[] = [
  { key: 'month', label: '월 순' },
  { key: 'count', label: '가입자 수 순' },
]

const DIMENSION_KEYS: readonly ChartDimension[] = ['role', 'position', 'organization']

const DIMENSION_LABELS: Record<ChartDimension, string> = {
  role: '역할',
  position: '직책',
  organization: '본부',
}

/** 이 수보다 카테고리가 적으면 그 축으로는 막대를 나눌 수 없다. */
const MIN_DIMENSION_CATEGORIES = 2

/** 전체 포커스는 별도 수식어가 없으므로 null이다. */
const FOCUS_LABELS: Record<ChartFocus, string | null> = {
  all: null,
  발주청: '발주청',
  감리단: '감리단',
  시공사: '시공사',
  unconfirmed: '미인증',
}

const SIGNUP_CHART = {
  height: 260,
  padTop: 24,
  padRight: 16,
  padBottom: 36,
  padLeft: 44,
  minWidth: 560,
  /** 달마다 보장하는 최소 가로 폭. 넘치면 래퍼가 가로 스크롤한다. */
  minMonthWidth: 44,
  maxBarWidth: 48,
  /** 최상단 세그먼트의 상단 모서리 라운드 */
  barRadius: 4,
  /** 누적 세그먼트 사이 흰색 간격 */
  segmentGap: 2,
  /** 값이 있는 세그먼트가 사라지지 않도록 보장하는 최소 높이 */
  minSegmentHeight: 3,
  /** 가로 그리드선 구간 수(선 5개) */
  tickDivisions: 4,
} as const

/** 로컬(KST) 기준 연·월을 하나의 정수 축으로 환산한다. */
function toMonthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth()
}

function monthKey(monthIndex: number): string {
  return `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, '0')}`
}

function monthLabel(monthIndex: number): string {
  const year = Math.floor(monthIndex / 12) % 100
  return `${String(year).padStart(2, '0')}.${String((monthIndex % 12) + 1).padStart(2, '0')}`
}

/** 가입일을 로컬(KST) 기준 월 인덱스로, 축 값을 카테고리 키로 바꾼다. 파싱 실패한 행은 제외한다. */
function toSignupEntry(
  user: SignupUser,
  dimension: ChartDimension,
  categoryKeys: ReadonlySet<string>
): SignupEntry[] {
  const date = new Date(user.created_at)
  if (Number.isNaN(date.getTime())) return []

  const value = getDimensionValue(user, dimension)
  return [{ monthIndex: toMonthIndex(date), category: resolveCategoryKey(value, categoryKeys) }]
}

/** 요약 카드 포커스에 맞춰 집계 모수를 좁힌다. */
function matchesFocus(user: SignupUser, focus: ChartFocus): boolean {
  if (focus === 'all') return true
  if (focus === 'unconfirmed') return !user.email_confirmed_at
  return user.role === focus
}

function countByCategory(
  values: readonly string[],
  categories: readonly DimensionCategory[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const category of categories) {
    counts[category.key] = values.filter((value) => value === category.key).length
  }
  return counts
}

/** 가입 이력이 있는 첫 달부터 마지막 달까지 버킷을 월 오름차순으로 만든다. 중간의 0건인 달도 남긴다. */
function buildMonthlyBuckets(
  users: readonly SignupUser[],
  dimension: ChartDimension,
  categories: readonly DimensionCategory[]
): MonthlyBucket[] {
  const categoryKeys = new Set(categories.map((category) => category.key))
  const entries = users.flatMap((user) => toSignupEntry(user, dimension, categoryKeys))
  if (entries.length === 0) return []

  const monthIndexes = entries.map((entry) => entry.monthIndex)
  const firstMonth = monthIndexes.reduce((min, index) => Math.min(min, index))
  const lastMonth = monthIndexes.reduce((max, index) => Math.max(max, index))

  return Array.from({ length: lastMonth - firstMonth + 1 }, (_, offset) => {
    const index = firstMonth + offset
    const monthCategories = entries
      .filter((entry) => entry.monthIndex === index)
      .map((entry) => entry.category)

    return {
      month: monthKey(index),
      label: monthLabel(index),
      total: monthCategories.length,
      counts: countByCategory(monthCategories, categories),
    }
  })
}

/** y축 최대값을 눈금이 정수로 떨어지는 값으로 올림한다. */
function niceCeil(value: number, divisions: number): number {
  if (value <= 0) return divisions
  const rough = value / divisions
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const unit = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return Math.max(1, unit * magnitude) * divisions
}

/** 상단 모서리만 둥근 막대 경로. 바닥은 축에 붙인다. */
function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height))
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ')
}

function sumCategory(buckets: readonly MonthlyBucket[], key: string): number {
  return buckets.reduce((sum, bucket) => sum + bucket.counts[key], 0)
}

function buildTooltip(bucket: MonthlyBucket, categories: readonly { key: string }[]): string {
  const detail = categories
    .filter((category) => bucket.counts[category.key] > 0)
    .map((category) => `${category.key} ${bucket.counts[category.key]}명`)
    .join(' · ')
  if (!detail) return `${bucket.month} · 가입 없음`
  return `${bucket.month} · 전체 ${bucket.total}명\n${detail}`
}

function SignupSortControls({ sortState, onChange }: {
  sortState: SignupSortState
  onChange: (state: SignupSortState) => void
}) {
  const descending = sortState.direction === 'desc'
  const DirectionIcon = descending ? ArrowDown : ArrowUp

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5">
        {SORT_OPTIONS.map((option) => {
          const active = sortState.key === option.key
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...sortState, key: option.key })}
              className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        aria-pressed={descending}
        aria-label={`정렬 방향 ${descending ? '내림차순' : '오름차순'}, 누르면 ${descending ? '오름차순' : '내림차순'}으로 바꿉니다`}
        onClick={() => onChange({ ...sortState, direction: descending ? 'asc' : 'desc' })}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <DirectionIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {descending ? '내림차순' : '오름차순'}
      </button>
    </div>
  )
}

function DimensionControls({ dimension, disabledReasons, onChange }: {
  dimension: ChartDimension
  disabledReasons: Record<ChartDimension, string | null>
  onChange: (dimension: ChartDimension) => void
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-slate-500">분류</span>
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5">
        {DIMENSION_KEYS.map((key) => {
          const active = dimension === key
          const disabledReason = disabledReasons[key]
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              disabled={disabledReason !== null}
              title={disabledReason ?? undefined}
              onClick={() => onChange(key)}
              className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {DIMENSION_LABELS[key]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AdminMonthlySignupChart({ users, focus }: AdminMonthlySignupChartProps) {
  const titleId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [sortState, setSortState] = useState<SignupSortState>({ key: 'month', direction: 'asc' })
  const [dimension, setDimension] = useState<ChartDimension>('role')
  // 첫 페인트에 0폭이 되지 않도록 최소 폭으로 시작한다.
  const [measuredWidth, setMeasuredWidth] = useState<number>(SIGNUP_CHART.minWidth)

  const focusedUsers = useMemo(() => users.filter((user) => matchesFocus(user, focus)), [focus, users])
  // 축 버튼의 사용 가능 여부를 판단하려면 세 축의 카테고리를 모두 알아야 한다.
  const categoriesByDimension = useMemo(() => ({
    role: buildCategories(focusedUsers, 'role'),
    position: buildCategories(focusedUsers, 'position'),
    organization: buildCategories(focusedUsers, 'organization'),
  }), [focusedUsers])
  const categories = categoriesByDimension[dimension]
  const buckets = useMemo(
    () => buildMonthlyBuckets(focusedUsers, dimension, categories),
    [categories, dimension, focusedUsers]
  )
  const totalSignups = useMemo(() => buckets.reduce((sum, bucket) => sum + bucket.total, 0), [buckets])
  const hasSignups = totalSignups > 0
  const focusLabel = FOCUS_LABELS[focus]

  // 카테고리가 1종 이하인 축은 막대를 나누지 못하므로 버튼을 잠그고 이유를 알린다.
  const disabledReasons = useMemo(() => {
    const scope = focusLabel ? `${focusLabel} 기준으로 ` : ''
    const reasonOf = (key: ChartDimension): string | null => (
      categoriesByDimension[key].length >= MIN_DIMENSION_CATEGORIES
        ? null
        : `${scope}나눌 수 있는 ${DIMENSION_LABELS[key]} 정보가 없습니다`
    )
    return {
      role: reasonOf('role'),
      position: reasonOf('position'),
      organization: reasonOf('organization'),
    }
  }, [categoriesByDimension, focusLabel])

  // 포커스가 바뀌어 현재 축을 못 쓰게 되면 기본 축으로 되돌린다.
  useEffect(() => {
    if (dimension !== 'role' && disabledReasons[dimension] !== null) setDimension('role')
  }, [dimension, disabledReasons])

  // 컨테이너 실측 폭에 막대와 간격만 맞추고 글자 크기는 고정한다.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setMeasuredWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasSignups])

  const categoryTotals = useMemo(
    () => categories.map((category) => ({ ...category, total: sumCategory(buckets, category.key) })),
    [buckets, categories]
  )
  // 표시 기간 합계가 1건 이상인 카테고리만 막대·범례·대체 표에 나타낸다.
  const visibleSegments = useMemo(
    () => categoryTotals.filter((category) => category.total > 0),
    [categoryTotals]
  )
  const sortedBuckets = useMemo(
    () => sortRows(buckets, sortState, (bucket, key) => (key === 'month' ? bucket.month : bucket.total)),
    [buckets, sortState]
  )

  const chart = useMemo(() => {
    const count = sortedBuckets.length
    const width = Math.max(
      SIGNUP_CHART.minWidth,
      measuredWidth,
      count * SIGNUP_CHART.minMonthWidth + SIGNUP_CHART.padLeft + SIGNUP_CHART.padRight
    )
    const plotWidth = width - SIGNUP_CHART.padLeft - SIGNUP_CHART.padRight
    const plotHeight = SIGNUP_CHART.height - SIGNUP_CHART.padTop - SIGNUP_CHART.padBottom
    const plotBottom = SIGNUP_CHART.padTop + plotHeight
    const maxValue = niceCeil(Math.max(0, ...sortedBuckets.map((bucket) => bucket.total)), SIGNUP_CHART.tickDivisions)
    const step = count > 0 ? plotWidth / count : plotWidth
    const barWidth = Math.min(SIGNUP_CHART.maxBarWidth, step * 0.55)
    const yOf = (value: number): number => SIGNUP_CHART.padTop + plotHeight * (1 - value / maxValue)

    const ticks = Array.from({ length: SIGNUP_CHART.tickDivisions + 1 }, (_, index) => {
      const value = (maxValue / SIGNUP_CHART.tickDivisions) * index
      return { value, y: yOf(value) }
    })

    const bars = sortedBuckets.map((bucket, index) => {
      const centerX = SIGNUP_CHART.padLeft + step * (index + 0.5)
      const topSegmentKey = [...visibleSegments].reverse()
        .find((segment) => bucket.counts[segment.key] > 0)?.key ?? null

      const segments = visibleSegments.flatMap((segment, segmentIndex) => {
        const value = bucket.counts[segment.key]
        if (value <= 0) return []

        const below = visibleSegments
          .slice(0, segmentIndex)
          .reduce((sum, item) => sum + bucket.counts[item.key], 0)
        const top = yOf(below + value)
        const bottom = yOf(below)
        const isTop = segment.key === topSegmentKey
        const gap = isTop ? 0 : SIGNUP_CHART.segmentGap

        return [{
          key: segment.key,
          color: segment.color,
          x: centerX - barWidth / 2,
          y: top + gap,
          width: barWidth,
          height: Math.max(SIGNUP_CHART.minSegmentHeight, bottom - top - gap),
          isTop,
        }]
      })

      return {
        month: bucket.month,
        label: bucket.label,
        total: bucket.total,
        centerX,
        bandX: SIGNUP_CHART.padLeft + step * index,
        bandWidth: step,
        topY: yOf(bucket.total),
        tooltip: buildTooltip(bucket, visibleSegments),
        segments,
      }
    })

    return { width, height: SIGNUP_CHART.height, plotBottom, ticks, bars }
  }, [measuredWidth, sortedBuckets, visibleSegments])

  const dimensionLabel = DIMENSION_LABELS[dimension]
  const heading = [
    '월별 가입 추이',
    ...(focusLabel ? [focusLabel] : []),
    ...(dimension === 'role' ? [] : [`${dimensionLabel}별`]),
  ].join(' · ')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950">{heading}</h3>
        {hasSignups && <SignupSortControls sortState={sortState} onChange={setSortState} />}
      </div>

      {!hasSignups ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          {focusLabel ? `${focusLabel} 가입 기록이 없습니다.` : '가입 기록이 없습니다.'}
        </p>
      ) : (
        <>
          <div ref={containerRef} className="mt-3 overflow-x-auto">
            <svg
              role="img"
              aria-labelledby={titleId}
              width={chart.width}
              height={chart.height}
              viewBox={`0 0 ${chart.width} ${chart.height}`}
            >
              <title id={titleId}>
                {`월별 ${focusLabel ?? '전체'} 가입자 수를 ${dimensionLabel}별로 쌓아 보여주는 누적 막대 그래프`}
              </title>
              {chart.ticks.map((tick) => (
                <g key={`tick-${tick.value}`}>
                  <line
                    x1={SIGNUP_CHART.padLeft}
                    x2={chart.width - SIGNUP_CHART.padRight}
                    y1={tick.y}
                    y2={tick.y}
                    className="stroke-slate-100"
                    strokeWidth={1}
                  />
                  <text
                    x={SIGNUP_CHART.padLeft - 8}
                    y={tick.y + 3}
                    textAnchor="end"
                    fontSize={10}
                    className="fill-slate-400 tabular-nums"
                  >
                    {tick.value.toLocaleString()}
                  </text>
                </g>
              ))}
              <line
                x1={SIGNUP_CHART.padLeft}
                x2={chart.width - SIGNUP_CHART.padRight}
                y1={chart.plotBottom}
                y2={chart.plotBottom}
                className="stroke-slate-200"
                strokeWidth={1}
              />
              {chart.bars.map((bar) => (
                <g key={`bar-${bar.month}`}>
                  {bar.segments.map((segment) => (
                    segment.isTop ? (
                      <path
                        key={`${bar.month}-${segment.key}`}
                        d={roundedTopBarPath(segment.x, segment.y, segment.width, segment.height, SIGNUP_CHART.barRadius)}
                        fill={segment.color}
                      />
                    ) : (
                      <rect
                        key={`${bar.month}-${segment.key}`}
                        x={segment.x}
                        y={segment.y}
                        width={segment.width}
                        height={segment.height}
                        fill={segment.color}
                      />
                    )
                  ))}
                  {bar.total > 0 && (
                    <text
                      x={bar.centerX}
                      y={bar.topY - 6}
                      textAnchor="middle"
                      fontSize={11}
                      className="fill-slate-500 tabular-nums"
                    >
                      {bar.total.toLocaleString()}
                    </text>
                  )}
                  <text
                    x={bar.centerX}
                    y={chart.plotBottom + 18}
                    textAnchor="middle"
                    fontSize={10}
                    className="fill-slate-500 tabular-nums"
                  >
                    {bar.label}
                  </text>
                  <rect
                    x={bar.bandX}
                    y={SIGNUP_CHART.padTop}
                    width={bar.bandWidth}
                    height={chart.plotBottom - SIGNUP_CHART.padTop}
                    fill="transparent"
                    pointerEvents="all"
                  >
                    <title>{bar.tooltip}</title>
                  </rect>
                </g>
              ))}
            </svg>
          </div>

          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
            {visibleSegments.map((segment) => (
              <li key={segment.key} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: segment.color }}
                />
                <span>{segment.key}</span>
                <span className="font-semibold tabular-nums text-slate-950">{segment.total.toLocaleString()}명</span>
              </li>
            ))}
          </ul>

          <DimensionControls
            dimension={dimension}
            disabledReasons={disabledReasons}
            onChange={setDimension}
          />

          <table className="sr-only">
            <caption>{`월별 ${dimensionLabel}별 가입자 수`}</caption>
            <thead>
              <tr>
                <th scope="col">월</th>
                <th scope="col">전체</th>
                {visibleSegments.map((segment) => <th key={segment.key} scope="col">{segment.key}</th>)}
              </tr>
            </thead>
            <tbody>
              {sortedBuckets.map((bucket) => (
                <tr key={bucket.month}>
                  <th scope="row">{bucket.month}</th>
                  <td>{bucket.total}</td>
                  {visibleSegments.map((segment) => <td key={segment.key}>{bucket.counts[segment.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
