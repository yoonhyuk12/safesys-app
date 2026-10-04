// 770 특별점검 데이터에서 지적 목록·굴착기별 건수·대분류별 지적/조치 문구를 뽑는 순수 함수
import {
  SPECIAL_770_CATEGORIES,
  SPECIAL_770_CHECKLIST,
  SPECIAL_770_ETC_CODE,
  type Special770Category,
  type Special770Excavator,
  type Special770InspectionData,
  type Special770ItemResult,
} from '@/lib/special-inspection-770/types'

export interface Special770Finding {
  excavatorId: string
  vehicleNo: string
  code: string
  category: Special770Category['no']
  /** 점검표 항목 문구. 기타는 현장이 적은 위험요인 */
  itemText: string
  result: Special770ItemResult
  completed: boolean
}

export interface Special770ExcavatorStats {
  findings: number
  completed: number
  pending: number
  /** 미조치 항목 중 가장 늦은 조치예정일. 미조치가 없으면 null */
  latestDueDate: string | null
}

function isCompleted(result: Special770ItemResult): boolean {
  return !!result.after_photo_url && result.after_photo_url !== 'N/A'
}

function itemTextOf(code: string, excavator: Special770Excavator): string {
  if (code === SPECIAL_770_ETC_CODE) return excavator.etc_text?.trim() || '기타 점검 사항'
  return SPECIAL_770_CHECKLIST.find(item => item.code === code)?.text ?? code
}

function categoryOf(code: string): Special770Category['no'] {
  if (code === SPECIAL_770_ETC_CODE) return 4
  return SPECIAL_770_CHECKLIST.find(item => item.code === code)?.category ?? 4
}

const CODE_ORDER = [...SPECIAL_770_CHECKLIST.map(item => item.code), SPECIAL_770_ETC_CODE]

/** 굴착기 한 대의 부적정 항목을 점검표 순서대로 돌려준다. */
export function excavatorFindings(excavator: Special770Excavator): Special770Finding[] {
  return CODE_ORDER.flatMap(code => {
    const result = excavator.items?.[code]
    if (!result || result.judgement !== '부적정') return []
    return [{
      excavatorId: excavator.id,
      vehicleNo: excavator.vehicle_no,
      code,
      category: categoryOf(code),
      itemText: itemTextOf(code, excavator),
      result,
      completed: isCompleted(result),
    }]
  })
}

/** 점검 1건(현장 1회)의 모든 굴착기 지적을 굴착기 순서→항목 순서로 돌려준다. */
export function inspectionFindings(data: Special770InspectionData | null | undefined): Special770Finding[] {
  return (data?.excavators ?? []).flatMap(excavatorFindings)
}

export function excavatorStats(excavator: Special770Excavator): Special770ExcavatorStats {
  const findings = excavatorFindings(excavator)
  const pending = findings.filter(f => !f.completed)
  const dueDates = pending
    .map(f => f.result.action_due_date)
    .filter((d): d is string => !!d)
    .sort()
  return {
    findings: findings.length,
    completed: findings.length - pending.length,
    pending: pending.length,
    latestDueDate: dueDates.length ? dueDates[dueDates.length - 1] : null,
  }
}

export function inspectionStats(data: Special770InspectionData | null | undefined): Special770ExcavatorStats & { excavators: number } {
  const all = (data?.excavators ?? []).map(excavatorStats)
  const dueDates = all.map(s => s.latestDueDate).filter((d): d is string => !!d).sort()
  return {
    excavators: all.length,
    findings: all.reduce((sum, s) => sum + s.findings, 0),
    completed: all.reduce((sum, s) => sum + s.completed, 0),
    pending: all.reduce((sum, s) => sum + s.pending, 0),
    latestDueDate: dueDates.length ? dueDates[dueDates.length - 1] : null,
  }
}

export interface Special770CategoryText {
  category: Special770Category['no']
  title: string
  findings: string
  actions: string
}

/**
 * 대분류별로 지적사항·조치사항 문구를 줄바꿈으로 합친다(붙임3 점검결과 표, 붙임4 총괄표 I~P열).
 * 지적 문구가 비어 있으면 항목 문구를 대신 쓴다.
 */
export function findingsByCategory(findings: Special770Finding[]): Special770CategoryText[] {
  return SPECIAL_770_CATEGORIES.map(category => {
    const inCategory = findings.filter(f => f.category === category.no)
    return {
      category: category.no,
      title: category.title,
      findings: inCategory.map(f => `- ${f.result.finding?.trim() || f.itemText}`).join('\n'),
      actions: inCategory
        .filter(f => f.result.action?.trim())
        .map(f => `- ${f.result.action!.trim()}`)
        .join('\n'),
    }
  })
}
