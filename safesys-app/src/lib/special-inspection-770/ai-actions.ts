// 특별점검 실제 지적의 AI 대상 추출과 정확한 응답 대응 및 다운로드 사본 생성을 담당한다.
import { inspectionFindings } from './summary'
import type { Special770InspectionData } from './types'

export const SPECIAL_770_AI_BATCH_SIZE = 20
export interface Special770ActionTarget { excavatorId: string; code: string; finding: string }
export interface Special770GeneratedAction extends Special770ActionTarget { action: string }
const keyOf = (row: { excavatorId: string; code: string }) => JSON.stringify([row.excavatorId, row.code])

export function special770ActionTargets(data: Special770InspectionData): Special770ActionTarget[] {
  const targets = inspectionFindings(data)
    .filter(row => row.result.finding?.trim() && !row.result.action?.trim())
    .map(row => ({ excavatorId: row.excavatorId, code: row.code, finding: row.result.finding!.trim() }))
  if (targets.some(row => !row.excavatorId) || new Set(targets.map(keyOf)).size !== targets.length) {
    throw new Error('점검 항목 식별자가 올바르지 않습니다.')
  }
  return targets
}

export function validateSpecial770Actions(value: unknown, targets: Special770ActionTarget[], checkFinding = false): Special770GeneratedAction[] {
  if (!Array.isArray(value) || value.length !== targets.length) throw new Error('AI 응답에 점검 항목이 누락되거나 추가되었습니다.')
  const expected = new Map(targets.map(row => [keyOf(row), row]))
  const seen = new Set<string>()
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.excavatorId !== 'string' || typeof entry.code !== 'string') {
      throw new Error('AI 응답 항목 형식이 올바르지 않습니다.')
    }
    const key = keyOf(entry)
    const target = expected.get(key)
    if (!target || seen.has(key)) throw new Error('AI 응답에 알 수 없거나 중복된 점검 항목이 있습니다.')
    seen.add(key)
    if (checkFinding && entry.finding !== target.finding) throw new Error('저장된 지적사항이 변경되었습니다. 새로고침 후 다시 다운로드해 주세요.')
    if (typeof entry.action !== 'string' || !entry.action.trim()) throw new Error('AI 조치문구가 비어 있습니다.')
    const action = entry.action.trim()
    if (action.length > 120 || /[\r\n]/.test(action)) throw new Error('AI 조치문구 형식이 올바르지 않습니다.')
    return { ...target, action }
  })
}

export async function prepareSpecial770Actions<T extends { inspectionId?: string; data: Special770InspectionData }>(
  input: T,
  request: (inspectionId: string) => Promise<unknown>,
): Promise<T> {
  const targets = special770ActionTargets(input.data)
  if (!targets.length) return input
  if (!input.inspectionId) throw new Error('저장된 점검 ID가 필요합니다. 새로고침 후 다시 다운로드해 주세요.')
  const actions = validateSpecial770Actions(await request(input.inspectionId), targets, true)
  const byKey = new Map(actions.map(row => [keyOf(row), row.action]))
  return {
    ...input,
    data: {
      ...input.data,
      excavators: input.data.excavators.map(excavator => ({
        ...excavator,
        items: Object.fromEntries(Object.entries(excavator.items).map(([code, result]) => {
          const action = byKey.get(keyOf({ excavatorId: excavator.id, code }))
          return [code, action ? { ...result, action } : result]
        })),
      })),
    },
  }
}
