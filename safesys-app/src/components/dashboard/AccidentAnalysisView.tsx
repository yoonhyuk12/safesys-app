'use client'
// 사고 이력과 3종 안전점검의 통계적 연관성을 조회하고 본부급 사용자에게 사고 관리를 제공하는 화면.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Edit,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import AccidentEntryModal from '@/components/dashboard/AccidentEntryModal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { isOrganizationInUserScope } from '@/lib/organization-scope'
import type { Project } from '@/lib/projects'
import type { UserProfile } from '@/lib/supabase'
import {
  ACCIDENT_COMP_CLAIM_OPTIONS,
  ACCIDENT_SEVERITY_OPTIONS,
  ACCIDENT_TYPE_OPTIONS,
  calculateAccidentAnalysis,
  createProjectAccident,
  deleteProjectAccident,
  getAccidentAnalysisData,
  updateProjectAccident,
  type AccidentFormInput,
  type NormalizedSafetyInspection,
  type ProjectAccident,
} from '@/lib/accident-analysis'
import { getRegularWorkersByOrg } from '@/lib/tbm'

/** 월별 추이 콤보 차트(사고 막대 + 점검 선형)의 점검 시리즈 정의 */
const MONTHLY_INSPECTION_SERIES = [
  { key: 'managerInspectionCount' as const, label: '지사', color: '#6366f1', strokeWidth: 2 },
  { key: 'headquartersInspectionCount' as const, label: '본부', color: '#f59e0b', strokeWidth: 2 },
  { key: 'safetyInspectionCount' as const, label: '정기', color: '#14b8a6', strokeWidth: 2 },
  { key: 'inspectionCount' as const, label: '합계', color: '#0f766e', strokeWidth: 2.5 },
]

type MonthlyInspectionSeriesKey = (typeof MONTHLY_INSPECTION_SERIES)[number]['key']
type MonthlyChartSeriesKey = 'accidentCount' | MonthlyInspectionSeriesKey

const INITIAL_MONTHLY_SERIES_VISIBILITY: Record<MonthlyChartSeriesKey, boolean> = {
  accidentCount: true,
  managerInspectionCount: true,
  headquartersInspectionCount: true,
  safetyInspectionCount: true,
  inspectionCount: true,
}

const MONTHLY_CHART = {
  height: 280,
  padTop: 18,
  padRight: 48,
  padBottom: 40,
  padLeft: 48,
  minWidth: 640,
  /** 라벨 최소 가로 간격(2글자 한글 라벨 기준) */
  labelMinDx: 40,
  /** 라벨 최소 세로 간격(회전 텍스트 여유) */
  labelMinDy: 20,
  /** 선에 수직 방향으로 띄우는 거리 */
  labelOffset: 14,
} as const

/**
 * 선분 중점에 라벨을 두고, 선 기울기와 평행한 각도·선 위쪽(화면 상단) 오프셋을 계산한다.
 * 꼭지점이 아니라 두 점 사이 구간에 붙인다.
 */
const buildLineLabel = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  offset: number,
): { labelX: number; labelY: number; labelAngle: number } => {
  const midX = (p0.x + p1.x) / 2
  const midY = (p0.y + p1.y) / 2
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1

  // 읽기 쉬운 각도(±90° 안)로 맞추고, 선과 평행하게 둔다.
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (angleDeg > 90) angleDeg -= 180
  if (angleDeg < -90) angleDeg += 180

  // 선에 수직인 단위 벡터 — SVG y가 아래로 커지므로 "화면 위쪽"을 고른다.
  let nx = -dy / len
  let ny = dx / len
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }

  return {
    labelX: midX + nx * offset,
    labelY: midY + ny * offset,
    labelAngle: angleDeg,
  }
}

const niceCeil = (value: number): number => {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

const buildLinePath = (
  points: Array<{ x: number; y: number }>,
): string =>
  points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')

interface AccidentAnalysisViewProps {
  projects: Project[]
  userProfile: UserProfile | null
  canManageAccidents: boolean
  initialBranch: string | null
  onBack: () => void
}

const selectClassName = 'w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
const filterLabelClassName = 'mb-1 block text-xs font-medium text-gray-600'

const severityOptions = ACCIDENT_SEVERITY_OPTIONS
const compClaimOptions = ACCIDENT_COMP_CLAIM_OPTIONS
const accidentTypeOptions = ACCIDENT_TYPE_OPTIONS
const SHOW_PROJECT_SUMMARY = false

const formatInputDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 분석 필터 기간 프리셋. custom은 사용자가 날짜를 직접 고른 경우 */
type DatePreset = 'year_to_date' | 'h1' | 'h2' | 'rolling_1y' | 'custom'

const DATE_PRESET_OPTIONS: ReadonlyArray<{ value: Exclude<DatePreset, 'custom'>; label: string }> = [
  { value: 'year_to_date', label: '당해년도' },
  { value: 'h1', label: '상반기' },
  { value: 'h2', label: '하반기' },
  { value: 'rolling_1y', label: '1년' },
]

const minDateString = (left: string, right: string): string => (left <= right ? left : right)
const maxDateString = (left: string, right: string): string => (left >= right ? left : right)

/** 종료일이 오늘보다 미래면 오늘로 맞춘다. */
const clampToToday = (date: Date): Date => {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return date.getTime() > today.getTime() ? new Date() : date
}

const dateRangeForPreset = (preset: Exclude<DatePreset, 'custom'>): { startDate: string; endDate: string } => {
  const now = new Date()
  const year = now.getFullYear()
  if (preset === 'year_to_date') {
    return {
      startDate: formatInputDate(new Date(year, 0, 1)),
      endDate: formatInputDate(now),
    }
  }
  if (preset === 'h1') {
    return {
      startDate: formatInputDate(new Date(year, 0, 1)),
      endDate: formatInputDate(clampToToday(new Date(year, 5, 30))),
    }
  }
  if (preset === 'h2') {
    const start = new Date(year, 6, 1)
    const end = clampToToday(new Date(year, 11, 31))
    // 하반기 시작 전이면 올해 7/1~12/31 구간을 그대로 두어 빈 결과로 안내한다.
    return {
      startDate: formatInputDate(start),
      endDate: formatInputDate(end.getTime() < start.getTime() ? new Date(year, 11, 31) : end),
    }
  }
  // 최근 12개월 (월 단위, 시작월 1일 ~ 오늘)
  return {
    startDate: formatInputDate(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
    endDate: formatInputDate(now),
  }
}

const defaultDateRange = (): { startDate: string; endDate: string } => dateRangeForPreset('year_to_date')

/** 월별 파레토 도표 전용 기간. 분석 필터와 무관하게 항상 최근 1년 */
const chartDateRange = (): { startDate: string; endDate: string } => dateRangeForPreset('rolling_1y')

const formatDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('ko-KR') : '-'

const formatRate = (value: number): string => `${value.toFixed(1)}%`

const severityBadgeClass = (severity: string): string => {
  if (severity === 'fatal') return 'bg-gray-900 text-white'
  if (severity === 'serious') return 'bg-red-100 text-red-800'
  if (severity === 'lost_time') return 'bg-orange-100 text-orange-800'
  return 'bg-yellow-100 text-yellow-800'
}

const severityLabel = (severity: string): string =>
  severityOptions.find((option) => option.value === severity)?.label ?? severity

const compClaimLabel = (claim: string | null): string =>
  compClaimOptions.find((option) => option.value === (claim ?? ''))?.label ?? '미확인'

const compClaimBadgeClass = (claim: string | null): string => {
  if (claim === 'applied') return 'bg-blue-100 text-blue-800'
  if (claim === 'not_applied') return 'bg-gray-100 text-gray-700'
  return 'bg-gray-50 text-gray-400'
}

export default function AccidentAnalysisView({
  projects,
  userProfile,
  canManageAccidents,
  initialBranch,
  onBack,
}: AccidentAnalysisViewProps) {
  const initialRange = useMemo(defaultDateRange, [])
  const initialChartRange = useMemo(chartDateRange, [])

  // 사용자 소속 기준 읽기 권한 범위의 프로젝트만 사용한다. 전체 등록 목록을 그대로 쓰지 않는다.
  const accessibleProjects = useMemo(
    () => projects.filter((project) =>
      isOrganizationInUserScope(userProfile, {
        managing_hq: project.managing_hq,
        managing_branch: project.managing_branch,
      })
    ),
    [projects, userProfile],
  )

  // 필터 기본값: 지사 딥링크 > 사용자 소속(본사·본부급은 전체)
  const defaultHq = useMemo(() => {
    if (initialBranch) {
      return (
        accessibleProjects.find((project) => project.managing_branch === initialBranch)?.managing_hq
        ?? userProfile?.hq_division
        ?? ''
      )
    }
    const hq = userProfile?.hq_division ?? ''
    if (!hq || hq === '본사') return ''
    return hq
  }, [accessibleProjects, initialBranch, userProfile?.hq_division])
  const defaultBranch = useMemo(() => {
    if (initialBranch) return initialBranch
    const branch = userProfile?.branch_division ?? ''
    if (!branch || branch === '본사' || branch.endsWith('본부')) return ''
    return branch
  }, [initialBranch, userProfile?.branch_division])
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [datePreset, setDatePreset] = useState<DatePreset>('year_to_date')
  const [selectedHq, setSelectedHq] = useState(defaultHq)
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedAccidentType, setSelectedAccidentType] = useState('')
  const [selectedSeverity, setSelectedSeverity] = useState('')
  const [accidents, setAccidents] = useState<ProjectAccident[]>([])
  const [inspections, setInspections] = useState<NormalizedSafetyInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccident, setEditingAccident] = useState<ProjectAccident | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [visibleMonthlySeries, setVisibleMonthlySeries] =
    useState<Record<MonthlyChartSeriesKey, boolean>>(INITIAL_MONTHLY_SERIES_VISIBILITY)
  // 재해율 분모: 분석 필터 기간 기준 프로젝트별 상시근로자 (TBM 누적÷제출일수)
  const [regularByProject, setRegularByProject] = useState<Map<string, number>>(new Map())
  // 프로젝트 미등록 현장의 상시근로자 (key: `${본부}||${지사}`) — 분모에 본부·지사 필터로 합산
  const [regularUnregistered, setRegularUnregistered] = useState<Map<string, number>>(new Map())
  const [regularLoading, setRegularLoading] = useState(false)
  const requestSequence = useRef(0)
  const regularRequestSequence = useRef(0)

  const toggleMonthlySeries = (key: MonthlyChartSeriesKey) => {
    setVisibleMonthlySeries((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  // 프로필·프로젝트 목록이 늦게 채워지거나 지사 딥링크가 바뀌면 기본 소속을 다시 맞춘다.
  useEffect(() => {
    setSelectedHq(defaultHq)
    setSelectedBranch(defaultBranch)
    setSelectedProjectId('')
  }, [defaultBranch, defaultHq])

  const hqOptions = useMemo(
    () => Array.from(new Set(accessibleProjects.map((project) => project.managing_hq).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [accessibleProjects],
  )

  // 지사 드롭다운은 BRANCH_OPTIONS 목차 순서를 따른다 (가나다 정렬 X)
  const branchOptions = useMemo(() => {
    const branches = Array.from(new Set(
      accessibleProjects
        .filter((project) => !selectedHq || project.managing_hq === selectedHq)
        .map((project) => project.managing_branch)
        .filter(Boolean),
    ))
    const branchOrder = selectedHq
      ? (BRANCH_OPTIONS[selectedHq] || [])
      : Array.from(new Set(Object.values(BRANCH_OPTIONS).flat()))

    return branches.sort((a, b) => {
      if (branchOrder.length === 0) return a.localeCompare(b, 'ko')
      const ai = branchOrder.indexOf(a)
      const bi = branchOrder.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b, 'ko')
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [accessibleProjects, selectedHq])

  const organizationProjects = useMemo(
    () => accessibleProjects.filter((project) =>
      (!selectedHq || project.managing_hq === selectedHq) &&
      (!selectedBranch || project.managing_branch === selectedBranch)
    ),
    [accessibleProjects, selectedBranch, selectedHq],
  )

  const filteredProjects = useMemo(
    () => organizationProjects.filter((project) => !selectedProjectId || project.id === selectedProjectId),
    [organizationProjects, selectedProjectId],
  )

  // 사고·점검 조회는 소속 범위 + 현재 본부·지사·프로젝트 필터에 해당하는 ID만 사용한다.
  const queryProjectIds = useMemo(
    () => filteredProjects.map((project) => project.id),
    [filteredProjects],
  )

  const loadData = useCallback(async () => {
    const requestId = ++requestSequence.current
    if (!startDate || !endDate || startDate > endDate) {
      setLoading(false)
      setError('조회 시작일은 종료일보다 늦을 수 없습니다.')
      return
    }

    // 분석 필터 기간 + 파레토(최근 1년) 기간을 모두 커버하도록 조회한다.
    // 프로젝트가 없어도 미등록 현장 사고(RLS 관할)는 조회한다.
    const chartRange = chartDateRange()
    const dataStart = minDateString(startDate, chartRange.startDate)
    const dataEnd = maxDateString(endDate, chartRange.endDate)

    setLoading(true)
    setError('')
    const result = await getAccidentAnalysisData(queryProjectIds, dataStart, dataEnd)
    if (requestSequence.current !== requestId) return

    if (!result.success) {
      setAccidents([])
      setInspections([])
      setError(result.error || '사고 통계 분석 데이터를 불러오지 못했습니다.')
    } else {
      setAccidents(result.accidents ?? [])
      setInspections(result.inspections ?? [])
    }
    setLoading(false)
  }, [endDate, queryProjectIds, startDate])

  useEffect(() => {
    void loadData()
    return () => {
      requestSequence.current += 1
    }
  }, [loadData])

  // 상시근로자: 분석 필터 기간(시작일~종료일) 기준으로 로드. 필터는 합산 시 반영한다.
  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) return
    const requestId = ++regularRequestSequence.current
    setRegularLoading(true)
    void getRegularWorkersByOrg(endDate, startDate)
      .then((totals) => {
        if (regularRequestSequence.current !== requestId) return
        setRegularByProject(totals.byProject)
        setRegularUnregistered(totals.unregisteredByBranch)
      })
      .catch((caught) => {
        console.error('상시근로자 집계 실패', caught)
        if (regularRequestSequence.current !== requestId) return
        setRegularByProject(new Map())
        setRegularUnregistered(new Map())
      })
      .finally(() => {
        if (regularRequestSequence.current !== requestId) return
        setRegularLoading(false)
      })
    return () => {
      regularRequestSequence.current += 1
    }
  }, [endDate, startDate])

  const filteredProjectIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects])

  const filteredAccidents = useMemo(
    () => accidents.filter((accident) => {
      if (selectedAccidentType && accident.accident_type !== selectedAccidentType) return false
      if (selectedSeverity && accident.severity !== selectedSeverity) return false
      if (accident.project_id) {
        return filteredProjectIds.has(accident.project_id)
      }
      // 미등록 현장: 특정 프로젝트 필터가 켜져 있으면 제외하고, 본부·지사 필터로 매칭한다.
      if (selectedProjectId) return false
      if (selectedHq && accident.external_managing_hq !== selectedHq) return false
      if (selectedBranch && accident.external_managing_branch !== selectedBranch) return false
      return true
    }),
    [
      accidents,
      filteredProjectIds,
      selectedAccidentType,
      selectedBranch,
      selectedHq,
      selectedProjectId,
      selectedSeverity,
    ],
  )

  const filteredInspections = useMemo(
    () => inspections.filter((inspection) => filteredProjectIds.has(inspection.project_id)),
    [filteredProjectIds, inspections],
  )

  const analysis = useMemo(
    () => calculateAccidentAnalysis(filteredProjects, filteredAccidents, filteredInspections, startDate, endDate),
    [endDate, filteredAccidents, filteredInspections, filteredProjects, startDate],
  )

  /** 분석 필터 기간 기준 사고 유형별 순위 (건수 내림차순) */
  const accidentTypeRanking = useMemo(() => {
    const countByType = new Map<string, number>()
    for (const detail of analysis.accidentDetails) {
      const type = detail.accident.accident_type?.trim() || '기타'
      countByType.set(type, (countByType.get(type) || 0) + 1)
    }
    const total = analysis.accidentDetails.length
    return Array.from(countByType.entries())
      .map(([type, count]) => ({
        type,
        count,
        share: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type, 'ko'))
  }, [analysis.accidentDetails])

  // 월별 파레토 도표는 분석 필터 기간과 무관하게 항상 최근 1년으로 산출한다.
  const chartAnalysis = useMemo(
    () => calculateAccidentAnalysis(
      filteredProjects,
      filteredAccidents,
      filteredInspections,
      initialChartRange.startDate,
      initialChartRange.endDate,
    ),
    [filteredAccidents, filteredInspections, filteredProjects, initialChartRange.endDate, initialChartRange.startDate],
  )

  const projectMap = useMemo(
    () => new Map(accessibleProjects.map((project) => [project.id, project])),
    [accessibleProjects],
  )

  const managementProjects = useMemo(
    () => organizationProjects.filter((project) => !selectedProjectId || project.id === selectedProjectId),
    [organizationProjects, selectedProjectId],
  )

  const applyDatePreset = (preset: Exclude<DatePreset, 'custom'>) => {
    const range = dateRangeForPreset(preset)
    setDatePreset(preset)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  const monthlyChart = useMemo(() => {
    const trend = chartAnalysis.monthlyTrend
    const count = trend.length
    if (count === 0) return null

    const width = Math.max(MONTHLY_CHART.minWidth, count * 64 + MONTHLY_CHART.padLeft + MONTHLY_CHART.padRight)
    const plotWidth = width - MONTHLY_CHART.padLeft - MONTHLY_CHART.padRight
    const plotHeight = MONTHLY_CHART.height - MONTHLY_CHART.padTop - MONTHLY_CHART.padBottom
    const maxInspection = niceCeil(Math.max(
      1,
      ...trend.map((item) => item.inspectionCount),
      ...trend.map((item) => item.safetyInspectionCount),
      ...trend.map((item) => item.managerInspectionCount),
      ...trend.map((item) => item.headquartersInspectionCount),
    ))
    const maxAccident = niceCeil(Math.max(1, ...trend.map((item) => item.accidentCount)))
    const step = count > 1 ? plotWidth / (count - 1) : plotWidth
    const barWidth = Math.min(28, Math.max(10, (count > 1 ? step : plotWidth) * 0.45))

    const xAt = (index: number): number =>
      MONTHLY_CHART.padLeft + (count > 1 ? index * step : plotWidth / 2)
    const yInspection = (value: number): number =>
      MONTHLY_CHART.padTop + plotHeight * (1 - value / maxInspection)
    const yAccident = (value: number): number =>
      MONTHLY_CHART.padTop + plotHeight * (1 - value / maxAccident)

    const inspectionTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: Math.round(maxInspection * ratio),
      y: MONTHLY_CHART.padTop + plotHeight * (1 - ratio),
    }))
    const accidentTicks = [0, 0.5, 1].map((ratio) => ({
      value: Math.round(maxAccident * ratio),
      y: MONTHLY_CHART.padTop + plotHeight * (1 - ratio),
    }))

    // 시리즈마다 서로 다른 선분(꼭지점 사이)에 라벨을 붙이고, 그 구간의 기울기에 평행하게 회전한다.
    const lastSegIndex = Math.max(0, count - 2)
    const baseSegIndex = Math.floor(lastSegIndex / 2)
    // 가운데 부근에서 시리즈별 선분을 어긋나게 (지사·본부·정기·합계)
    const segIndexOffsets = [-2, -1, 1, 2]

    const linePaths = MONTHLY_INSPECTION_SERIES.map((series, seriesIndex) => {
      const points = trend.map((item, index) => ({
        x: xAt(index),
        y: yInspection(item[series.key]),
        value: item[series.key],
      }))

      const segIndex = Math.min(
        lastSegIndex,
        Math.max(0, baseSegIndex + (segIndexOffsets[seriesIndex] ?? 0)),
      )
      // 점 1개뿐이면 동일 점으로 수평 라벨
      const p0 = points[segIndex] ?? points[0]
      const p1 = points[Math.min(points.length - 1, segIndex + 1)] ?? p0
      const label = buildLineLabel(p0, p1, MONTHLY_CHART.labelOffset)

      return {
        ...series,
        points,
        path: buildLinePath(points),
        segIndex,
        labelOffset: MONTHLY_CHART.labelOffset,
        labelX: label.labelX,
        labelY: label.labelY,
        labelAngle: label.labelAngle,
      }
    })

    // 겹치면 같은 선분을 유지한 채 수직 오프셋만 키워 분리한다(기울기 정렬 유지).
    const labelMinX = MONTHLY_CHART.padLeft + 16
    const labelMaxX = MONTHLY_CHART.padLeft + plotWidth - 16
    const labelMinY = MONTHLY_CHART.padTop + 8
    const labelMaxY = MONTHLY_CHART.padTop + plotHeight - 8
    for (let pass = 0; pass < 10; pass += 1) {
      let moved = false
      for (let i = 0; i < linePaths.length; i += 1) {
        for (let j = i + 1; j < linePaths.length; j += 1) {
          const a = linePaths[i]
          const b = linePaths[j]
          const dx = b.labelX - a.labelX
          const dy = b.labelY - a.labelY
          if (Math.abs(dx) >= MONTHLY_CHART.labelMinDx || Math.abs(dy) >= MONTHLY_CHART.labelMinDy) {
            continue
          }
          a.labelOffset += 3
          b.labelOffset += 5
          const a0 = a.points[a.segIndex] ?? a.points[0]
          const a1 = a.points[Math.min(a.points.length - 1, a.segIndex + 1)] ?? a0
          const b0 = b.points[b.segIndex] ?? b.points[0]
          const b1 = b.points[Math.min(b.points.length - 1, b.segIndex + 1)] ?? b0
          const nextA = buildLineLabel(a0, a1, a.labelOffset)
          const nextB = buildLineLabel(b0, b1, b.labelOffset)
          a.labelX = nextA.labelX
          a.labelY = nextA.labelY
          a.labelAngle = nextA.labelAngle
          b.labelX = nextB.labelX
          b.labelY = nextB.labelY
          b.labelAngle = nextB.labelAngle
          moved = true
        }
      }
      for (const series of linePaths) {
        series.labelX = Math.min(labelMaxX, Math.max(labelMinX, series.labelX))
        series.labelY = Math.min(labelMaxY, Math.max(labelMinY, series.labelY))
      }
      if (!moved) break
    }

    const bars = trend.map((item, index) => {
      const x = xAt(index)
      const y = yAccident(item.accidentCount)
      const height = Math.max(0, MONTHLY_CHART.padTop + plotHeight - y)
      return {
        month: item.month,
        accidentCount: item.accidentCount,
        x: x - barWidth / 2,
        y,
        width: barWidth,
        height: item.accidentCount > 0 ? Math.max(height, 2) : 0,
        centerX: x,
        item,
      }
    })

    return {
      width,
      height: MONTHLY_CHART.height,
      plotBottom: MONTHLY_CHART.padTop + plotHeight,
      inspectionTicks,
      accidentTicks,
      linePaths,
      bars,
      trend,
    }
  }, [chartAnalysis.monthlyTrend])

  const openCreateModal = () => {
    setEditingAccident(null)
    setActionError('')
    setIsModalOpen(true)
  }

  const openEditModal = (accident: ProjectAccident) => {
    setEditingAccident(accident)
    setActionError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (submitting) return
    setIsModalOpen(false)
    setEditingAccident(null)
    setActionError('')
  }

  const handleSubmit = async (input: AccidentFormInput) => {
    if (!userProfile || !canManageAccidents) {
      setActionError('사고 이력을 관리할 권한이 없습니다.')
      return
    }
    setSubmitting(true)
    setActionError('')
    try {
      const result = editingAccident
        ? await updateProjectAccident(editingAccident.id, input)
        : await createProjectAccident(input, userProfile.id)
      if (!result.success) {
        setActionError(result.error || '사고 이력을 저장하지 못했습니다.')
        return
      }
      setIsModalOpen(false)
      setEditingAccident(null)
      await loadData()
    } catch (caught) {
      console.error('사고 이력 저장 실패', caught)
      setActionError('사고 이력을 저장하는 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (accident: ProjectAccident) => {
    if (!canManageAccidents || deletingId) return
    const projectName = (accident.project_id ? projectMap.get(accident.project_id)?.project_name : null)
      ?? accident.external_project_name
      ?? '선택한 프로젝트'
    if (!window.confirm(`${projectName}의 ${formatDate(accident.accident_at)} 사고 이력을 삭제하시겠습니까?`)) return

    setDeletingId(accident.id)
    setActionError('')
    try {
      const result = await deleteProjectAccident(accident.id)
      if (!result.success) {
        setActionError(result.error || '사고 이력을 삭제하지 못했습니다.')
        return
      }
      await loadData()
    } catch (caught) {
      console.error('사고 이력 삭제 실패', caught)
      setActionError('사고 이력을 삭제하는 중 오류가 발생했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const resetFilters = () => {
    applyDatePreset('year_to_date')
    setSelectedHq(defaultHq)
    setSelectedBranch(defaultBranch)
    setSelectedProjectId('')
    setSelectedAccidentType('')
    setSelectedSeverity('')
  }

  const kpiItems = [
    { key: 'projects', label: '관측 프로젝트', value: `${analysis.kpis.observedProjectCount.toLocaleString()}개` },
    { key: 'accidents', label: '사고', value: `${analysis.kpis.accidentCount.toLocaleString()}건` },
    { key: 'injured', label: '부상자', value: `${analysis.kpis.injuredCount.toLocaleString()}명` },
    { key: 'fatal', label: '사망자', value: `${analysis.kpis.fatalCount.toLocaleString()}명` },
    { key: 'inspections', label: '안전점검', value: `${analysis.kpis.inspectionCount.toLocaleString()}건` },
    { key: 'latest', label: '마지막 사고일', value: formatDate(analysis.kpis.latestAccidentAt) },
  ]

  // 재해자 = 부상자 + 사망자. 재해율(%) = 재해자 ÷ 상시근로자 × 100 (분석 필터 범위)
  // 분모는 등록 프로젝트 + 미등록 현장 합산. 미등록 현장은 사고(분자) 필터와 같은 규칙으로
  // 특정 프로젝트 선택 시 제외하고, 사용자 범위·본부·지사 필터로 매칭한다.
  const regularWorkerCount = useMemo(() => {
    const registered = filteredProjects.reduce((sum, project) => sum + (regularByProject.get(project.id) || 0), 0)
    if (selectedProjectId) return registered
    let unregistered = 0
    regularUnregistered.forEach((value, key) => {
      const [hq, branch] = key.split('||')
      if (!isOrganizationInUserScope(userProfile, { managing_hq: hq, managing_branch: branch })) return
      if (selectedHq && hq !== selectedHq) return
      if (selectedBranch && branch !== selectedBranch) return
      unregistered += value
    })
    return registered + unregistered
  }, [filteredProjects, regularByProject, regularUnregistered, selectedBranch, selectedHq, selectedProjectId, userProfile])
  const casualtyCount = analysis.kpis.injuredCount + analysis.kpis.fatalCount
  const accidentRatePercent = regularWorkerCount > 0 ? (casualtyCount / regularWorkerCount) * 100 : 0
  const regularWorkerDisplay = Math.round(regularWorkerCount)

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button type="button" onClick={onBack} aria-label="안전현황으로 돌아가기" className="rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                사고 통계 분석
              </h2>
              <p className="mt-1 text-sm text-gray-500">정기·관리자·본부불시점검과 실제 사고 이력의 통계적 관계를 확인합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            {canManageAccidents && (
              <button type="button" onClick={openCreateModal} disabled={managementProjects.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                <Plus className="h-4 w-4" />
                사고 입력
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="accident-filter-title">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 id="accident-filter-title" className="text-sm font-semibold text-gray-900">분석 필터</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap rounded-md border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="조회 기간 프리셋">
              {DATE_PRESET_OPTIONS.map((option) => {
                const isActive = datePreset === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => applyDatePreset(option.value)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                    }`}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={resetFilters} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
              당해년도로 초기화
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div>
            <label htmlFor="analysis-start-date" className={filterLabelClassName}>시작일</label>
            <input
              id="analysis-start-date"
              type="date"
              value={startDate}
              onChange={(event) => {
                setDatePreset('custom')
                setStartDate(event.target.value)
              }}
              className={selectClassName}
            />
          </div>
          <div>
            <label htmlFor="analysis-end-date" className={filterLabelClassName}>종료일</label>
            <input
              id="analysis-end-date"
              type="date"
              value={endDate}
              onChange={(event) => {
                setDatePreset('custom')
                setEndDate(event.target.value)
              }}
              className={selectClassName}
            />
          </div>
          <div>
            <label htmlFor="analysis-hq" className={filterLabelClassName}>본부</label>
            <select id="analysis-hq" value={selectedHq} onChange={(event) => { setSelectedHq(event.target.value); setSelectedBranch(''); setSelectedProjectId('') }} className={selectClassName}>
              <option value="">전체 본부</option>
              {hqOptions.map((hq) => <option key={hq} value={hq}>{hq}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-branch" className={filterLabelClassName}>지사</label>
            <select id="analysis-branch" value={selectedBranch} onChange={(event) => { setSelectedBranch(event.target.value); setSelectedProjectId('') }} className={selectClassName}>
              <option value="">전체 지사</option>
              {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-project" className={filterLabelClassName}>프로젝트</label>
            <select id="analysis-project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className={selectClassName}>
              <option value="">전체 프로젝트</option>
              {organizationProjects.map((project) => <option key={project.id} value={project.id}>{project.project_name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-accident-type" className={filterLabelClassName}>사고 유형</label>
            <select id="analysis-accident-type" value={selectedAccidentType} onChange={(event) => setSelectedAccidentType(event.target.value)} className={selectClassName}>
              <option value="">전체 유형</option>
              {accidentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="analysis-severity" className={filterLabelClassName}>중대도</label>
            <select id="analysis-severity" value={selectedSeverity} onChange={(event) => setSelectedSeverity(event.target.value)} className={selectClassName}>
              <option value="">전체 중대도</option>
              {severityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:grid-cols-[auto_1fr]" role="note">
        <TriangleAlert className="mt-0.5 h-5 w-5" />
        <div>
          <p className="font-semibold">해석 시 주의사항</p>
          <p className="mt-1 text-xs leading-5">이 화면은 관찰자료의 연관성을 보여주며 인과관계를 증명하지 않습니다. 사고 미등록 월은 0건으로 계산하므로 신고 누락이 있으면 결과가 달라질 수 있습니다.</p>
        </div>
      </div>

      {actionError && !isModalOpen && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-lg border border-gray-200 bg-white"><LoadingSpinner /></div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
          <button type="button" onClick={() => void loadData()} className="mt-4 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">다시 시도</button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">선택한 조건에 해당하는 프로젝트가 없습니다.</div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="사고 분석 핵심 지표">
            {kpiItems.map((item) => (
              <div key={item.key} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500">{item.label}</p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-gray-900">{item.value}</p>
              </div>
            ))}
          </section>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            {regularLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                상시근로자·재해율을 계산하는 중…
              </span>
            ) : (
              <>
                상시근로자는 <strong>{regularWorkerDisplay.toLocaleString()}명</strong>, 재해자는{' '}
                <strong>{casualtyCount.toLocaleString()}명</strong>으로 재해율은{' '}
                <strong>{accidentRatePercent.toFixed(2)}%</strong> 입니다.
              </>
            )}
          </div>

          {analysis.sampleSize.isInsufficient && (
            <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800" role="status">
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span><strong>표본 부족.</strong> {analysis.sampleSize.message}</span>
            </div>
          )}

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="monthly-trend-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 id="monthly-trend-title" className="text-sm font-semibold text-gray-900">월별 점검·사고 추이</h3>
              </div>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-gray-600">
                <button
                  type="button"
                  aria-label={`사고 막대 ${visibleMonthlySeries.accidentCount ? '숨기기' : '표시하기'}`}
                  aria-pressed={visibleMonthlySeries.accidentCount}
                  onClick={() => toggleMonthlySeries('accidentCount')}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ${
                    visibleMonthlySeries.accidentCount ? 'opacity-100' : 'opacity-35'
                  }`}
                >
                  <span className="inline-block h-2.5 w-3.5 rounded-sm bg-red-400/80" />
                  사고
                </button>
                {MONTHLY_INSPECTION_SERIES.map((series) => {
                  const isVisible = visibleMonthlySeries[series.key]

                  return (
                    <button
                      key={series.key}
                      type="button"
                      aria-label={`${series.label} 점검 선 ${isVisible ? '숨기기' : '표시하기'}`}
                      aria-pressed={isVisible}
                      onClick={() => toggleMonthlySeries(series.key)}
                      className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 ${
                        isVisible ? 'opacity-100' : 'opacity-35'
                      }`}
                    >
                      <span
                        className="inline-block h-0.5 w-4 rounded-full"
                        style={{ backgroundColor: series.color, height: series.strokeWidth }}
                      />
                      {series.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {monthlyChart ? (
              <div className="mt-4 overflow-x-auto">
                <svg
                  role="img"
                  aria-labelledby="monthly-trend-title"
                  width={monthlyChart.width}
                  height={monthlyChart.height}
                  className="min-w-full"
                  viewBox={`0 0 ${monthlyChart.width} ${monthlyChart.height}`}
                >
                  <title>월별 점검 횟수 선형 그래프와 사고 발생 건수 막대 그래프</title>
                  {monthlyChart.inspectionTicks.map((tick) => (
                    <g key={`grid-${tick.value}-${tick.y}`}>
                      <line
                        x1={MONTHLY_CHART.padLeft}
                        x2={monthlyChart.width - MONTHLY_CHART.padRight}
                        y1={tick.y}
                        y2={tick.y}
                        stroke="#f3f4f6"
                        strokeWidth={1}
                      />
                      <text
                        x={MONTHLY_CHART.padLeft - 8}
                        y={tick.y + 3}
                        textAnchor="end"
                        className="fill-gray-400"
                        fontSize={10}
                      >
                        {tick.value}
                      </text>
                    </g>
                  ))}
                  {monthlyChart.accidentTicks.map((tick) => (
                    <text
                      key={`accident-tick-${tick.value}-${tick.y}`}
                      x={monthlyChart.width - MONTHLY_CHART.padRight + 8}
                      y={tick.y + 3}
                      textAnchor="start"
                      className="fill-red-400"
                      fontSize={10}
                    >
                      {tick.value}
                    </text>
                  ))}
                  <text
                    x={MONTHLY_CHART.padLeft}
                    y={12}
                    textAnchor="start"
                    className="fill-gray-400"
                    fontSize={10}
                  >
                    점검(건)
                  </text>
                  <text
                    x={monthlyChart.width - MONTHLY_CHART.padRight}
                    y={12}
                    textAnchor="end"
                    className="fill-red-400"
                    fontSize={10}
                  >
                    사고(건)
                  </text>
                  {monthlyChart.bars.map((bar) => (
                    <g key={`bar-${bar.month}`}>
                      {visibleMonthlySeries.accidentCount && bar.height > 0 && (
                        <rect
                          x={bar.x}
                          y={bar.y}
                          width={bar.width}
                          height={bar.height}
                          rx={3}
                          className="fill-red-400/75"
                        >
                          <title>{`${bar.month} 사고 ${bar.accidentCount}건`}</title>
                        </rect>
                      )}
                      <text
                        x={bar.centerX}
                        y={monthlyChart.plotBottom + 16}
                        textAnchor="middle"
                        className="fill-gray-600"
                        fontSize={10}
                      >
                        {bar.month.slice(2)}
                      </text>
                      {visibleMonthlySeries.accidentCount && bar.accidentCount > 0 && (
                        <text
                          x={bar.centerX}
                          y={bar.y - 4}
                          textAnchor="middle"
                          className="fill-red-600"
                          fontSize={9}
                          fontWeight={600}
                        >
                          {bar.accidentCount}
                        </text>
                      )}
                    </g>
                  ))}
                  {monthlyChart.linePaths
                    .filter((series) => visibleMonthlySeries[series.key])
                    .map((series) => (
                      <g key={series.key}>
                      <path
                        d={series.path}
                        fill="none"
                        stroke={series.color}
                        strokeWidth={series.strokeWidth}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {series.points.map((point, index) => (
                        <circle
                          key={`${series.key}-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r={series.key === 'inspectionCount' ? 3.5 : 2.5}
                          fill={series.color}
                          stroke="#fff"
                          strokeWidth={1}
                        >
                          <title>
                            {`${monthlyChart.trend[index]?.month ?? ''} ${series.label} 점검 ${point.value}건`}
                          </title>
                        </circle>
                      ))}
                      <text
                        x={series.labelX}
                        y={series.labelY}
                        transform={`rotate(${series.labelAngle.toFixed(2)} ${series.labelX.toFixed(2)} ${series.labelY.toFixed(2)})`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={11}
                        fontWeight={700}
                        fill={series.color}
                        stroke="#fff"
                        strokeWidth={3}
                        paintOrder="stroke"
                        style={{ pointerEvents: 'none' }}
                      >
                        {series.label}
                      </text>
                      </g>
                    ))}
                </svg>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-gray-500">표시할 월별 추이 데이터가 없습니다.</p>
            )}
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="accident-type-rank-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 id="accident-type-rank-title" className="text-sm font-semibold text-gray-900">사고 유형별 순위</h3>
                  <span className="text-[11px] tabular-nums text-gray-400" aria-label="조회 기간">
                    {startDate} ~ {endDate}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  위 분석 필터 기간·조직 조건에 해당하는 사고 건수를 유형별로 집계한 순위입니다.
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-500">
                총 {analysis.accidentDetails.length.toLocaleString()}건
              </span>
            </div>
            {accidentTypeRanking.length === 0 ? (
              <p className="mt-6 text-center text-sm text-gray-500">표시할 사고 유형 데이터가 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {accidentTypeRanking.map((row, index) => {
                  const maxCount = accidentTypeRanking[0]?.count || 1
                  const barWidth = Math.max(0, (row.count / maxCount) * 100)
                  const rank = index + 1
                  return (
                    <div key={row.type} className="grid grid-cols-[2rem_7.5rem_1fr_4.5rem_3.5rem] items-center gap-2 text-xs sm:grid-cols-[2.25rem_9rem_1fr_5rem_4rem] sm:gap-3 sm:text-sm">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                          rank === 1
                            ? 'bg-indigo-600 text-white'
                            : rank === 2
                              ? 'bg-indigo-100 text-indigo-800'
                              : rank === 3
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-gray-100 text-gray-600'
                        }`}
                        aria-label={`${rank}위`}
                      >
                        {rank}
                      </span>
                      <span className="truncate font-medium text-gray-800" title={row.type}>{row.type}</span>
                      <div
                        className="h-3 overflow-hidden rounded-full bg-indigo-50"
                        aria-label={`${row.type} ${row.count}건`}
                      >
                        <div
                          className={`h-full rounded-full ${
                            rank === 1 ? 'bg-indigo-600' : rank <= 3 ? 'bg-indigo-400' : 'bg-indigo-300'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-right font-semibold tabular-nums text-indigo-700">
                        {row.count.toLocaleString()}건
                      </span>
                      <span className="text-right tabular-nums text-gray-500">
                        {row.share.toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="finding-class-rank-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 id="finding-class-rank-title" className="text-sm font-semibold text-gray-900">지적사항 분류 순위</h3>
                  <span className="text-[11px] tabular-nums text-gray-400" aria-label="조회 기간">
                    {startDate} ~ {endDate}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  위 분석 필터 기간·조직 조건의 정기·본부불시점검 사진 지적 입력란을 고정 코드로 분류한 순위입니다(관리자점검 제외).
                </p>
              </div>
              <span className="shrink-0 text-right text-xs text-gray-500">
                총 {analysis.findingClassification.totalFindings.toLocaleString()}건
                <span className="mt-0.5 block text-[11px] text-gray-400">
                  정기 {analysis.findingClassification.regularFindings.toLocaleString()} · 본부 {analysis.findingClassification.headquartersFindings.toLocaleString()}
                </span>
              </span>
            </div>
            {analysis.findingClassification.rows.length === 0 ? (
              <p className="mt-6 text-center text-sm text-gray-500">표시할 지적 데이터가 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {analysis.findingClassification.rows.map((row, index) => {
                  const maxCount = analysis.findingClassification.rows[0]?.count || 1
                  const barWidth = Math.max(0, (row.count / maxCount) * 100)
                  const rank = index + 1
                  return (
                    <div key={row.code} className="grid grid-cols-[2rem_7.5rem_1fr_4.5rem_3.5rem] items-center gap-2 text-xs sm:grid-cols-[2.25rem_9rem_1fr_5rem_4rem] sm:gap-3 sm:text-sm">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                          rank === 1
                            ? 'bg-indigo-600 text-white'
                            : rank === 2
                              ? 'bg-indigo-100 text-indigo-800'
                              : rank === 3
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-gray-100 text-gray-600'
                        }`}
                        aria-label={`${rank}위`}
                      >
                        {rank}
                      </span>
                      <span
                        className="truncate font-medium text-gray-800"
                        title={`${row.name} (정기 ${row.regularCount} · 본부 ${row.headquartersCount})`}
                      >
                        {row.name}
                      </span>
                      <div
                        className="h-3 overflow-hidden rounded-full bg-indigo-50"
                        aria-label={`${row.name} ${row.count}건`}
                      >
                        <div
                          className={`h-full rounded-full ${
                            rank === 1 ? 'bg-indigo-600' : rank <= 3 ? 'bg-indigo-400' : 'bg-indigo-300'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-right font-semibold tabular-nums text-indigo-700">
                        {row.count.toLocaleString()}건
                      </span>
                      <span className="text-right tabular-nums text-gray-500">
                        {row.ratio.toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          </div>

          {SHOW_PROJECT_SUMMARY && (
            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="project-summary-title">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 id="project-summary-title" className="text-sm font-semibold text-gray-900">프로젝트별 요약</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">프로젝트</th>
                      <th className="px-3 py-3 text-center font-medium">본부·지사</th>
                      <th className="px-3 py-3 text-right font-medium">점검</th>
                      <th className="px-3 py-3 text-right font-medium">서명 완료율</th>
                      <th className="px-3 py-3 text-right font-medium">지적</th>
                      <th className="px-3 py-3 text-right font-medium">미조치</th>
                      <th className="px-3 py-3 text-right font-medium">사고</th>
                      <th className="px-3 py-3 text-right font-medium">부상·사망</th>
                      <th className="px-3 py-3 text-center font-medium">최근 사고일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {analysis.projectSummaries.map((summary) => (
                      <tr key={summary.projectId}>
                        <td className="px-3 py-3 font-medium text-gray-900">{summary.projectName}</td>
                        <td className="px-3 py-3 text-center text-gray-600">{summary.managingHq} · {summary.managingBranch}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{summary.inspectionCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatRate(summary.signatureCompletionRate)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{summary.findingCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right tabular-nums text-red-600">{summary.unresolvedCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums text-indigo-700">{summary.accidentCount.toLocaleString()}건</td>
                        <td className="px-3 py-3 text-right tabular-nums">{summary.injuredCount.toLocaleString()}명 · {summary.fatalCount.toLocaleString()}명</td>
                        <td className="px-3 py-3 text-center text-gray-600">{formatDate(summary.latestAccidentAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="accident-history-title">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 id="accident-history-title" className="text-sm font-semibold text-gray-900">사고 이력</h3>
                  <span className="text-[11px] tabular-nums text-gray-400" aria-label="조회 기간">
                    {startDate} ~ {endDate}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">최근 점검으로부터 사고일까지 경과 일수와 점검 내용을 함께 표시합니다.</p>
              </div>
              <span className="text-xs text-gray-500">{analysis.accidentDetails.length.toLocaleString()}건</span>
            </div>
            {analysis.accidentDetails.length === 0 ? (
              <div className="p-10 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">선택한 조건에 등록된 사고 이력이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-3 text-center font-medium">프로젝트</th>
                      <th className="px-3 py-3 text-center font-medium">사고일자</th>
                      <th className="px-3 py-3 text-center font-medium">중대도·유형</th>
                      <th className="px-3 py-3 text-center font-medium">산재신청</th>
                      <th className="px-3 py-3 text-center font-medium">사고 개요</th>
                      <th className="px-3 py-3 text-center font-medium">점검 후 경과일</th>
                      <th className="px-3 py-3 text-center font-medium">최근 점검</th>
                      {canManageAccidents && <th className="px-3 py-3 text-center font-medium">관리</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {analysis.accidentDetails.map((detail) => {
                      const accident = detail.accident
                      const project = accident.project_id ? projectMap.get(accident.project_id) : undefined
                      const projectName = project?.project_name
                        ?? accident.external_project_name
                        ?? '프로젝트 미상'
                      const managingHq = project?.managing_hq ?? accident.external_managing_hq ?? ''
                      const managingBranch = project?.managing_branch ?? accident.external_managing_branch ?? ''
                      const isExternalSite = !accident.project_id
                      return (
                        <tr key={accident.id} className="align-top">
                          <td className="px-3 py-3">
                            <p className="font-medium text-gray-900">
                              {projectName}
                              {isExternalSite && (
                                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                  미등록
                                </span>
                              )}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {[managingHq, managingBranch].filter(Boolean).join(' · ') || '-'}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-gray-600">{formatDate(accident.accident_at)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(accident.severity)}`}>{severityLabel(accident.severity)}</span>
                            <p className="mt-1 text-xs text-gray-600">{accident.accident_type}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${compClaimBadgeClass(accident.workers_comp_claim)}`}>
                              {compClaimLabel(accident.workers_comp_claim)}
                            </span>
                          </td>
                          <td className="max-w-sm px-3 py-3 text-gray-700">
                            <p className="line-clamp-3 whitespace-pre-line">{accident.description}</p>
                            <details className="mt-2 rounded-md bg-gray-50 px-2.5 py-2 text-xs">
                              <summary className="cursor-pointer font-medium text-indigo-700">장소·작업·원인·재발방지 대책 보기</summary>
                              <dl className="mt-2 space-y-2 text-gray-600">
                                <div>
                                  <dt className="font-medium text-gray-700">사고 장소</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.location}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-gray-700">사고 당시 작업</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.work_description}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-gray-700">사고 원인</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.cause}</dd>
                                </div>
                                <div>
                                  <dt className="font-medium text-gray-700">재발방지 대책</dt>
                                  <dd className="mt-0.5 whitespace-pre-wrap break-words">{accident.prevention_action}</dd>
                                </div>
                              </dl>
                            </details>
                            {(accident.injured_count > 0 || accident.fatal_count > 0 || accident.lost_workdays > 0) && (
                              <p className="mt-1 text-xs text-gray-500">부상 {accident.injured_count}명 · 사망 {accident.fatal_count}명 · 휴업 {accident.lost_workdays}일</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-indigo-700">
                            {detail.daysSinceLatestInspection !== null
                              ? `${detail.daysSinceLatestInspection.toLocaleString()}일`
                              : <span className="text-xs font-normal text-gray-400">-</span>}
                          </td>
                          <td className="max-w-sm px-3 py-3 text-gray-600">
                            {detail.latestInspection ? (
                              <>
                                <p className="font-medium text-gray-700">{detail.latestInspection.source_label} · {formatDate(detail.latestInspection.inspected_at)}</p>
                                <p className="mt-1 line-clamp-2 text-xs">{detail.latestInspection.summary || '기록된 점검 내용 없음'}</p>
                              </>
                            ) : <span className="text-xs text-gray-400">사고 전 점검 이력 없음</span>}
                          </td>
                          {canManageAccidents && (
                            <td className="px-3 py-3 text-center">
                              <div className="inline-flex gap-1">
                                <button type="button" onClick={() => openEditModal(accident)} aria-label={`${project?.project_name ?? ''} 사고 이력 수정`} className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50">
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => void handleDelete(accident)} disabled={deletingId === accident.id} aria-label={`${project?.project_name ?? ''} 사고 이력 삭제`} className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-50">
                                  {deletingId === accident.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <AccidentEntryModal
        isOpen={isModalOpen}
        projects={managementProjects}
        accident={editingAccident}
        submitting={submitting}
        submitError={actionError}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
