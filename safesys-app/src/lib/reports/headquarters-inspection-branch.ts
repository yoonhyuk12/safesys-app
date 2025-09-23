import { type Project, type HeadquartersInspection } from '@/lib/projects'

type DownloadBranchReportsParams = {
  projects: Project[]
  inspections: HeadquartersInspection[]
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

export async function downloadBranchHeadquartersReports(params: DownloadBranchReportsParams): Promise<void> {
  const { projects, inspections, selectedProjectIds, selectedQuarter, selectedHq, selectedSafetyBranch } = params

  const { generateHeadquartersInspectionReportBulk } = await import('@/lib/reports/headquarters-inspection')

  // 지사 내 프로젝트만 선별
  const branchProjects = projects.filter((p) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
  const targetProjects = selectedProjectIds.length > 0
    ? branchProjects.filter((p) => selectedProjectIds.includes(p.id))
    : branchProjects

  const groups = targetProjects.map((p) => {
    const ins = inspections.filter((i) => i.project_id === p.id && isInQuarter(i.inspection_date, selectedQuarter))
    return { projectName: p.project_name || 'project', inspections: ins, branchName: p.managing_branch }
  }).filter((g) => g.inspections.length > 0)

  if (groups.length === 0) {
    throw new Error('선택한 조건에 해당하는 점검 결과가 없습니다.')
  }

  await generateHeadquartersInspectionReportBulk(groups)
}


