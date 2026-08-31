// 프로젝트 사고 이력과 안전점검을 조회·정규화하는 데이터 모듈
import { supabase } from '@/lib/supabase'
import {
  ACCIDENT_COMP_CLAIM_OPTIONS,
  ACCIDENT_SEVERITY_OPTIONS,
  type AccidentAnalysisDataResponse,
  type AccidentFormInput,
  type AccidentMutationResult,
  type AccidentSeverity,
  type AccidentValidationResult,
  type NormalizedFinding,
  type NormalizedSafetyInspection,
  type ProjectAccident,
  type WorkersCompClaim,
} from '@/lib/accident-analysis-types'
import { resolveFindingCode } from '@/lib/finding-classification'
import {
  BATCH_SIZE,
  addCalendarDays,
  asArray,
  asRecord,
  compactSummary,
  firstText,
  isMeaningfulFindingText,
  parseCalendarDay,
  parseJsonValue,
  textValue,
  toInstantTimestamp,
  type UnknownRecord,
} from '@/lib/accident-analysis-utils'

export * from '@/lib/accident-analysis-types'
export { calculateAccidentAnalysis } from '@/lib/accident-analysis-calculation'

const SEVERITIES = new Set<AccidentSeverity>(ACCIDENT_SEVERITY_OPTIONS.map((option) => option.value))
const COMP_CLAIMS = new Set<WorkersCompClaim | ''>(ACCIDENT_COMP_CLAIM_OPTIONS.map((option) => option.value))

interface RawSafetyInspection extends UnknownRecord {
  id: string
  project_id: string
  inspection_date: string
  inspection_type?: string
  inspector_opinion?: string
  signatures?: unknown
  additional_items?: unknown
  safety_inspection_results?: unknown
}

interface RawManagerInspection extends UnknownRecord {
  id: string
  project_id: string
  inspection_date: string
  remarks?: string
  form_data?: unknown
  has_signature?: boolean
  risk_factors_json?: unknown
  disaster_prevention_risk_factors_json?: unknown
}

interface RawHeadquartersInspection extends UnknownRecord {
  id: string
  project_id: string
  inspection_date: string
  issue_content1?: string
  issue_content2?: string
  issue1_status?: string
  issue2_status?: string
  issue1_category_code?: string | null
  issue2_category_code?: string | null
  action_photo_issue1?: string
  action_photo_issue2?: string
  critical_items?: unknown
  caution_items?: unknown
  other_items?: unknown
  five_key_items?: unknown
}

const hasNonEmptyValue = (record: UnknownRecord, keys: string[]): boolean =>
  keys.some((key) => textValue(record[key]).length > 0)

/**
 * 저장 분류 코드를 우선하고, 없거나 무효면 원문 분류기로 fallback한다.
 * 확정 제외 문구(또는 저장 NULL + 제외 원문)는 null을 돌려 통계에서 뺀다.
 */
const toFinding = (id: string, text: string, storedCode?: unknown): NormalizedFinding | null => {
  const code = resolveFindingCode(text, storedCode)
  if (!code) return null
  return { id, text, code }
}

const isRegularFinding = (value: unknown): boolean => {
  const record = asRecord(value)
  if (!record) return false
  if (textValue(record.photo_url)) return true
  return isMeaningfulFindingText(record.findings)
}

const isSignedRegularInspection = (signaturesValue: unknown, inspectionType: string): boolean => {
  if (inspectionType === '특별점검(안전혁신건설-287)') return true
  const signatures = asArray(signaturesValue).map(asRecord).filter((value): value is UnknownRecord => value !== null)
  const required = signatures.filter((signature) =>
    hasNonEmptyValue(signature, ['name', 'position', 'dataUrl', 'data_url', 'signature'])
  )
  if (required.length === 0) return false
  return required.every((signature) => hasNonEmptyValue(signature, ['dataUrl', 'data_url', 'signature']))
}

const normalizeSafetyInspection = (row: RawSafetyInspection): NormalizedSafetyInspection => {
  const inspectionType = textValue(row.inspection_type)
  const results = asArray(row.safety_inspection_results)
  const realResults = results.filter(isRegularFinding)
  const unresolvedResults = realResults.filter((value) => {
    const record = asRecord(value)
    return record !== null && !textValue(record.after_photo_url)
  })
  const additionalItems = asArray(row.additional_items).map(asRecord).filter((value): value is UnknownRecord => value !== null)
  const realAdditionalItems = additionalItems.filter((item) => isMeaningfulFindingText(item.action))
  const specialUnresolved = inspectionType === '특별점검(안전혁신건설-287)'
    ? realAdditionalItems.filter((item) => {
        const afterPhoto = textValue(item.after_photo_url)
        return !afterPhoto || afterPhoto === 'N/A'
      }).length
    : 0

  const resultTexts = realResults.map((value) => {
    const result = asRecord(value)
    if (!result) return { finding: '', field: '', storedCode: null as unknown }
    return {
      finding: textValue(result.findings),
      field: textValue(result.field_item),
      storedCode: result.finding_category_code,
    }
  })
  const additionalTexts = realAdditionalItems.map((item) => ({
    title: firstText(item.item, item.title, item.category),
    action: textValue(item.action),
  }))

  const resultSummaries = resultTexts.map(({ finding, field }) =>
    field && finding ? `${field}: ${finding}` : finding || field,
  )
  const additionalSummaries = additionalTexts.map(({ title, action }) =>
    title && action ? `${title}: ${action}` : action || title,
  )

  // 분류 코퍼스: 정기 safety_inspection_results(사진 지적 입력란)만 전개한다 — 보고서 권장 1차 지표.
  // finding_category_code가 F01~F20이면 우선 사용하고, NULL/미적용은 원문 분류 fallback.
  // additional_items는 summary·finding_count·unresolved_count에는 그대로 유지하되 분류에서는 제외한다.
  const findings: NormalizedFinding[] = resultTexts
    .map(({ finding, field, storedCode }, index) =>
      toFinding(`${row.id}:sir:${index}`, finding || field, storedCode),
    )
    .filter((finding): finding is NormalizedFinding => finding !== null)

  return {
    id: row.id,
    project_id: row.project_id,
    source_type: 'safety',
    source_label: inspectionType ? `정기안전점검 · ${inspectionType}` : '정기안전점검',
    inspected_at: row.inspection_date,
    summary: compactSummary([
      textValue(row.inspector_opinion),
      ...resultSummaries,
      ...additionalSummaries,
    ]),
    signed: isSignedRegularInspection(row.signatures, inspectionType),
    finding_count: realResults.length + realAdditionalItems.length,
    unresolved_count: unresolvedResults.length + specialUnresolved,
    findings,
  }
}

const getManagerFactors = (row: RawManagerInspection): UnknownRecord[] => {
  const formData = asRecord(parseJsonValue(row.form_data))
  const primary = asArray(row.risk_factors_json)
  const disaster = asArray(row.disaster_prevention_risk_factors_json)
  const fallbackPrimary = primary.length === 0
    ? asArray(formData?.risk_factors_json ?? formData?.risk_factors)
    : []
  const fallbackDisaster = disaster.length === 0
    ? asArray(formData?.disaster_prevention_risk_factors_json ?? formData?.disaster_prevention_risk_factors)
    : []

  return [...primary, ...disaster, ...fallbackPrimary, ...fallbackDisaster]
    .map(asRecord)
    .filter((value): value is UnknownRecord => value !== null)
}

const isManagerFactor = (factor: UnknownRecord): boolean => [
  factor.risk_factor,
  factor.hazard,
  factor.details,
  factor.reduction_measure,
  factor.remarks,
].some(isMeaningfulFindingText)

const isManagerFactorUnresolved = (factor: UnknownRecord): boolean => {
  if (factor.implementation === false || factor.completed === false) return true
  const implementation = firstText(factor.implementation, factor.status, factor.completed).toLowerCase()
  return ['no', 'false', '부', '미이행', '불이행', 'pending', 'in_progress'].includes(implementation)
}

const normalizeManagerInspection = (
  row: RawManagerInspection,
  signedIds: Set<string>
): NormalizedSafetyInspection => {
  const factors = getManagerFactors(row).filter(isManagerFactor)
  const factorSummaries = factors.map((factor) => {
    const work = firstText(factor.detail_work, factor.work)
    const risk = firstText(factor.risk_factor, factor.hazard)
    const measure = firstText(factor.details, factor.reduction_measure, factor.remarks)
    return [work, risk, measure].filter(Boolean).join(': ')
  })
  const remarks = textValue(row.remarks)

  return {
    id: row.id,
    project_id: row.project_id,
    source_type: 'manager',
    source_label: '관리자점검',
    inspected_at: row.inspection_date,
    summary: compactSummary([
      remarks === '서명X' || remarks === '일괄서명완료' ? '' : remarks,
      ...factorSummaries,
    ]),
    signed: row.has_signature === true || signedIds.has(row.id),
    finding_count: factors.length,
    unresolved_count: factors.filter(isManagerFactorUnresolved).length,
    // 관리자점검은 지적 분류 집계에서 제외하므로 개별 지적을 전개하지 않는다.
    findings: [],
  }
}

const getHeadquartersItems = (row: RawHeadquartersInspection): UnknownRecord[] => [
  ...asArray(row.critical_items),
  ...asArray(row.caution_items),
  ...asArray(row.other_items),
  ...asArray(row.five_key_items),
].map(asRecord).filter((value): value is UnknownRecord => value !== null)

const isHeadquartersItemFinding = (item: UnknownRecord): boolean => {
  const status = firstText(item.status, item.result).toLowerCase()
  const grade = textValue(item.grade)
  if (['bad', 'no', 'false', '부', '미이행', '불이행'].includes(status)) return true
  if (grade === '4' || grade === '5') return true
  return isMeaningfulFindingText(firstText(item.remarks, item.findings, item.issue_content))
}

const isHeadquartersItemUnresolved = (item: UnknownRecord): boolean => {
  const status = firstText(item.status, item.result, item.action_status).toLowerCase()
  const grade = textValue(item.grade)
  if (['bad', 'no', 'false', '부', '미이행', '불이행', 'pending', 'in_progress'].includes(status)) return true
  if (grade === '4' || grade === '5') return true
  return false
}

const normalizeHeadquartersInspection = (
  row: RawHeadquartersInspection,
  signedIds: Set<string>
): NormalizedSafetyInspection => {
  const issues = [
    {
      content: textValue(row.issue_content1),
      status: textValue(row.issue1_status),
      actionPhoto: textValue(row.action_photo_issue1),
      storedCode: row.issue1_category_code,
    },
    {
      content: textValue(row.issue_content2),
      status: textValue(row.issue2_status),
      actionPhoto: textValue(row.action_photo_issue2),
      storedCode: row.issue2_category_code,
    },
  ].filter((issue) => isMeaningfulFindingText(issue.content))
  const itemFindings = getHeadquartersItems(row).filter(isHeadquartersItemFinding)
  const itemTexts = itemFindings.map((item) => ({
    title: firstText(item.title, item.item, item.category),
    finding: firstText(item.remarks, item.findings, item.issue_content),
  }))
  const itemSummaries = itemTexts.map(({ title, finding }) =>
    title && finding ? `${title}: ${finding}` : finding || title,
  )

  // 분류 코퍼스: 본부 issue_content1/2(사진 지적 입력란)만 전개한다 — 보고서 권장 1차 지표.
  // issue1/2_category_code가 F01~F20이면 우선 사용하고, NULL/미적용은 원문 분류 fallback.
  // 체크리스트 부적합 항목(critical/caution/other/five_key)은 summary·finding_count·unresolved_count에는 유지하되 분류에서는 제외한다.
  const findings: NormalizedFinding[] = issues
    .map((issue, index) => toFinding(`${row.id}:hqiss:${index}`, issue.content, issue.storedCode))
    .filter((finding): finding is NormalizedFinding => finding !== null)

  return {
    id: row.id,
    project_id: row.project_id,
    source_type: 'headquarters',
    source_label: '본부불시점검',
    inspected_at: row.inspection_date,
    summary: compactSummary([...issues.map((issue) => issue.content), ...itemSummaries]),
    signed: signedIds.has(row.id),
    finding_count: issues.length + itemFindings.length,
    unresolved_count:
      issues.filter((issue) => issue.status !== 'completed' && !issue.actionPhoto).length +
      itemFindings.filter(isHeadquartersItemUnresolved).length,
    findings,
  }
}

const fetchRowsInBatches = async (
  projectIds: string[],
  fetchBatch: (batchIds: string[]) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>,
  errorLabel: string
): Promise<unknown[]> => {
  const rows: unknown[] = []
  for (let index = 0; index < projectIds.length; index += BATCH_SIZE) {
    const batchIds = projectIds.slice(index, index + BATCH_SIZE)
    const { data, error } = await fetchBatch(batchIds)
    if (error) {
      console.error(`${errorLabel} 조회 오류:`, error)
      throw new Error(`${errorLabel} 데이터를 불러오지 못했습니다.`)
    }
    rows.push(...(data || []))
  }
  return rows
}

const fetchSignedIds = async (
  table: 'manager_inspections' | 'headquarters_inspections',
  projectIds: string[],
  startDate: string,
  endDate: string,
  errorLabel: string
): Promise<Set<string>> => {
  const rows = await fetchRowsInBatches(
    projectIds,
    (batchIds) => (supabase as any)
      .from(table)
      .select('id')
      .in('project_id', batchIds)
      .gte('inspection_date', startDate)
      .lte('inspection_date', endDate)
      .not('signature', 'is', null)
      .neq('signature', ''),
    errorLabel
  )
  return new Set(rows.map(asRecord).filter((row): row is UnknownRecord => row !== null).map((row) => textValue(row.id)).filter(Boolean))
}

export async function getAccidentAnalysisData(
  projectIds: string[],
  startDate: string,
  endDate: string
): Promise<AccidentAnalysisDataResponse> {
  const startTimestamp = parseCalendarDay(startDate)
  const endTimestamp = parseCalendarDay(endDate)
  if (startTimestamp === null || endTimestamp === null || startTimestamp > endTimestamp) {
    return { success: false, accidents: [], inspections: [], error: '조회 기간이 올바르지 않습니다.' }
  }

  const scopedProjectIds = Array.from(new Set(projectIds.map((id) => id.trim()).filter(Boolean)))
  const inspectionStartDate = addCalendarDays(startDate, -90)
  const accidentEndExclusive = addCalendarDays(endDate, 1)

  // 미등록 현장 사고는 project_id가 없어 배치 조회에 포함되지 않으므로 별도 조회한다. RLS가 관할을 제한한다.
  const fetchExternalAccidents = async (): Promise<ProjectAccident[]> => {
    const { data, error } = await (supabase as any)
      .from('project_accidents')
      .select('*')
      .is('project_id', null)
      .gte('accident_at', `${startDate}T00:00:00+09:00`)
      .lt('accident_at', `${accidentEndExclusive}T00:00:00+09:00`)
      .order('accident_at', { ascending: false })
    if (error) {
      console.error('미등록 현장 사고 이력 조회 오류:', error)
      throw new Error('미등록 현장 사고 이력을 불러오지 못했습니다.')
    }
    return (data ?? []) as ProjectAccident[]
  }

  if (scopedProjectIds.length === 0) {
    try {
      const externalAccidents = await fetchExternalAccidents()
      return { success: true, accidents: externalAccidents, inspections: [] }
    } catch (error) {
      console.error('미등록 현장 사고 이력 조회 실패:', error)
      return {
        success: false,
        accidents: [],
        inspections: [],
        error: error instanceof Error ? error.message : '미등록 현장 사고 이력을 불러오지 못했습니다.',
      }
    }
  }

  try {
    const accidentRowsPromise = fetchRowsInBatches(
      scopedProjectIds,
      (batchIds) => (supabase as any)
        .from('project_accidents')
        .select('*')
        .in('project_id', batchIds)
        .gte('accident_at', `${startDate}T00:00:00+09:00`)
        .lt('accident_at', `${accidentEndExclusive}T00:00:00+09:00`)
        .order('accident_at', { ascending: false }),
      '사고 이력'
    )

    const externalAccidentRowsPromise = fetchExternalAccidents()

    const safetyRowsPromise = fetchRowsInBatches(
      scopedProjectIds,
      (batchIds) => (supabase as any)
        .from('safety_inspections')
        .select(`
          id,
          project_id,
          inspection_date,
          inspection_type,
          inspector_opinion,
          signatures,
          additional_items,
          safety_inspection_results (field_item, findings, action_items, photo_url, after_photo_url, finding_category_code)
        `)
        .in('project_id', batchIds)
        .gte('inspection_date', inspectionStartDate)
        .lte('inspection_date', endDate),
      '정기안전점검'
    )

    const managerRowsPromise = fetchRowsInBatches(
      scopedProjectIds,
      (batchIds) => (supabase as any)
        .from('manager_inspections')
        .select('id, project_id, inspection_date, remarks, form_data, has_signature, risk_factors_json, disaster_prevention_risk_factors_json')
        .in('project_id', batchIds)
        .gte('inspection_date', inspectionStartDate)
        .lte('inspection_date', endDate),
      '관리자점검'
    )

    const headquartersRowsPromise = fetchRowsInBatches(
      scopedProjectIds,
      (batchIds) => (supabase as any)
        .from('headquarters_inspections')
        .select(`
          id,
          project_id,
          inspection_date,
          issue_content1,
          issue_content2,
          issue1_status,
          issue2_status,
          issue1_category_code,
          issue2_category_code,
          action_photo_issue1,
          action_photo_issue2,
          critical_items,
          caution_items,
          other_items,
          five_key_items
        `)
        .in('project_id', batchIds)
        .gte('inspection_date', inspectionStartDate)
        .lte('inspection_date', endDate),
      '본부불시점검'
    )

    const managerSignedIdsPromise = fetchSignedIds(
      'manager_inspections', scopedProjectIds, inspectionStartDate, endDate, '관리자점검 서명'
    )
    const headquartersSignedIdsPromise = fetchSignedIds(
      'headquarters_inspections', scopedProjectIds, inspectionStartDate, endDate, '본부불시점검 서명'
    )
    const [
      accidentRows,
      externalAccidentRows,
      safetyRows,
      managerRows,
      headquartersRows,
      managerSignedIds,
      headquartersSignedIds,
    ] = await Promise.all([
      accidentRowsPromise,
      externalAccidentRowsPromise,
      safetyRowsPromise,
      managerRowsPromise,
      headquartersRowsPromise,
      managerSignedIdsPromise,
      headquartersSignedIdsPromise,
    ])

    const accidents = [
      ...accidentRows
        .map(asRecord)
        .filter((row): row is UnknownRecord => row !== null)
        .map((row) => row as unknown as ProjectAccident),
      ...externalAccidentRows,
    ].sort((left, right) =>
      (toInstantTimestamp(right.accident_at) ?? 0) - (toInstantTimestamp(left.accident_at) ?? 0)
    )
    const inspections = [
      ...safetyRows
        .map(asRecord)
        .filter((row): row is UnknownRecord => row !== null)
        .map((row) => normalizeSafetyInspection(row as RawSafetyInspection)),
      ...managerRows
        .map(asRecord)
        .filter((row): row is UnknownRecord => row !== null)
        .map((row) => normalizeManagerInspection(row as RawManagerInspection, managerSignedIds)),
      ...headquartersRows
        .map(asRecord)
        .filter((row): row is UnknownRecord => row !== null)
        .map((row) => normalizeHeadquartersInspection(row as RawHeadquartersInspection, headquartersSignedIds)),
    ].sort((left, right) => right.inspected_at.localeCompare(left.inspected_at))

    return { success: true, accidents, inspections }
  } catch (error) {
    const message = error instanceof Error ? error.message : '사고 통계 분석 데이터를 불러오지 못했습니다.'
    return { success: false, accidents: [], inspections: [], error: message }
  }
}

const requiredTextFields: ReadonlyArray<{ key: keyof AccidentFormInput; label: string }> = [
  { key: 'accident_at', label: '사고일자' },
  { key: 'accident_type', label: '사고 유형' },
  { key: 'location', label: '발생 장소' },
  { key: 'work_description', label: '당시 작업 내용' },
  { key: 'description', label: '사고 개요' },
  { key: 'cause', label: '사고 원인' },
  { key: 'prevention_action', label: '재발 방지 조치' },
]

export function validateAccidentInput(input: AccidentFormInput): AccidentValidationResult {
  const errors: Partial<Record<keyof AccidentFormInput, string>> = {}

  for (const { key, label } of requiredTextFields) {
    if (typeof input[key] !== 'string' || textValue(input[key]).length === 0) {
      errors[key] = `${label}을(를) 입력해 주세요.`
    }
  }

  const projectId = textValue(input.project_id)
  const externalName = textValue(input.external_project_name)
  if (!projectId && !externalName) {
    errors.project_id = '프로젝트를 선택하거나 미등록 현장명을 직접 입력해 주세요.'
    errors.external_project_name = '프로젝트를 선택하거나 미등록 현장명을 직접 입력해 주세요.'
  }
  if (projectId && externalName) {
    errors.external_project_name = '등록 프로젝트와 직접입력을 동시에 지정할 수 없습니다.'
  }
  if (!projectId && externalName) {
    if (!textValue(input.external_managing_hq)) {
      errors.external_managing_hq = '미등록 현장의 관할 본부를 선택해 주세요.'
    }
    if (!textValue(input.external_managing_branch)) {
      errors.external_managing_branch = '미등록 현장의 관할 지사를 선택해 주세요.'
    }
  }

  if (textValue(input.accident_at) && toInstantTimestamp(input.accident_at) === null) {
    errors.accident_at = '사고일자가 올바르지 않습니다.'
  }
  if (!SEVERITIES.has(input.severity)) {
    errors.severity = '사고 중대도를 선택해 주세요.'
  }
  if (!COMP_CLAIMS.has(input.workers_comp_claim)) {
    errors.workers_comp_claim = '산재신청 여부를 선택해 주세요.'
  }

  const numericFields: ReadonlyArray<{ key: 'injured_count' | 'fatal_count' | 'lost_workdays'; label: string }> = [
    { key: 'injured_count', label: '부상자 수' },
    { key: 'fatal_count', label: '사망자 수' },
    { key: 'lost_workdays', label: '휴업 일수' },
  ]
  for (const { key, label } of numericFields) {
    const value = input[key]
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      errors[key] = `${label}은(는) 0 이상의 정수로 입력해 주세요.`
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

const normalizeAccidentAt = (value: string): string => {
  const trimmed = value.trim()
  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return trimmed
  return trimmed.length === 10 ? `${trimmed}T00:00:00+09:00` : `${trimmed}+09:00`
}

const normalizeAccidentInput = (input: AccidentFormInput): AccidentFormInput => {
  const projectId = input.project_id.trim()
  const externalName = input.external_project_name.trim()
  const isExternal = !projectId && externalName.length > 0
  return {
    project_id: isExternal ? '' : projectId,
    external_project_name: isExternal ? externalName : '',
    external_managing_hq: isExternal ? input.external_managing_hq.trim() : '',
    external_managing_branch: isExternal ? input.external_managing_branch.trim() : '',
    accident_at: normalizeAccidentAt(input.accident_at),
    severity: input.severity,
    accident_type: input.accident_type.trim(),
    location: input.location.trim(),
    work_description: input.work_description.trim(),
    description: input.description.trim(),
    cause: input.cause.trim(),
    prevention_action: input.prevention_action.trim(),
    injured_count: input.injured_count,
    fatal_count: input.fatal_count,
    lost_workdays: input.lost_workdays,
    workers_comp_claim: input.workers_comp_claim,
  }
}

/** DB insert/update용 페이로드. 미등록 현장은 project_id null + external 필드를 쓴다. */
const toAccidentDbPayload = (input: AccidentFormInput) => {
  const normalized = normalizeAccidentInput(input)
  const isExternal = !normalized.project_id && normalized.external_project_name.length > 0
  return {
    project_id: isExternal ? null : normalized.project_id,
    external_project_name: isExternal ? normalized.external_project_name : null,
    external_managing_hq: isExternal ? normalized.external_managing_hq : null,
    external_managing_branch: isExternal ? normalized.external_managing_branch : null,
    accident_at: normalized.accident_at,
    severity: normalized.severity,
    accident_type: normalized.accident_type,
    location: normalized.location,
    work_description: normalized.work_description,
    description: normalized.description,
    cause: normalized.cause,
    prevention_action: normalized.prevention_action,
    injured_count: normalized.injured_count,
    fatal_count: normalized.fatal_count,
    lost_workdays: normalized.lost_workdays,
    workers_comp_claim: normalized.workers_comp_claim || null,
  }
}

const firstValidationError = (validation: AccidentValidationResult): string =>
  Object.values(validation.errors).find((message): message is string => Boolean(message)) || '사고 입력값을 확인해 주세요.'

export async function createProjectAccident(
  input: AccidentFormInput,
  createdBy: string
): Promise<AccidentMutationResult> {
  const validation = validateAccidentInput(input)
  if (!validation.valid) return { success: false, error: firstValidationError(validation) }
  if (!createdBy.trim()) return { success: false, error: '사고 등록 사용자 정보를 확인하지 못했습니다.' }

  try {
    const payload = { ...toAccidentDbPayload(input), created_by: createdBy.trim() }
    const { data, error } = await (supabase as any)
      .from('project_accidents')
      .insert(payload)
      .select('*')
      .single()
    if (error) {
      console.error('사고 이력 등록 오류:', error)
      return { success: false, error: '사고 이력을 등록하지 못했습니다.' }
    }
    return { success: true, accident: data as ProjectAccident }
  } catch (error) {
    console.error('사고 이력 등록 실패:', error)
    return { success: false, error: '사고 이력을 등록하는 중 오류가 발생했습니다.' }
  }
}

export async function updateProjectAccident(
  id: string,
  input: AccidentFormInput
): Promise<AccidentMutationResult> {
  if (!id.trim()) return { success: false, error: '수정할 사고 이력을 확인하지 못했습니다.' }
  const validation = validateAccidentInput(input)
  if (!validation.valid) return { success: false, error: firstValidationError(validation) }

  try {
    const payload = toAccidentDbPayload(input)
    const { data, error } = await (supabase as any)
      .from('project_accidents')
      .update(payload)
      .eq('id', id.trim())
      .select('*')
      .single()
    if (error) {
      console.error('사고 이력 수정 오류:', error)
      return { success: false, error: '사고 이력을 수정하지 못했습니다.' }
    }
    return { success: true, accident: data as ProjectAccident }
  } catch (error) {
    console.error('사고 이력 수정 실패:', error)
    return { success: false, error: '사고 이력을 수정하는 중 오류가 발생했습니다.' }
  }
}

export async function deleteProjectAccident(id: string): Promise<AccidentMutationResult> {
  if (!id.trim()) return { success: false, error: '삭제할 사고 이력을 확인하지 못했습니다.' }

  try {
    const { data, error } = await (supabase as any)
      .from('project_accidents')
      .delete()
      .eq('id', id.trim())
      .select('id')
    if (error) {
      console.error('사고 이력 삭제 오류:', error)
      return { success: false, error: '사고 이력을 삭제하지 못했습니다.' }
    }
    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, error: '삭제 권한이 없거나 사고 이력을 찾을 수 없습니다.' }
    }
    return { success: true }
  } catch (error) {
    console.error('사고 이력 삭제 실패:', error)
    return { success: false, error: '사고 이력을 삭제하는 중 오류가 발생했습니다.' }
  }
}
