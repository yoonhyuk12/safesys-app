// 프로젝트별 안전관리 대상 여부를 DB에서 조회해 엑셀로 내보낸다
import * as XLSX from 'xlsx'
import type { LegalComplianceFormData } from '@/app/project/[id]/legal-compliance/lib/constants'
import { BRANCH_OPTIONS, HEADQUARTERS_OPTIONS } from '@/lib/constants'
import type { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'

interface SafeDocumentTargetRow {
  project_id: string
  inspection_date: string | null
  has_special_construction1: '예' | '아니오' | '' | null
}

type LegalComplianceTargetData = {
  overview?: Partial<Pick<LegalComplianceFormData['overview'], 'safetyPlanTarget'>> | null
  ownerBasic?: {
    designSafetyReview?: Partial<Pick<LegalComplianceFormData['ownerBasic']['designSafetyReview'], 'applicable'>> | null
  } | null
}

interface LegalComplianceTargetRow {
  project_id: string
  check_year: number
  check_quarter: number
  form_data: LegalComplianceTargetData | null
}

interface ProjectSafetyDbExcelRow {
  본부: string
  지사: string
  사업분류: string
  사업명: string
  총사업비: string
  당해년도사업비: string
  유해위험방지대상여부: string
  건진법안전관리비대상여부: string
  설계안전성검토대상여부: string
  공사감독직급: string
  공사감독이름: string
}

const PROJECT_SAFETY_DB_HEADERS: ReadonlyArray<keyof ProjectSafetyDbExcelRow> = [
  '본부',
  '지사',
  '사업분류',
  '사업명',
  '총사업비',
  '당해년도사업비',
  '유해위험방지대상여부',
  '건진법안전관리비대상여부',
  '설계안전성검토대상여부',
  '공사감독직급',
  '공사감독이름',
]

function compareProjects(a: Project, b: Project): number {
  const hqOrderA = HEADQUARTERS_OPTIONS.findIndex((hq) => hq === a.managing_hq)
  const hqOrderB = HEADQUARTERS_OPTIONS.findIndex((hq) => hq === b.managing_hq)

  if (hqOrderA !== hqOrderB) {
    if (hqOrderA === -1) return 1
    if (hqOrderB === -1) return -1
    return hqOrderA - hqOrderB
  }

  const branchOptions = BRANCH_OPTIONS[a.managing_hq] || []
  const branchOrderA = branchOptions.indexOf(a.managing_branch)
  const branchOrderB = branchOptions.indexOf(b.managing_branch)

  if (branchOrderA !== branchOrderB) {
    if (branchOrderA === -1 && branchOrderB === -1) {
      return a.managing_branch.localeCompare(b.managing_branch, 'ko-KR')
    }
    if (branchOrderA === -1) return 1
    if (branchOrderB === -1) return -1
    return branchOrderA - branchOrderB
  }

  const displayOrderA = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
  const displayOrderB = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
  if (displayOrderA !== displayOrderB) return displayOrderA - displayOrderB

  return a.project_name.localeCompare(b.project_name, 'ko-KR')
}

function buildHazardTargetMap(rows: SafeDocumentTargetRow[]): Map<string, string> {
  const targets = new Map<string, string>()
  const sortedRows = [...rows].sort((a, b) =>
    (b.inspection_date ?? '').localeCompare(a.inspection_date ?? '')
  )

  sortedRows.forEach((row) => {
    if (targets.has(row.project_id) || !row.has_special_construction1) return
    targets.set(row.project_id, row.has_special_construction1 === '예' ? 'O' : 'X')
  })

  return targets
}

function buildLegalTargetMaps(rows: LegalComplianceTargetRow[]): {
  safetyPlanTargets: Map<string, string>
  designSafetyReviewTargets: Map<string, string>
} {
  const safetyPlanTargets = new Map<string, string>()
  const designSafetyReviewTargets = new Map<string, string>()
  const sortedRows = [...rows].sort((a, b) =>
    b.check_year - a.check_year || b.check_quarter - a.check_quarter
  )

  sortedRows.forEach((row) => {
    const safetyPlanTarget = row.form_data?.overview?.safetyPlanTarget
    if (!safetyPlanTargets.has(row.project_id) && safetyPlanTarget) {
      safetyPlanTargets.set(row.project_id, safetyPlanTarget === '해당없음' ? 'X' : 'O')
    }

    const designSafetyReview = row.form_data?.ownerBasic?.designSafetyReview?.applicable
    if (!designSafetyReviewTargets.has(row.project_id) && designSafetyReview) {
      designSafetyReviewTargets.set(row.project_id, designSafetyReview === '여' ? 'O' : 'X')
    }
  })

  return { safetyPlanTargets, designSafetyReviewTargets }
}

export function buildProjectSafetyDbExcelRows(
  projects: Project[],
  safeDocumentRows: SafeDocumentTargetRow[],
  legalComplianceRows: LegalComplianceTargetRow[]
): ProjectSafetyDbExcelRow[] {
  const hazardTargets = buildHazardTargetMap(safeDocumentRows)
  const { safetyPlanTargets, designSafetyReviewTargets } = buildLegalTargetMaps(legalComplianceRows)

  return [...projects].sort(compareProjects).map((project) => ({
    본부: project.managing_hq || '',
    지사: project.managing_branch || '',
    사업분류: project.project_category || '',
    사업명: project.project_name || '',
    총사업비: project.total_budget || '',
    당해년도사업비: project.current_year_budget || '',
    유해위험방지대상여부: hazardTargets.get(project.id) || '',
    건진법안전관리비대상여부: safetyPlanTargets.get(project.id) || '',
    설계안전성검토대상여부: designSafetyReviewTargets.get(project.id) || '',
    공사감독직급: project.supervisor_position || '',
    공사감독이름: project.supervisor_name || '',
  }))
}

export async function downloadProjectSafetyDbExcel(projects: Project[]): Promise<void> {
  const projectIds = [...new Set(projects.map((project) => project.id))]
  let safeDocumentRows: SafeDocumentTargetRow[] = []
  let legalComplianceRows: LegalComplianceTargetRow[] = []

  if (projectIds.length > 0) {
    const [safeDocumentResult, legalComplianceResult] = await Promise.all([
      supabase
        .from('safe_document_inspections')
        .select('project_id, inspection_date, has_special_construction1')
        .in('project_id', projectIds),
      supabase
        .from('legal_compliance_checks')
        .select('project_id, check_year, check_quarter, form_data')
        .in('project_id', projectIds),
    ])

    if (safeDocumentResult.error) throw new Error('안전서류 점검 데이터를 불러오지 못했습니다.')
    if (legalComplianceResult.error) throw new Error('법적이행 점검 데이터를 불러오지 못했습니다.')

    safeDocumentRows = (safeDocumentResult.data ?? []) as SafeDocumentTargetRow[]
    legalComplianceRows = (legalComplianceResult.data ?? []) as LegalComplianceTargetRow[]
  }

  const worksheet = XLSX.utils.json_to_sheet(
    buildProjectSafetyDbExcelRows(projects, safeDocumentRows, legalComplianceRows),
    { header: [...PROJECT_SAFETY_DB_HEADERS] }
  )
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 20 },
    { wch: 32 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
    { wch: 24 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'DB')

  const today = new Date()
  const dateString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  XLSX.writeFile(workbook, `프로젝트DB_${dateString}.xlsx`)
}
