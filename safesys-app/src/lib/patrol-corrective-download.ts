// 패트롤 계획의 인증 배치 생성과 원본 대조 후 단건 HWPX 또는 일괄 ZIP을 내려받는다.
import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'
import type { PatrolInspection } from '@/lib/patrol-inspections'
import { getPatrolActionState, PATROL_MAX_AI_ITEMS } from '@/lib/patrol-inspection-utils'
import { buildPatrolCorrectiveHwpx, PATROL_CORRECTIVE_LABELS, type PatrolCorrectiveKind, type PatrolCorrectivePlan } from '@/lib/hwpx/patrol-corrective-hwpx-export'

export { PATROL_CORRECTIVE_LABELS }
export type { PatrolCorrectiveKind }
type Progress = (message: string) => void

async function generatePlans(rows: PatrolInspection[], progress: Progress): Promise<Record<string, PatrolCorrectivePlan>> {
  const plans: Record<string, PatrolCorrectivePlan> = {}
  for (let start = 0; start < rows.length; start += PATROL_MAX_AI_ITEMS) {
    const batch = rows.slice(start, start + PATROL_MAX_AI_ITEMS)
    progress(`AI 계획 작성 중 ${start}/${rows.length}`)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('로그인 후 다시 다운로드해 주세요.')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    try {
      const response = await fetch('/api/ai/patrol-corrective-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ inspectionIds: batch.map(row => row.id) }), signal: controller.signal,
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || '시정조치계획 작성에 실패했습니다.')
      if (!data.results || Object.keys(data.results).length !== batch.length) throw new Error('AI 계획 결과가 일부 누락되었습니다.')
      for (const row of batch) {
        const value = data.results[row.id]
        const source = data.sources?.[row.id]
        if (!source || source.issue1 !== (row.issue_content1 || '').trim() || source.issue2 !== (row.issue_content2 || '').trim() || source.findingType !== row.finding_type) {
          throw new Error('점검 원본이 변경되었습니다. 목록을 새로고침한 뒤 다시 다운로드해 주세요.')
        }
        if (typeof value?.action !== 'string' || !value.action.trim() || value.action.length > 600 || typeof value.prevention !== 'string' || !value.prevention.trim() || value.prevention.length > 600) {
          throw new Error('AI 계획 응답 형식이 올바르지 않습니다.')
        }
        plans[row.id] = { action: value.action, prevention: value.prevention }
      }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('AI 계획 작성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.')
      throw error
    } finally { clearTimeout(timer) }
  }
  return plans
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

const filenamePart = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)

export async function downloadPatrolCorrective(inspections: PatrolInspection[], kind: PatrolCorrectiveKind, quarter: string, progress: Progress, bulk = true): Promise<void> {
  const rows = inspections.filter(row => !getPatrolActionState(row).notApplicable)
  if (!rows.length) throw new Error('다운로드할 해당 점검이 없습니다.')
  const plans = kind === 'plan' ? await generatePlans(rows, progress) : {}
  const zip = new JSZip()
  for (const [index, row] of rows.entries()) {
    progress(`${PATROL_CORRECTIVE_LABELS[kind]} 생성 중 ${index + 1}/${rows.length}`)
    const blob = await buildPatrolCorrectiveHwpx(row, kind, plans[row.id])
    const name = `${filenamePart(row.project_name || '사업')}_${PATROL_CORRECTIVE_LABELS[kind]}_${row.inspection_date}.hwpx`
    if (!bulk && rows.length === 1) { save(blob, name); return }
    zip.file(`${String(index + 1).padStart(4, '0')}_${name}`, await blob.arrayBuffer())
  }
  progress('ZIP 파일 압축 중...')
  save(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `${filenamePart(quarter)}_${PATROL_CORRECTIVE_LABELS[kind]}_${rows.length}건.zip`)
}
