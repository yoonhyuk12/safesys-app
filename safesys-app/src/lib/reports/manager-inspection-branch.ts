import { type Project, type ManagerInspection } from '@/lib/projects'

type DownloadBranchManagerReportsParams = {
  projects: Project[]
  inspections: ManagerInspection[]
  selectedProjectIds: string[]
  selectedQuarter: string // e.g., 2025Q3
  selectedHq?: string
  selectedSafetyBranch: string
}

function isInQuarter(dateStr?: string, quarterYear?: string): boolean {
  if (!dateStr || !quarterYear) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const [yearStr, qStr] = quarterYear.split('Q')
  const year = parseInt(yearStr, 10)
  const q = parseInt(qStr, 10)
  if (!year || !q) return true
  const startMonth = (q - 1) * 3 // 0-indexed
  const start = new Date(year, startMonth, 1)
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)
  return d >= start && d <= end
}

export async function downloadBranchManagerReports(params: DownloadBranchManagerReportsParams): Promise<void> {
  const { projects, inspections, selectedProjectIds, selectedQuarter, selectedHq, selectedSafetyBranch } = params

  const { generateManagerInspectionBulkReport } = await import('@/lib/reports/manager-inspection-report')

  // 지사 내 프로젝트만 선별
  const branchProjects = projects.filter((p) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
  const targetProjects = selectedProjectIds.length > 0
    ? branchProjects.filter((p) => selectedProjectIds.includes(p.id))
    : branchProjects

  const projectInspections = targetProjects.map((p) => {
    const ins = inspections.filter((i) => i.project_id === p.id && isInQuarter(i.inspection_date, selectedQuarter))
    return { project: p, inspections: ins }
  }).filter((pi) => pi.inspections.length > 0)

  if (projectInspections.length === 0) {
    throw new Error('선택한 조건에 해당하는 점검 결과가 없습니다.')
  }

  // 파일명 생성
  const filename = `${selectedSafetyBranch}_관리자점검표_${selectedQuarter}_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '')}.pdf`

  await generateManagerInspectionBulkReport({
    projectInspections,
    filename
  })
}