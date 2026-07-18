// 안전점검 횟수와 사고 발생의 프로젝트-월 관계를 계산하는 분석 모듈
import type { Project } from '@/lib/projects'
import type {
  AccidentAnalysisResult,
  NormalizedSafetyInspection,
  ProjectAccident,
} from '@/lib/accident-analysis-types'
import {
  DAY_MS,
  parseCalendarDay,
  toInstantTimestamp,
  toSeoulCalendarDay,
} from '@/lib/accident-analysis-utils'
import { aggregateFindingClassification } from '@/lib/finding-classification'

const roundOneDecimal = (value: number): number => Math.round(value * 10) / 10

const compareTimestampDescending = (left: string, right: string): number =>
  (toInstantTimestamp(right) ?? -Infinity) - (toInstantTimestamp(left) ?? -Infinity)

const monthKey = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 7)

const getMonthStarts = (startTimestamp: number, endTimestamp: number): number[] => {
  const start = new Date(startTimestamp)
  let current = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  const months: number[] = []
  while (current <= endTimestamp) {
    months.push(current)
    const date = new Date(current)
    current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }
  return months
}

const emptyAnalysis = (): AccidentAnalysisResult => ({
  kpis: {
    observedProjectCount: 0,
    accidentCount: 0,
    injuredCount: 0,
    fatalCount: 0,
    inspectionCount: 0,
    latestAccidentAt: null,
    projectMonthCount: 0,
    accidentsPer100ProjectMonths: 0,
  },
  monthlyTrend: [],
  projectSummaries: [],
  accidentDetails: [],
  sampleSize: {
    projectMonthCount: 0,
    accidentProjectMonthCount: 0,
    isInsufficient: true,
    message: '분석할 프로젝트-월 표본이 없습니다.',
  },
  findingClassification: aggregateFindingClassification([]),
})

const overlapsConstructionPeriod = (project: Project, rangeStart: number, rangeEnd: number): boolean => {
  const constructionStart = project.construction_start_date
    ? parseCalendarDay(project.construction_start_date)
    : null
  const constructionEnd = project.construction_end_date
    ? parseCalendarDay(project.construction_end_date)
    : null
  return (constructionStart === null || constructionStart < rangeEnd) &&
    (constructionEnd === null || constructionEnd + DAY_MS > rangeStart)
}

export function calculateAccidentAnalysis(
  projects: Project[],
  accidents: ProjectAccident[],
  inspections: NormalizedSafetyInspection[],
  startDate: string,
  endDate: string
): AccidentAnalysisResult {
  const startTimestamp = parseCalendarDay(startDate)
  const endTimestamp = parseCalendarDay(endDate)
  if (startTimestamp === null || endTimestamp === null || startTimestamp > endTimestamp) return emptyAnalysis()

  const endExclusive = endTimestamp + DAY_MS
  const projectMap = new Map<string, Project>()
  for (const project of projects) {
    if (project.id && !projectMap.has(project.id)) projectMap.set(project.id, project)
  }
  const hasExternalAccidentInRange = accidents.some((accident) => {
    if (accident.project_id) return false
    const timestamp = toSeoulCalendarDay(accident.accident_at)
    return timestamp !== null && timestamp >= startTimestamp && timestamp < endExclusive
  })
  if (projectMap.size === 0 && !hasExternalAccidentInRange) return emptyAnalysis()

  const monthStarts = getMonthStarts(startTimestamp, endTimestamp)
  const recordedMonthsByProject = new Map<string, Set<number>>()
  const addRecordedMonth = (projectId: string, timestamp: number | null) => {
    if (!projectMap.has(projectId) || timestamp === null || timestamp < startTimestamp || timestamp >= endExclusive) return
    const date = new Date(timestamp)
    const startOfMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
    const recordedMonths = recordedMonthsByProject.get(projectId) || new Set<number>()
    recordedMonths.add(startOfMonth)
    recordedMonthsByProject.set(projectId, recordedMonths)
  }
  for (const accident of accidents) {
    if (accident.project_id) addRecordedMonth(accident.project_id, toSeoulCalendarDay(accident.accident_at))
  }
  for (const inspection of inspections) addRecordedMonth(inspection.project_id, parseCalendarDay(inspection.inspected_at))

  const eligibleMonthsByProject = new Map<string, number[]>()
  for (const [projectId, project] of projectMap) {
    const eligibleMonths = monthStarts.filter((startOfMonth) => {
      const date = new Date(startOfMonth)
      const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
      const overlapsConstruction = overlapsConstructionPeriod(
        project,
        Math.max(startOfMonth, startTimestamp),
        Math.min(nextMonth, endExclusive)
      )
      return overlapsConstruction || recordedMonthsByProject.get(projectId)?.has(startOfMonth) === true
    })
    if (eligibleMonths.length > 0) eligibleMonthsByProject.set(projectId, eligibleMonths)
  }
  if (eligibleMonthsByProject.size === 0 && !hasExternalAccidentInRange) return emptyAnalysis()

  const isEligibleDay = (projectId: string, timestamp: number): boolean => {
    const date = new Date(timestamp)
    const startOfMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
    return eligibleMonthsByProject.get(projectId)?.includes(startOfMonth) ?? false
  }

  const scopedAccidents = accidents.filter((accident) => {
    const timestamp = toSeoulCalendarDay(accident.accident_at)
    if (timestamp === null || timestamp < startTimestamp || timestamp >= endExclusive) return false
    // 미등록 현장 사고는 프로젝트-월 관측 없이도 기간 내 건으로 포함한다.
    if (!accident.project_id) return true
    return isEligibleDay(accident.project_id, timestamp)
  })
  const loadedInspections = inspections.filter((inspection) => {
    const timestamp = parseCalendarDay(inspection.inspected_at)
    return projectMap.has(inspection.project_id) && timestamp !== null && timestamp < endExclusive
  })
  const periodInspections = loadedInspections.filter((inspection) => {
    const timestamp = parseCalendarDay(inspection.inspected_at)
    return timestamp !== null && timestamp >= startTimestamp && isEligibleDay(inspection.project_id, timestamp)
  })

  // 지적 분류 집계: 분석 기간·조직 필터 내 정기·본부불시점검 지적만 사용한다(관리자점검 제외).
  const findingClassification = aggregateFindingClassification(
    periodInspections
      .filter((inspection) => inspection.source_type !== 'manager')
      .flatMap((inspection) =>
        inspection.findings.map((finding) => ({
          code: finding.code,
          source: inspection.source_type === 'headquarters' ? ('headquarters' as const) : ('safety' as const),
        })),
      ),
  )

  const accidentsByProject = new Map<string, ProjectAccident[]>()
  for (const accident of scopedAccidents) {
    if (!accident.project_id) continue
    const current = accidentsByProject.get(accident.project_id) || []
    accidentsByProject.set(accident.project_id, [...current, accident])
  }
  const inspectionsByProject = new Map<string, NormalizedSafetyInspection[]>()
  for (const inspection of loadedInspections) {
    const current = inspectionsByProject.get(inspection.project_id) || []
    inspectionsByProject.set(inspection.project_id, [...current, inspection])
  }
  for (const [projectId, projectInspections] of inspectionsByProject) {
    inspectionsByProject.set(projectId, [...projectInspections].sort((left, right) =>
      right.inspected_at.localeCompare(left.inspected_at)
    ))
  }

  const monthlyTrend = monthStarts.map((startOfMonth) => {
    const date = new Date(startOfMonth)
    const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    const observationStart = Math.max(startOfMonth, startTimestamp)
    const observationEnd = Math.min(nextMonth, endExclusive)
    const monthAccidents = scopedAccidents.filter((accident) => {
      const timestamp = toSeoulCalendarDay(accident.accident_at)
      return timestamp !== null && timestamp >= observationStart && timestamp < observationEnd
    })
    const monthInspections = periodInspections.filter((inspection) => {
      const timestamp = parseCalendarDay(inspection.inspected_at)
      return timestamp !== null && timestamp >= observationStart && timestamp < observationEnd
    })
    const safetyInspectionCount = monthInspections.filter((item) => item.source_type === 'safety').length
    const managerInspectionCount = monthInspections.filter((item) => item.source_type === 'manager').length
    const headquartersInspectionCount = monthInspections.filter((item) => item.source_type === 'headquarters').length
    return {
      month: monthKey(startOfMonth),
      inspectionCount: monthInspections.length,
      safetyInspectionCount,
      managerInspectionCount,
      headquartersInspectionCount,
      accidentCount: monthAccidents.length,
      injuredCount: monthAccidents.reduce((sum, accident) => sum + accident.injured_count, 0),
      fatalCount: monthAccidents.reduce((sum, accident) => sum + accident.fatal_count, 0),
    }
  })

  const projectSummaries = Array.from(projectMap.values())
    .filter((project) => eligibleMonthsByProject.has(project.id))
    .map((project) => {
      const projectInspections = periodInspections.filter((inspection) => inspection.project_id === project.id)
      const projectAccidents = accidentsByProject.get(project.id) || []
      const signedInspectionCount = projectInspections.filter((inspection) => inspection.signed).length
      const latestAccident = [...projectAccidents].sort((left, right) =>
        compareTimestampDescending(left.accident_at, right.accident_at)
      )[0]
      return {
        projectId: project.id,
        projectName: project.project_name,
        managingHq: project.managing_hq || '',
        managingBranch: project.managing_branch || '',
        inspectionCount: projectInspections.length,
        signedInspectionCount,
        signatureCompletionRate: projectInspections.length > 0
          ? roundOneDecimal((signedInspectionCount / projectInspections.length) * 100)
          : 0,
        findingCount: projectInspections.reduce((sum, inspection) => sum + inspection.finding_count, 0),
        unresolvedCount: projectInspections.reduce((sum, inspection) => sum + inspection.unresolved_count, 0),
        accidentCount: projectAccidents.length,
        injuredCount: projectAccidents.reduce((sum, accident) => sum + accident.injured_count, 0),
        fatalCount: projectAccidents.reduce((sum, accident) => sum + accident.fatal_count, 0),
        latestAccidentAt: latestAccident?.accident_at || null,
      }
    }).sort((left, right) =>
      right.accidentCount - left.accidentCount || left.projectName.localeCompare(right.projectName, 'ko')
    )

  const accidentDetails = scopedAccidents.map((accident) => {
    const accidentDay = toSeoulCalendarDay(accident.accident_at)
    const projectInspections = accident.project_id
      ? (inspectionsByProject.get(accident.project_id) || [])
      : []
    const priorInspections = accidentDay === null
      ? []
      : projectInspections.filter((inspection) => {
          const timestamp = parseCalendarDay(inspection.inspected_at)
          return timestamp !== null && timestamp < accidentDay
        })
    const latestInspection = priorInspections[0] || null
    let daysSinceLatestInspection: number | null = null
    if (latestInspection && accidentDay !== null) {
      const inspectionDay = parseCalendarDay(latestInspection.inspected_at)
      if (inspectionDay !== null) {
        daysSinceLatestInspection = Math.round((accidentDay - inspectionDay) / DAY_MS)
      }
    }
    return {
      accident,
      daysSinceLatestInspection,
      latestInspection,
    }
  }).sort((left, right) => compareTimestampDescending(left.accident.accident_at, right.accident.accident_at))

  // 표본 판정용: 사고 발생 프로젝트-월 수
  let accidentProjectMonthCount = 0
  for (const [projectId, eligibleMonths] of eligibleMonthsByProject) {
    const projectAccidents = accidentsByProject.get(projectId) || []
    for (const startOfMonth of eligibleMonths) {
      const date = new Date(startOfMonth)
      const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
      const observationStart = Math.max(startOfMonth, startTimestamp)
      const observationEnd = Math.min(nextMonth, endExclusive)
      const hasAccident = projectAccidents.some((accident) => {
        const timestamp = toSeoulCalendarDay(accident.accident_at)
        return timestamp !== null && timestamp >= observationStart && timestamp < observationEnd
      })
      if (hasAccident) accidentProjectMonthCount += 1
    }
  }

  const projectMonthCount = Array.from(eligibleMonthsByProject.values())
    .reduce((sum, eligibleMonths) => sum + eligibleMonths.length, 0)
  const isInsufficient = projectMonthCount < 30 || accidentProjectMonthCount < 5
  const sampleReasons = [
    projectMonthCount < 30 ? `프로젝트-월 표본 ${projectMonthCount}개로 30개 미만입니다.` : '',
    accidentProjectMonthCount < 5 ? `사고 발생 프로젝트-월 ${accidentProjectMonthCount}개로 5개 미만입니다.` : '',
  ].filter(Boolean)
  const latestAccident = [...scopedAccidents].sort((left, right) =>
    compareTimestampDescending(left.accident_at, right.accident_at)
  )[0]

  return {
    kpis: {
      observedProjectCount: eligibleMonthsByProject.size,
      accidentCount: scopedAccidents.length,
      injuredCount: scopedAccidents.reduce((sum, accident) => sum + accident.injured_count, 0),
      fatalCount: scopedAccidents.reduce((sum, accident) => sum + accident.fatal_count, 0),
      inspectionCount: periodInspections.length,
      latestAccidentAt: latestAccident?.accident_at || null,
      projectMonthCount,
      accidentsPer100ProjectMonths: projectMonthCount > 0
        ? roundOneDecimal((scopedAccidents.length / projectMonthCount) * 100)
        : 0,
    },
    monthlyTrend,
    projectSummaries,
    accidentDetails,
    sampleSize: {
      projectMonthCount,
      accidentProjectMonthCount,
      isInsufficient,
      message: isInsufficient
        ? sampleReasons.join(' ')
        : '분석의 최소 표본 기준을 충족했습니다.',
    },
    findingClassification,
  }
}
