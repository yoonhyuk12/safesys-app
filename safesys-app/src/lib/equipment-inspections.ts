// 장비 일일점검 대장의 작성 초안 상태·제출 전 검증·조회/제출을 담당하는 모듈이다.
import { supabase } from '@/lib/supabase'
import type {
  EquipmentChecklist,
  EquipmentChecklistItem,
  EquipmentInspection,
  EquipmentInspectionAnswer,
  EquipmentInspectionResult,
} from '@/lib/equipment-inspection-types'

export const EQUIPMENT_INSPECTION_TABLE = 'equipment_daily_inspections'

export const EQUIPMENT_INSPECTION_RESULTS: EquipmentInspectionResult[] = ['pass', 'fail', 'na']

export const EQUIPMENT_INSPECTION_RESULT_LABELS: Record<EquipmentInspectionResult, string> = {
  pass: '적합',
  fail: '부적합',
  na: '해당없음',
}

/** 항목 하나에 대한 점검 결과. 결과가 null이면 아직 점검하지 않은 것이다. */
export interface EquipmentInspectionResponse {
  result: EquipmentInspectionResult | null
  note: string
}

/** 화면이 들고 있는 미제출 상태. 제출 직전에만 EquipmentInspection 행으로 바뀐다. */
export interface EquipmentInspectionDraft {
  checklistId: string
  equipmentName: string
  inspectionDate: string
  companyName: string
  vehicleNumber: string
  machineNumber: string
  inspectorName: string
  signature: string
  remarks: string
  responses: Record<string, EquipmentInspectionResponse>
}

/** 출력물의 점검자 칸은 한 줄이다. HWPX 내보내기와 DB CHECK가 쓰는 값과 같아야 한다. */
export const EQUIPMENT_INSPECTOR_NAME_MAX = 100

/** 서명 판정 기준 — 캔버스가 만든 PNG dataURL만 서명으로 인정한다. signature 컬럼의 CHECK와 같은 규칙이다. */
const EQUIPMENT_SIGNATURE_PATTERN = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/
const EQUIPMENT_SIGNATURE_MIN_LENGTH = 200

/**
 * 마이그레이션 적용 전에는 테이블 자체가 없다. 이때 빈 배열을 돌려주면 "아직 아무도 제출하지 않음"으로
 * 보이므로, 원인을 분명히 구분해 알린다. 실행해야 할 SQL 파일명은 사용자 화면에 노출하지 않는다.
 */
export const EQUIPMENT_INSPECTION_MISSING_TABLE =
  '장비 일일점검 대장이 아직 개설되지 않았습니다. 시스템 관리자에게 문의해주세요.'

interface SupabaseErrorLike {
  code?: string
  message?: string
}

function isMissingTable(error: SupabaseErrorLike): boolean {
  return error.code === 'PGRST205' || error.code === '42P01' || /does not exist/i.test(error.message ?? '')
}

function toError(error: SupabaseErrorLike, fallback: string): Error {
  if (isMissingTable(error)) return new Error(EQUIPMENT_INSPECTION_MISSING_TABLE)
  return new Error(error.message || fallback)
}

const SELECT_COLUMNS =
  'id, project_id, equipment_type, equipment_name, inspection_date, company_name, vehicle_number, machine_number, inspector_name, signature, answers, remarks, created_by, created_at'

/** 오늘 날짜를 한국 시간 기준 YYYY-MM-DD로 돌려준다. */
export function equipmentInspectionToday(now: Date = new Date()): string {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return seoul.toISOString().slice(0, 10)
}

export function createEquipmentInspectionDraft(
  defaults: Partial<EquipmentInspectionDraft> = {}
): EquipmentInspectionDraft {
  return {
    checklistId: '',
    equipmentName: '',
    inspectionDate: equipmentInspectionToday(),
    companyName: '',
    vehicleNumber: '',
    machineNumber: '',
    inspectorName: '',
    signature: '',
    remarks: '',
    responses: {},
    ...defaults,
  }
}

/**
 * 장비를 고른다. 장비가 바뀌면 항목이 통째로 달라지므로 이전 응답과 서명을 버린다.
 * 서명까지 지우는 이유는 점검자가 서명한 대상이 이전 장비의 점검 결과이기 때문이다.
 * 회사명·점검일·점검자처럼 공통인 기본사항은 그대로 둔다.
 */
export function selectEquipmentChecklist(
  draft: EquipmentInspectionDraft,
  checklist: EquipmentChecklist
): EquipmentInspectionDraft {
  if (draft.checklistId === checklist.id) return draft
  return {
    ...draft,
    checklistId: checklist.id,
    equipmentName: checklist.name,
    responses: {},
    signature: '',
    // 차량·기계번호는 그 장비를 가리키는 식별자다. 장비가 바뀌면 이전 장비의 번호가 남아서는 안 된다.
    vehicleNumber: '',
    machineNumber: '',
  }
}

/**
 * 초안을 고친다. 서명 이후의 어떤 수정도 서명을 무효로 만든다 —
 * 서명은 제출하는 점검 내용에 대한 것이므로, 내용이 바뀌면 그 내용에 다시 서명받아야 한다.
 */
export function editEquipmentInspectionDraft(
  draft: EquipmentInspectionDraft,
  patch: Partial<EquipmentInspectionDraft>
): EquipmentInspectionDraft {
  const next = { ...draft, ...patch }
  if ('signature' in patch) return next

  const keys = Object.keys(patch) as (keyof EquipmentInspectionDraft)[]
  const changed = keys.some((key) => next[key] !== draft[key])
  return changed ? { ...next, signature: '' } : next
}

function withResponse(
  draft: EquipmentInspectionDraft,
  itemId: string,
  patch: Partial<EquipmentInspectionResponse>
): EquipmentInspectionDraft {
  const current = draft.responses[itemId] ?? { result: null, note: '' }
  return editEquipmentInspectionDraft(draft, {
    responses: { ...draft.responses, [itemId]: { ...current, ...patch } },
  })
}

export function setEquipmentAnswerResult(
  draft: EquipmentInspectionDraft,
  itemId: string,
  result: EquipmentInspectionResult
): EquipmentInspectionDraft {
  return withResponse(draft, itemId, { result })
}

export function setEquipmentAnswerNote(
  draft: EquipmentInspectionDraft,
  itemId: string,
  note: string
): EquipmentInspectionDraft {
  return withResponse(draft, itemId, { note })
}

/**
 * 서명 자리에 실제 그림이 들어왔는지 본다. 빈 값·안내 문구·빈 dataURL을 모두 걸러낸다.
 * 판정 기준은 signature 컬럼의 CHECK 제약과 같다 — 화면과 DB가 서로 다른 것을 서명으로 인정하면 안 된다.
 */
export function isBlankEquipmentSignature(value: unknown): boolean {
  if (typeof value !== 'string') return true
  const trimmed = value.trim()
  return !EQUIPMENT_SIGNATURE_PATTERN.test(trimmed) || trimmed.length < EQUIPMENT_SIGNATURE_MIN_LENGTH
}

/** 아직 결과를 고르지 않은 항목을 원문 순서대로 돌려준다. */
export function unansweredEquipmentItems(
  draft: EquipmentInspectionDraft,
  checklist: EquipmentChecklist | null
): EquipmentChecklistItem[] {
  if (!checklist) return []
  // 결과가 있기만 한 것이 아니라 pass/fail/na 중 하나여야 점검한 것으로 본다.
  return checklist.items.filter((item) => {
    const result = draft.responses[item.id]?.result
    return !result || !EQUIPMENT_INSPECTION_RESULTS.includes(result)
  })
}

/** 제출을 막아야 할 이유를 한 줄로 돌려준다. 문제가 없으면 null이다. */
export function validateEquipmentInspectionDraft(
  draft: EquipmentInspectionDraft,
  checklist: EquipmentChecklist | null
): string | null {
  if (!checklist || draft.checklistId !== checklist.id) return '점검할 장비를 선택해주세요.'
  if (!draft.inspectionDate) return '점검일을 입력해주세요.'
  const inspectorName = draft.inspectorName.trim()
  if (!inspectorName) return '점검자 성명을 입력해주세요.'
  if (/[\r\n]/.test(inspectorName)) return '점검자 성명은 한 줄로 입력해주세요.'
  if (inspectorName.length > EQUIPMENT_INSPECTOR_NAME_MAX) {
    return `점검자 성명은 ${EQUIPMENT_INSPECTOR_NAME_MAX}자 이하로 입력해주세요.`
  }

  const remaining = unansweredEquipmentItems(draft, checklist)
  if (remaining.length > 0) {
    return `점검하지 않은 항목이 ${remaining.length}개 남았습니다. 모든 항목에 적합·부적합·해당없음을 표시해주세요.`
  }

  if (isBlankEquipmentSignature(draft.signature)) return '점검자 서명을 입력해주세요.'
  return null
}

/** 원문 항목의 분류·문구를 그대로 담은 제출용 답변 배열을 만든다. */
export function buildEquipmentInspectionAnswers(
  draft: EquipmentInspectionDraft,
  checklist: EquipmentChecklist
): EquipmentInspectionAnswer[] {
  return checklist.items.map((item) => {
    const result = draft.responses[item.id]?.result
    // 미점검을 해당없음으로 조용히 바꾸면 점검하지 않은 항목이 점검한 것처럼 대장에 남는다.
    if (!result || !EQUIPMENT_INSPECTION_RESULTS.includes(result)) {
      throw new Error(`점검하지 않은 항목이 있습니다 — ${item.text}`)
    }
    return {
      id: item.id,
      category: item.category,
      text: item.text,
      result,
      note: draft.responses[item.id]?.note ?? '',
    }
  })
}

/** 프로젝트의 점검 대장을 최신 점검일 순으로 가져온다. 빈 목록과 조회 실패를 구분한다. */
export async function getEquipmentInspections(projectId: string): Promise<EquipmentInspection[]> {
  if (!projectId) return []

  const { data, error } = await supabase
    .from(EQUIPMENT_INSPECTION_TABLE)
    .select(SELECT_COLUMNS)
    .eq('project_id', projectId)
    .order('inspection_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw toError(error, '장비 일일점검 대장 조회에 실패했습니다.')
  return (data ?? []) as unknown as EquipmentInspection[]
}

/**
 * 점검 한 건을 제출한다. created_by는 항상 로그인 사용자로 고정한다 —
 * 화면에서 다른 값을 보내도 INSERT RLS가 거부하므로 여기서도 같은 값을 쓴다.
 */
export async function createEquipmentInspection(
  projectId: string,
  draft: EquipmentInspectionDraft,
  checklist: EquipmentChecklist | null,
  userId: string
): Promise<EquipmentInspection> {
  const invalid = validateEquipmentInspectionDraft(draft, checklist)
  if (invalid) throw new Error(invalid)
  if (!userId) throw new Error('로그인이 필요합니다.')
  if (!projectId) throw new Error('프로젝트를 찾을 수 없습니다.')

  const row = {
    project_id: projectId,
    equipment_type: checklist!.id,
    equipment_name: checklist!.name,
    inspection_date: draft.inspectionDate,
    company_name: draft.companyName.trim(),
    vehicle_number: draft.vehicleNumber.trim(),
    machine_number: draft.machineNumber.trim(),
    inspector_name: draft.inspectorName.trim(),
    signature: draft.signature.trim(),
    answers: buildEquipmentInspectionAnswers(draft, checklist!),
    remarks: draft.remarks.trim(),
    created_by: userId,
  }

  const { data, error } = await supabase
    .from(EQUIPMENT_INSPECTION_TABLE)
    .insert([row])
    .select(SELECT_COLUMNS)
    .single()

  if (error) throw toError(error, '장비 일일점검 제출에 실패했습니다.')
  return data as unknown as EquipmentInspection
}

/** 잘못 제출한 점검을 지운다. 지울 수 있는 사람은 RLS가 정한다. */
export async function deleteEquipmentInspection(id: string): Promise<void> {
  const { error } = await supabase.from(EQUIPMENT_INSPECTION_TABLE).delete().eq('id', id)
  if (error) throw toError(error, '장비 일일점검 삭제에 실패했습니다.')
}
