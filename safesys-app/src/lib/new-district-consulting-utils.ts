// 신규지구 안전컨설팅의 대표계약 시작일 해석·인정기간 계산·본부/지사 집계를 담당하는 순수 로직 모음이다.
import { addMonths } from 'date-fns'
import { BRANCH_OPTIONS, HEADQUARTERS_OPTIONS } from '@/lib/constants'

/** 컨설팅 인정 기간 기본값(개월). */
export const DEFAULT_CONSULTING_MONTHS = 3

/** 인정 기간 하한(개월). */
export const MIN_CONSULTING_MONTHS = 1

/** 대표 계약 시작일을 못 구한 사유. */
export type NewDistrictExcludeReason = 'no_representative' | 'no_start_date'

/** 집계에 필요한 프로젝트 필드만 추린 입력 형태. */
export interface NewDistrictProjectInput {
  id: string
  project_name: string
  managing_hq: string
  managing_branch: string
  representative_contract_id?: string | null
  g2b_cntrct_no?: string | null
  g2b_ntce_no?: string | null
}

/** 집계에 필요한 project_contracts 필드. */
export interface ConsultingContractRow {
  id: string
  project_id: string
  contract_type: string
  cntrct_nm: string
  cntrct_no?: string | null
  unty_cntrct_no?: string | null
  cntrct_info_url?: string | null
  start_date?: string | null
  tot_cntrct_amt?: number | null
  thtm_cntrct_amt?: number | null
}

/** 집계에 필요한 headquarters_inspections 필드. */
export interface ConsultingInspectionRow {
  id: string
  project_id: string
  inspection_date: string
}

/** 프로젝트(지구) 한 행. */
export interface NewDistrictProjectRow {
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  representativeStartDate: string | null
  deadlineDate: string | null
  inspectionDates: string[]
  inspectionCount: number
  inspected: boolean
  excluded: boolean
  excludeReason: NewDistrictExcludeReason | null
}

/** 지사·본부·전체에서 같은 모양으로 쓰는 소계. */
export interface NewDistrictSubtotal {
  districtCount: number
  inspectedDistrictCount: number
  inspectionCount: number
  excludedCount: number
  rate: number
}

export interface NewDistrictBranchGroup {
  branch: string
  subtotal: NewDistrictSubtotal
  projects: NewDistrictProjectRow[]
}

export interface NewDistrictHqGroup {
  hq: string
  subtotal: NewDistrictSubtotal
  branches: NewDistrictBranchGroup[]
}

export interface NewDistrictConsultingResult {
  year: number
  months: number
  hqs: NewDistrictHqGroup[]
  total: NewDistrictSubtotal
}

/** 코호트 판정을 마친 프로젝트 한 건. 점검 조회 범위를 잡는 데 쓴다. */
export interface NewDistrictCohortEntry {
  project: NewDistrictProjectInput
  representativeStartDate: string | null
  deadlineDate: string | null
  excluded: boolean
  excludeReason: NewDistrictExcludeReason | null
}

export interface NewDistrictCohort {
  year: number
  months: number
  entries: NewDistrictCohortEntry[]
  /** 집계 대상의 최소 대표 시작일. 대상이 없으면 null이다. */
  minStartDate: string | null
  /** 집계 대상의 최대 인정 기한. 연도 경계를 넘길 수 있다. */
  maxDeadlineDate: string | null
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 인정 기간 개월 수를 정수·최소 1개월로 맞춘다. 값이 이상하면 기본값을 쓴다.
 * 상한은 두지 않는다 — 계획이 정한 제약은 하한 1개월뿐이고, 1년은 착공연도 코호트를 뜻한다.
 */
export function clampConsultingMonths(months: unknown): number {
  const numeric = typeof months === 'number' && Number.isFinite(months) ? Math.trunc(months) : NaN
  if (Number.isNaN(numeric)) return DEFAULT_CONSULTING_MONTHS
  if (numeric < MIN_CONSULTING_MONTHS) return MIN_CONSULTING_MONTHS
  return numeric
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * yyyy-MM-dd 문자열에 달력 개월을 더한다. 30일 환산이 아니라 월말 보정이 적용된다.
 * UTC 파싱 함정을 피하려고 로컬 Date로 만들고 직접 포맷한다.
 */
export function addMonthsToDateText(dateText: string | null | undefined, months: number): string | null {
  const matched = typeof dateText === 'string' ? dateText.trim().match(DATE_PATTERN) : null
  if (!matched) return null

  const base = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
  if (Number.isNaN(base.getTime())) return null

  const moved = addMonths(base, months)
  return `${moved.getFullYear()}-${pad2(moved.getMonth() + 1)}-${pad2(moved.getDate())}`
}

/** 계약 상세 딥링크의 ctrtNo(차수 없는 기본 계약번호). 없으면 빈 문자열이다. */
export function ctrtNoFromUrl(url: string | null | undefined): string {
  const matched = url?.match(/[?&]ctrtNo=([A-Za-z0-9]+)/)
  return matched ? matched[1] : ''
}

/** 차수분 계약 판별 — 장기계속계약의 연차 차수 행은 총액과 금차가 다르다. */
export function isThtmPartial(tot?: number | null, thtm?: number | null): boolean {
  return tot != null && thtm != null && tot > 0 && thtm > 0 && tot !== thtm
}

/** 계약현황과 같은 그룹 키 — 연차 접미어를 떼고 구분+계약명(공백 제거)으로 묶는다. */
export function nameGroupKey(type: string, name: string, stripYearAffix = false): string {
  let n = name.replace(/(?:\(\s*\d+\s*차[^)]*\)|\d+\s*차년도)\s*$/, '')
  if (stripYearAffix) {
    n = n.replace(/^20\d{2}\s*년도?\s*/, '').replace(/\(\s*20\d{2}\s*년도?\s*\)\s*$/, '')
  }
  return `${type}|${n.replace(/\s+/g, '')}`
}

/**
 * 대표 계약 행 id — 계약현황에서 지정한 대표가 우선이고,
 * 없으면 편집 페이지에서 연계한 나라장터 계약을 기본 대표로 본다.
 */
export function resolveRepresentativeContractId(
  project: NewDistrictProjectInput,
  projectRows: ConsultingContractRow[]
): string | null {
  if (project.representative_contract_id) return project.representative_contract_id

  const no = (project.g2b_cntrct_no || project.g2b_ntce_no || '').replace(/\s+/g, '')
  if (!no) return null

  const noBase = no.length >= 13 ? no.slice(0, -2) : no
  const match = projectRows.find((row) => {
    const cntrctNo = row.cntrct_no ?? ''
    if (cntrctNo && (cntrctNo === no || (cntrctNo.length >= 13 && cntrctNo.slice(0, -2) === noBase))) return true
    if (row.unty_cntrct_no && row.unty_cntrct_no === no) return true
    if (ctrtNoFromUrl(row.cntrct_info_url) === no) return true
    return false
  })

  return match?.id ?? null
}

export interface RepresentativeStartDate {
  representativeStartDate: string | null
  excludeReason: NewDistrictExcludeReason | null
}

/**
 * 신규지구 판정 기준일 — 대표 계약이 속한 그룹 멤버의 최초 시작일이다.
 * projects.construction_start_date는 대표 미지정·동기화 누락으로 틀릴 수 있어 쓰지 않는다.
 */
export function resolveRepresentativeStartDate(
  project: NewDistrictProjectInput,
  contracts: ConsultingContractRow[]
): RepresentativeStartDate {
  const projectRows = contracts.filter((row) => row.project_id === project.id)
  const representativeId = resolveRepresentativeContractId(project, projectRows)
  const representativeRow = representativeId
    ? projectRows.find((row) => row.id === representativeId)
    : undefined

  if (!representativeRow) {
    return { representativeStartDate: null, excludeReason: 'no_representative' }
  }

  const groupKeyOf = (row: ConsultingContractRow) =>
    nameGroupKey(row.contract_type, row.cntrct_nm, isThtmPartial(row.tot_cntrct_amt, row.thtm_cntrct_amt))
  const groupKey = groupKeyOf(representativeRow)
  const starts = projectRows
    .filter((row) => groupKeyOf(row) === groupKey)
    .map((row) => row.start_date)
    .filter((value): value is string => Boolean(value))

  if (starts.length === 0) {
    return { representativeStartDate: null, excludeReason: 'no_start_date' }
  }

  return {
    representativeStartDate: starts.reduce((earliest, value) => (value < earliest ? value : earliest)),
    excludeReason: null,
  }
}

/**
 * 선택 연도의 신규지구 코호트를 만든다.
 * 대표 시작일 연도가 맞는 프로젝트와, 대표를 해석하지 못해 판정 자체가 불가능한 프로젝트를 남긴다.
 */
export function resolveNewDistrictCohort(
  projects: NewDistrictProjectInput[],
  contracts: ConsultingContractRow[],
  year: number,
  months: number
): NewDistrictCohort {
  const normalizedMonths = clampConsultingMonths(months)
  const yearText = String(year)
  const entries: NewDistrictCohortEntry[] = []

  for (const project of projects) {
    const { representativeStartDate, excludeReason } = resolveRepresentativeStartDate(project, contracts)

    if (!representativeStartDate) {
      // 판정 근거가 없으므로 코호트에서 조용히 빼지 않고 제외 사실을 남긴다.
      entries.push({
        project,
        representativeStartDate: null,
        deadlineDate: null,
        excluded: true,
        excludeReason,
      })
      continue
    }

    if (representativeStartDate.slice(0, 4) !== yearText) continue

    entries.push({
      project,
      representativeStartDate,
      deadlineDate: addMonthsToDateText(representativeStartDate, normalizedMonths),
      excluded: false,
      excludeReason: null,
    })
  }

  const targets = entries.filter((entry) => !entry.excluded)
  const startDates = targets
    .map((entry) => entry.representativeStartDate)
    .filter((value): value is string => Boolean(value))
  const deadlineDates = targets
    .map((entry) => entry.deadlineDate)
    .filter((value): value is string => Boolean(value))

  return {
    year,
    months: normalizedMonths,
    entries,
    minStartDate: startDates.length
      ? startDates.reduce((earliest, value) => (value < earliest ? value : earliest))
      : null,
    maxDeadlineDate: deadlineDates.length
      ? deadlineDates.reduce((latest, value) => (value > latest ? value : latest))
      : null,
  }
}

function emptySubtotal(): NewDistrictSubtotal {
  return { districtCount: 0, inspectedDistrictCount: 0, inspectionCount: 0, excludedCount: 0, rate: 0 }
}

function withRate(subtotal: NewDistrictSubtotal): NewDistrictSubtotal {
  return {
    ...subtotal,
    rate: subtotal.districtCount > 0 ? subtotal.inspectedDistrictCount / subtotal.districtCount : 0,
  }
}

/** 프로젝트 행들의 소계. 제외 행은 분모·분자에서 빼고 별도로 센다. */
function subtotalOfRows(rows: NewDistrictProjectRow[]): NewDistrictSubtotal {
  const summed = rows.reduce<NewDistrictSubtotal>((acc, row) => {
    if (row.excluded) return { ...acc, excludedCount: acc.excludedCount + 1 }
    return {
      ...acc,
      districtCount: acc.districtCount + 1,
      inspectedDistrictCount: acc.inspectedDistrictCount + (row.inspected ? 1 : 0),
      inspectionCount: acc.inspectionCount + row.inspectionCount,
    }
  }, emptySubtotal())

  return withRate(summed)
}

/** 하위 소계를 원수로 합치고 실시율을 다시 계산한다. 율의 평균을 쓰지 않는다. */
function sumSubtotals(subtotals: NewDistrictSubtotal[]): NewDistrictSubtotal {
  const summed = subtotals.reduce<NewDistrictSubtotal>(
    (acc, item) => ({
      districtCount: acc.districtCount + item.districtCount,
      inspectedDistrictCount: acc.inspectedDistrictCount + item.inspectedDistrictCount,
      inspectionCount: acc.inspectionCount + item.inspectionCount,
      excludedCount: acc.excludedCount + item.excludedCount,
      rate: 0,
    }),
    emptySubtotal()
  )

  return withRate(summed)
}

function hqOrder(hq: string): number {
  const index = (HEADQUARTERS_OPTIONS as readonly string[]).indexOf(hq)
  return index === -1 ? HEADQUARTERS_OPTIONS.length : index
}

function compareHq(left: string, right: string): number {
  const orderDiff = hqOrder(left) - hqOrder(right)
  if (orderDiff !== 0) return orderDiff
  return left.localeCompare(right, 'ko')
}

/** 지사 순서는 본부마다 다르므로 소속 본부의 BRANCH_OPTIONS 배열에서 자리를 찾는다. */
function branchOrder(hq: string, branch: string): number {
  const options = BRANCH_OPTIONS[hq] ?? []
  const index = options.indexOf(branch)
  return index === -1 ? options.length : index
}

function compareBranch(hq: string, left: string, right: string): number {
  const orderDiff = branchOrder(hq, left) - branchOrder(hq, right)
  if (orderDiff !== 0) return orderDiff
  return left.localeCompare(right, 'ko')
}

function compareRows(left: NewDistrictProjectRow, right: NewDistrictProjectRow): number {
  // 대표 시작일을 못 구한 제외 행은 뒤로 보낸다.
  const leftStart = left.representativeStartDate ?? '9999-12-31'
  const rightStart = right.representativeStartDate ?? '9999-12-31'
  if (leftStart !== rightStart) return leftStart < rightStart ? -1 : 1

  const nameDiff = left.projectName.localeCompare(right.projectName, 'ko')
  if (nameDiff !== 0) return nameDiff
  return left.projectId.localeCompare(right.projectId)
}

/** 코호트와 점검 행으로 본부→지사→프로젝트 계층 집계를 만든다. */
export function aggregateNewDistrictConsulting(
  cohort: NewDistrictCohort,
  inspections: ConsultingInspectionRow[]
): NewDistrictConsultingResult {
  const datesByProject = new Map<string, string[]>()
  for (const inspection of inspections) {
    const dates = datesByProject.get(inspection.project_id)
    if (dates) dates.push(inspection.inspection_date)
    else datesByProject.set(inspection.project_id, [inspection.inspection_date])
  }

  const rows: NewDistrictProjectRow[] = cohort.entries.map((entry) => {
    const { project, representativeStartDate, deadlineDate } = entry
    const inRange =
      entry.excluded || !representativeStartDate || !deadlineDate
        ? []
        : (datesByProject.get(project.id) ?? [])
            .filter((date) => date >= representativeStartDate && date <= deadlineDate)
            // 같은 날 2건도 건수 원천이므로 중복을 지우지 않는다.
            .sort()

    return {
      projectId: project.id,
      projectName: project.project_name,
      managingHq: project.managing_hq,
      managingBranch: project.managing_branch,
      representativeStartDate,
      deadlineDate,
      inspectionDates: inRange,
      inspectionCount: inRange.length,
      inspected: inRange.length > 0,
      excluded: entry.excluded,
      excludeReason: entry.excludeReason,
    }
  })

  const byHq = new Map<string, Map<string, NewDistrictProjectRow[]>>()
  for (const row of rows) {
    const branches = byHq.get(row.managingHq) ?? new Map<string, NewDistrictProjectRow[]>()
    const branchRows = branches.get(row.managingBranch) ?? []
    branchRows.push(row)
    branches.set(row.managingBranch, branchRows)
    byHq.set(row.managingHq, branches)
  }

  const hqs: NewDistrictHqGroup[] = [...byHq.entries()]
    .sort(([left], [right]) => compareHq(left, right))
    .map(([hq, branchMap]) => {
      const branches: NewDistrictBranchGroup[] = [...branchMap.entries()]
        .sort(([left], [right]) => compareBranch(hq, left, right))
        .map(([branch, branchRows]) => {
          const sorted = [...branchRows].sort(compareRows)
          return { branch, subtotal: subtotalOfRows(sorted), projects: sorted }
        })

      return { hq, subtotal: sumSubtotals(branches.map((branch) => branch.subtotal)), branches }
    })

  return {
    year: cohort.year,
    months: cohort.months,
    hqs,
    total: sumSubtotals(hqs.map((hq) => hq.subtotal)),
  }
}

/** 코호트 판정과 집계를 한 번에 수행한다. 조회 계층 없이 순수 입력만 쓴다. */
export function buildNewDistrictConsulting(
  projects: NewDistrictProjectInput[],
  contracts: ConsultingContractRow[],
  inspections: ConsultingInspectionRow[],
  year: number,
  months: number
): NewDistrictConsultingResult {
  return aggregateNewDistrictConsulting(resolveNewDistrictCohort(projects, contracts, year, months), inspections)
}
