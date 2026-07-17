// 안전점검 횟수와 사고 발생의 프로젝트-월 관계를 계산하는 분석 모듈
import type { Project } from '@/lib/projects'
import type {
  AccidentAnalysisResult,
  InspectionCountBandKey,
  InspectionCountRelation,
  NormalizedSafetyInspection,
  ProjectAccident,
} from '@/lib/accident-analysis-types'
import {
  DAY_MS,
  parseCalendarDay,
  toInstantTimestamp,
  toSeoulCalendarDay,
} from '@/lib/accident-analysis-utils'

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

const relationBand = (inspectionCount: number): InspectionCountBandKey => {
  if (inspectionCount === 0) return '0'
  if (inspectionCount === 1) return '1'
  if (inspectionCount <= 3) return '2-3'
  return '4+'
}

const emptyRelationMap = (): Map<InspectionCountBandKey, InspectionCountRelation> => new Map([
  ['0', { key: '0', label: '0건', projectMonthCount: 0, accidentProjectMonthCount: 0, accidentCount: 0, accidentOccurrenceRate: 0 }],
  ['1', { key: '1', label: '1건', projectMonthCount: 0, accidentProjectMonthCount: 0, accidentCount: 0, accidentOccurrenceRate: 0 }],
  ['2-3', { key: '2-3', label: '2~3건', projectMonthCount: 0, accidentProjectMonthCount: 0, accidentCount: 0, accidentOccurrenceRate: 0 }],
  ['4+', { key: '4+', label: '4건 이상', projectMonthCount: 0, accidentProjectMonthCount: 0, accidentCount: 0, accidentOccurrenceRate: 0 }],
])

const finalizeRelation = (map: Map<InspectionCountBandKey, InspectionCountRelation>): InspectionCountRelation[] =>
  Array.from(map.values()).map((item) => ({
    ...item,
    accidentOccurrenceRate: item.projectMonthCount > 0
      ? roundOneDecimal((item.accidentProjectMonthCount / item.projectMonthCount) * 100)
      : 0,
  }))

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
  relation30Days: finalizeRelation(emptyRelationMap()),
  relation90Days: finalizeRelation(emptyRelationMap()),
  sampleSize: {
    projectMonthCount: 0,
    accidentProjectMonthCount: 0,
    isInsufficient: true,
    message: '분석할 프로젝트-월 표본이 없습니다.',
  },
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
  if (projectMap.size === 0) return emptyAnalysis()

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
  for (const accident of accidents) addRecordedMonth(accident.project_id, toSeoulCalendarDay(accident.accident_at))
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
  if (eligibleMonthsByProject.size === 0) return emptyAnalysis()

  const isEligibleDay = (projectId: string, timestamp: number): boolean => {
    const date = new Date(timestamp)
    const startOfMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
    return eligibleMonthsByProject.get(projectId)?.includes(startOfMonth) ?? false
  }

  const scopedAccidents = accidents.filter((accident) => {
    const timestamp = toSeoulCalendarDay(accident.accident_at)
    return timestamp !== null && timestamp >= startTimestamp && timestamp < endExclusive &&
      isEligibleDay(accident.project_id, timestamp)
  })
  const loadedInspections = inspections.filter((inspection) => {
    const timestamp = parseCalendarDay(inspection.inspected_at)
    return projectMap.has(inspection.project_id) && timestamp !== null && timestamp < endExclusive
  })
  const periodInspections = loadedInspections.filter((inspection) => {
    const timestamp = parseCalendarDay(inspection.inspected_at)
    return timestamp !== null && timestamp >= startTimestamp && isEligibleDay(inspection.project_id, timestamp)
  })

  const accidentsByProject = new Map<string, ProjectAccident[]>()
  for (const accident of scopedAccidents) {
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
    return {
      month: monthKey(startOfMonth),
      inspectionCount: monthInspections.length,
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
    const projectInspections = inspectionsByProject.get(accident.project_id) || []
    const priorInspections = accidentDay === null
      ? []
      : projectInspections.filter((inspection) => {
          const timestamp = parseCalendarDay(inspection.inspected_at)
          return timestamp !== null && timestamp < accidentDay
        })
    return {
      accident,
      prior30Count: accidentDay === null
        ? 0
        : priorInspections.filter((inspection) =>
            (parseCalendarDay(inspection.inspected_at) ?? -Infinity) >= accidentDay - 30 * DAY_MS
          ).length,
      prior90Count: accidentDay === null
        ? 0
        : priorInspections.filter((inspection) =>
            (parseCalendarDay(inspection.inspected_at) ?? -Infinity) >= accidentDay - 90 * DAY_MS
          ).length,
      latestInspection: priorInspections[0] || null,
    }
  }).sort((left, right) => compareTimestampDescending(left.accident.accident_at, right.accident.accident_at))

  const relation30Map = emptyRelationMap()
  const relation90Map = emptyRelationMap()
  let accidentProjectMonthCount = 0

  for (const [projectId, eligibleMonths] of eligibleMonthsByProject) {
    const projectAccidents = accidentsByProject.get(projectId) || []
    const projectInspections = inspectionsByProject.get(projectId) || []
    for (const startOfMonth of eligibleMonths) {
      const date = new Date(startOfMonth)
      const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
      const observationStart = Math.max(startOfMonth, startTimestamp)
      const observationEnd = Math.min(nextMonth, endExclusive)
      const monthAccidents = projectAccidents.filter((accident) => {
        const timestamp = toSeoulCalendarDay(accident.accident_at)
        return timestamp !== null && timestamp >= observationStart && timestamp < observationEnd
      })
      if (monthAccidents.length > 0) accidentProjectMonthCount += 1

      const priorInspectionCount = (days: number): number => projectInspections.filter((inspection) => {
        const timestamp = parseCalendarDay(inspection.inspected_at)
        return timestamp !== null && timestamp < observationStart && timestamp >= observationStart - days * DAY_MS
      }).length

      const addObservation = (map: Map<InspectionCountBandKey, InspectionCountRelation>, count: number) => {
        const key = relationBand(count)
        const current = map.get(key)
        if (!current) return
        map.set(key, {
          ...current,
          projectMonthCount: current.projectMonthCount + 1,
          accidentProjectMonthCount: current.accidentProjectMonthCount + (monthAccidents.length > 0 ? 1 : 0),
          accidentCount: current.accidentCount + monthAccidents.length,
        })
      }

      addObservation(relation30Map, priorInspectionCount(30))
      addObservation(relation90Map, priorInspectionCount(90))
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
    relation30Days: finalizeRelation(relation30Map),
    relation90Days: finalizeRelation(relation90Map),
    sampleSize: {
      projectMonthCount,
      accidentProjectMonthCount,
      isInsufficient,
      message: isInsufficient
        ? sampleReasons.join(' ')
        : '관계 분석의 최소 표본 기준을 충족했습니다.',
    },
  }
}
