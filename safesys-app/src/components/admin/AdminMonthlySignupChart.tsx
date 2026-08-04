// 관리자 가입자 관리 화면의 최근 12개월 역할별 누적 가입 추이 그래프
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { sortRows, type SortDirection } from '@/lib/admin-sort'

type SignupRole = '발주청' | '감리단' | '시공사'
type SegmentKey = SignupRole | '미배정'
type SignupSortKey = 'month' | 'count'

interface SignupUser {
  created_at: string
  role: SignupRole | null
}

interface AdminMonthlySignupChartProps {
  users: SignupUser[]
}

interface MonthlyBucket {
  month: string
  label: string
  total: number
  counts: Record<SegmentKey, number>
}

interface SignupSortState {
  key: SignupSortKey
  direction: SortDirection
}

interface SignupEntry {
  month: string
  segment: SegmentKey
}

const MONTHS_WINDOW = 12

/** 누적 막대의 아래→위 순서. 색은 앱 전역 역할 색을 승계한다. */
const SEGMENTS: readonly { key: SegmentKey; color: string }[] = [
  { key: '발주청', color: '#2563eb' },
  { key: '감리단', color: '#f59e0b' },
  { key: '시공사', color: '#059669' },
  { key: '미배정', color: '#94a3b8' },
]

const SORT_OPTIONS: readonly { key: SignupSortKey; label: string }[] = [
  { key: 'month', label: '월 순' },
  { key: 'count', label: '가입자 수 순' },
]

const SIGNUP_CHART = {
  height: 260,
  padTop: 24,
  padRight: 16,
  padBottom: 36,
  padLeft: 44,
  minWidth: 560,
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

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function monthLabel(year: number, monthIndex: number): string {
  return `${String(year).slice(2)}.${String(monthIndex + 1).padStart(2, '0')}`
}

/** 가입일을 로컬(KST) 기준 월 버킷 키로 바꾼다. 파싱 실패한 행은 제외한다. */
function toSignupEntry(user: SignupUser): SignupEntry[] {
  const date = new Date(user.created_at)
  if (Number.isNaN(date.getTime())) return []
  return [{ month: monthKey(date.getFullYear(), date.getMonth()), segment: user.role ?? '미배정' }]
}

function countBySegment(segments: readonly SegmentKey[]): Record<SegmentKey, number> {
  return {
    발주청: segments.filter((segment) => segment === '발주청').length,
    감리단: segments.filter((segment) => segment === '감리단').length,
    시공사: segments.filter((segment) => segment === '시공사').length,
    미배정: segments.filter((segment) => segment === '미배정').length,
  }
}

/** 오늘이 속한 달을 포함한 최근 12개월 버킷을 월 오름차순으로 만든다. 0건인 달도 남긴다. */
function buildMonthlyBuckets(users: readonly SignupUser[]): MonthlyBucket[] {
  const now = new Date()
  const entries = users.flatMap(toSignupEntry)

  return Array.from({ length: MONTHS_WINDOW }, (_, index) => {
    const cursor = new Date(now.getFullYear(), now.getMonth() - (MONTHS_WINDOW - 1 - index), 1)
    const month = monthKey(cursor.getFullYear(), cursor.getMonth())
    const monthSegments = entries.filter((entry) => entry.month === month).map((entry) => entry.segment)

    return {
      month,
      label: monthLabel(cursor.getFullYear(), cursor.getMonth()),
      total: monthSegments.length,
      counts: countBySegment(monthSegments),
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

function sumSegment(buckets: readonly MonthlyBucket[], key: SegmentKey): number {
  return buckets.reduce((sum, bucket) => sum + bucket.counts[key], 0)
}

function buildTooltip(bucket: MonthlyBucket, segments: readonly { key: SegmentKey }[]): string {
  const detail = segments
    .filter((segment) => bucket.counts[segment.key] > 0)
    .map((segment) => `${segment.key} ${bucket.counts[segment.key]}명`)
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

export function AdminMonthlySignupChart({ users }: AdminMonthlySignupChartProps) {
  const titleId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [sortState, setSortState] = useState<SignupSortState>({ key: 'month', direction: 'asc' })
  // 첫 페인트에 0폭이 되지 않도록 최소 폭으로 시작한다.
  const [measuredWidth, setMeasuredWidth] = useState<number>(SIGNUP_CHART.minWidth)

  const buckets = useMemo(() => buildMonthlyBuckets(users), [users])
  const windowTotal = useMemo(() => buckets.reduce((sum, bucket) => sum + bucket.total, 0), [buckets])
  const hasSignups = windowTotal > 0

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

  const segmentTotals = useMemo(
    () => SEGMENTS.map((segment) => ({ ...segment, total: sumSegment(buckets, segment.key) })),
    [buckets]
  )
  // 미배정은 표시 기간 합계가 1건 이상일 때만 막대·범례에 나타낸다.
  const visibleSegments = useMemo(
    () => segmentTotals.filter((segment) => segment.key !== '미배정' || segment.total > 0),
    [segmentTotals]
  )
  const sortedBuckets = useMemo(
    () => sortRows(buckets, sortState, (bucket, key) => (key === 'month' ? bucket.month : bucket.total)),
    [buckets, sortState]
  )

  const chart = useMemo(() => {
    const count = sortedBuckets.length
    const width = Math.max(SIGNUP_CHART.minWidth, measuredWidth)
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950">최근 12개월 가입 추이</h3>
        {hasSignups && <SignupSortControls sortState={sortState} onChange={setSortState} />}
      </div>

      {!hasSignups ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          최근 12개월 가입 기록이 없습니다.
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
              <title id={titleId}>최근 12개월 월별 가입자 수를 역할별로 쌓아 보여주는 누적 막대 그래프</title>
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

          <table className="sr-only">
            <caption>최근 12개월 월별 역할별 가입자 수</caption>
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
