// 패트롤 점검 목록을 AI 작성 열(재발방지대책·재해유형)까지 채워 18열 엑셀로 내려받는다.
import ExcelJS from 'exceljs'

import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/projects'
import { headquartersFindingTypeLabel } from '@/lib/inspection/headquarters-finding-type'
import {
  PATROL_MAX_AI_ITEMS,
  buildPatrolIssueContent,
  getPatrolActionState,
  seoulToday,
} from '@/lib/patrol-inspections'
import type { PatrolInspection } from '@/lib/patrol-inspections'

/** 이 엑셀의 점검종류는 패트롤 점검으로 고정한다. */
const INSPECTION_KIND = '패트롤 점검'

/** 완료일 근거가 없을 때 쓰는 표기 — 날짜를 추측하지 않는다. */
const UNRECORDED_TEXT = '미기록'

const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } }
const allBorders: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }

const headerFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
}

// 헤더와 데이터 셀 모두 가운데·중앙 정렬에 줄바꿈을 유지한다.
const centeredAlignment: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
}

// 지연(7일 초과) 셀 음영
const overdueFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4E4' },
}

const COLUMNS = [
  { header: '순번', key: 'no', width: 6 },
  { header: '본부', key: 'hq', width: 14 },
  { header: '지사', key: 'branch', width: 14 },
  { header: '사업구분', key: 'category', width: 14 },
  { header: '사업명', key: 'projectName', width: 30 },
  { header: '총사업비(백만원)', key: 'totalBudget', width: 16 },
  { header: '시공사명', key: 'contractor', width: 18 },
  { header: '지적유형', key: 'findingType', width: 12 },
  { header: '지적일(점검일)', key: 'inspectionDate', width: 14 },
  { header: '지적내용', key: 'issueContent', width: 40 },
  { header: '조치내용(재발방지대책)(AI작성)', key: 'aiAction', width: 40 },
  { header: '재해유형(AI작성)', key: 'aiDisasterType', width: 14 },
  { header: '점검종류', key: 'inspectionKind', width: 14 },
  { header: '작업주소', key: 'workAddress', width: 30 },
  { header: '조치완료일', key: 'completedDate', width: 14 },
  { header: '공사감독', key: 'supervisor', width: 14 },
  { header: '확인자', key: 'inspector', width: 16 },
  { header: '비고', key: 'remarks', width: 16 },
]

// 음영을 칠할 열 번호(1부터)
const INSPECTION_DATE_COLUMN = COLUMNS.findIndex((column) => column.key === 'inspectionDate') + 1
const COMPLETED_DATE_COLUMN = COLUMNS.findIndex((column) => column.key === 'completedDate') + 1

export interface PatrolExcelProgress {
  (current: number, total: number): void
}

interface PatrolAiResult {
  action: string
  disasterType: string
}

/** 총사업비는 이미 백만원 단위 문자열이다. 숫자로 읽히면 숫자 셀로 넣어 정렬·합계를 쓸 수 있게 한다. */
function budgetCell(value: string | undefined): number | string {
  const text = (value ?? '').trim()
  if (!text) return ''
  const numeric = Number(text.replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : text
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 빈 문자열도 없는 값으로 보고 첫 번째로 값이 있는 후보를 고른다. */
function firstNonEmpty(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    const text = textOf(candidate)
    if (text) return text
  }
  return ''
}

/** 작업주소는 실제 작업주소를 우선하고, 없으면 현장주소에 상세주소를 붙여 채운다. */
function workAddressOf(inspection: PatrolInspection, project: Project | undefined): string {
  const actual = firstNonEmpty(inspection.actual_work_address, project?.actual_work_address)
  if (actual) return actual

  const site = firstNonEmpty(inspection.site_address, project?.site_address)
  if (!site) return ''

  const detail = textOf(project?.site_address_detail)
  return detail ? `${site} ${detail}` : site
}

/** 조회된 사업 정보를 우선 쓰고, 없으면 전달받은 프로젝트 목록에서 보완한다. */
function projectFieldsOf(inspection: PatrolInspection, projectMap: Map<string, Project>) {
  const project = projectMap.get(inspection.project_id)

  return {
    hq: firstNonEmpty(inspection.managing_hq, project?.managing_hq),
    branch: firstNonEmpty(inspection.managing_branch, project?.managing_branch),
    category: firstNonEmpty(inspection.project_category, project?.project_category),
    projectName: firstNonEmpty(inspection.project_name, project?.project_name),
    // total_budget은 이미 백만원 단위 값이므로 다시 나누지 않는다.
    totalBudget: budgetCell(firstNonEmpty(inspection.total_budget, project?.total_budget)),
    // 점검 조인에 시공사명이 비면 계약 상호, 그다음 현장 소속 회사명으로 채운다.
    contractor: firstNonEmpty(
      inspection.contractor_name,
      project?.g2b_corp_nm,
      project?.user_profiles?.company_name
    ),
    workAddress: workAddressOf(inspection, project),
    supervisor: firstNonEmpty(
      [
        firstNonEmpty(inspection.supervisor_position, project?.supervisor_position),
        firstNonEmpty(inspection.supervisor_name, project?.supervisor_name),
      ]
        .filter(Boolean)
        .join(' ')
    ),
  }
}

/** 라우트가 돌려준 오류 문구를 그대로 살려 사용자에게 재시도 근거를 남긴다. */
async function errorMessageOf(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    const message = textOf((payload as { error?: unknown })?.error)
    if (message) return message
  } catch {
    // 본문이 JSON이 아니면 상태 코드로만 안내한다.
  }
  if (response.status === 401) return '로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.'
  if (response.status === 403) return '조회 권한이 없는 점검이 포함되어 있습니다.'
  if (response.status === 429) return 'AI 작성 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
  return 'AI 작성에 실패했습니다. 잠시 후 다시 시도해 주세요.'
}

/**
 * 인증 토큰으로 AI 라우트를 배치 호출한다.
 * 사용자가 요청한 것은 AI 엑셀이므로 한 건이라도 채우지 못하면 즉시 실패시킨다.
 */
async function requestAiResults(
  inspections: PatrolInspection[],
  onProgress?: PatrolExcelProgress
): Promise<Map<string, PatrolAiResult>> {
  const results = new Map<string, PatrolAiResult>()

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) {
    throw new Error('로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.')
  }

  const batches = chunk(inspections, PATROL_MAX_AI_ITEMS)
  let processed = 0

  for (const batch of batches) {
    let response: Response
    try {
      response = await fetch('/api/ai/patrol-inspection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ inspectionIds: batch.map((item) => item.id) }),
      })
    } catch {
      throw new Error('AI 작성 요청을 보내지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.')
    }

    if (!response.ok) {
      throw new Error(await errorMessageOf(response))
    }

    const payload = await response.json().catch(() => null)
    const batchResults = (payload?.results ?? {}) as Record<string, PatrolAiResult | undefined>

    for (const item of batch) {
      const result = batchResults[item.id]
      const action = textOf(result?.action)
      if (!action) {
        throw new Error('AI가 일부 지적의 조치내용을 작성하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
      results.set(item.id, { action, disasterType: textOf(result?.disasterType) || '기타' })
    }

    processed += batch.length
    onProgress?.(processed, inspections.length)
  }

  return results
}

/**
 * 패트롤 점검 엑셀을 만들어 내려받는다.
 * AI 열은 이 함수에서만 호출하며, 두 열이 모두 채워졌을 때만 파일을 내려준다.
 */
export async function downloadPatrolInspectionExcel(
  projects: Project[],
  inspections: PatrolInspection[],
  quarter: string,
  onProgress?: PatrolExcelProgress
): Promise<void> {
  if (!inspections || inspections.length === 0) {
    throw new Error('내려받을 패트롤 점검이 없습니다.')
  }

  const projectMap = new Map((projects ?? []).map((project) => [project.id, project]))
  const today = seoulToday()

  // 한 건이라도 실패하면 여기서 예외가 나가고 파일은 만들지 않는다.
  const results = await requestAiResults(inspections, onProgress)

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(`패트롤점검_${quarter}`)
  worksheet.columns = COLUMNS

  const headerRow = worksheet.getRow(1)
  // 값이 빈 셀도 빠짐없이 꾸미도록 열 번호로 직접 돈다.
  for (let column = 1; column <= COLUMNS.length; column++) {
    const cell = headerRow.getCell(column)
    cell.fill = headerFill
    cell.font = { bold: true, size: 10 }
    cell.alignment = { ...centeredAlignment }
    cell.border = allBorders
  }
  headerRow.height = 30

  inspections.forEach((inspection, index) => {
    const fields = projectFieldsOf(inspection, projectMap)
    const state = getPatrolActionState(inspection, today)
    const ai = results.get(inspection.id)
    if (!ai) throw new Error('AI 작성 결과가 없어 엑셀을 만들지 못했습니다.')

    const completedDateText = state.notApplicable
      ? '해당없음'
      : state.completed
        ? state.completedDate ?? UNRECORDED_TEXT
        : ''

    const row = worksheet.addRow({
      no: index + 1,
      hq: fields.hq,
      branch: fields.branch,
      category: fields.category,
      projectName: fields.projectName,
      totalBudget: fields.totalBudget,
      contractor: fields.contractor,
      findingType: headquartersFindingTypeLabel(inspection.finding_type),
      inspectionDate: inspection.inspection_date ?? '',
      issueContent: buildPatrolIssueContent(inspection),
      aiAction: ai.action,
      aiDisasterType: ai.disasterType,
      inspectionKind: INSPECTION_KIND,
      workAddress: fields.workAddress,
      completedDate: completedDateText,
      supervisor: fields.supervisor,
      // 확인자는 점검자가 아니므로 원본 이름으로 채우지 않고 비워 둔다.
      inspector: '',
      // 비고는 원본에 없으므로 비운다.
      remarks: '',
    })

    for (let column = 1; column <= COLUMNS.length; column++) {
      const cell = row.getCell(column)
      cell.border = allBorders
      cell.font = { size: 10 }
      // 숫자·지적내용·AI내용·주소까지 예외 없이 가운데로 맞춘다.
      cell.alignment = { ...centeredAlignment }
    }

    // 지연 건은 점검일·조치완료일 셀에 음영을 준다. 해당없음은 제외한다.
    if (state.overdue) {
      row.getCell(INSPECTION_DATE_COLUMN).fill = overdueFill
      row.getCell(COMPLETED_DATE_COLUMN).fill = overdueFill
    }
  })

  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `KRC패트롤점검_${quarter}_${today.replace(/-/g, '')}.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)

}
