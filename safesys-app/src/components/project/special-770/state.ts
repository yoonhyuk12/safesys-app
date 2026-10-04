// 770 특별점검 입력 상태(Special770InspectionData)를 새 객체로 갱신하는 순수 함수 모음
import {
  SPECIAL_770_CHECKLIST,
  SPECIAL_770_ETC_CODE,
  type Special770Excavator,
  type Special770InspectionData,
  type Special770ItemResult,
} from '@/lib/special-inspection-770/types'

export type Special770Setter = (updater: (prev: Special770InspectionData) => Special770InspectionData) => void

export const ALL_770_CODES: readonly string[] = [...SPECIAL_770_CHECKLIST.map(item => item.code), SPECIAL_770_ETC_CODE]

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyExcavator(): Special770Excavator {
  return {
    id: newId(),
    vehicle_no: '',
    items: Object.fromEntries(ALL_770_CODES.map(code => [code, { judgement: null }])),
    etc_text: '',
    pin_photo_url: null,
  }
}

export function createEmpty770Data(): Special770InspectionData {
  return {
    inspection_team: '',
    inspected_work: '',
    excavators: [createEmptyExcavator()],
    site_photo_urls: [],
  }
}

/** DB에서 읽은 값을 화면 상태로 쓸 수 있게 빈 필드를 채운다. */
export function normalize770Data(raw: unknown): Special770InspectionData {
  if (!raw || typeof raw !== 'object') return createEmpty770Data()
  const data = raw as Partial<Special770InspectionData>
  return {
    inspection_team: data.inspection_team ?? '',
    inspected_work: data.inspected_work ?? '',
    excavators: Array.isArray(data.excavators) ? data.excavators.map(exc => ({
      ...exc,
      items: { ...Object.fromEntries(ALL_770_CODES.map(code => [code, { judgement: null }])), ...(exc.items ?? {}) },
    })) : [],
    site_photo_urls: Array.isArray(data.site_photo_urls) ? data.site_photo_urls : [],
  }
}

export function updateExcavator(
  data: Special770InspectionData,
  excavatorId: string,
  patch: Partial<Omit<Special770Excavator, 'id' | 'items'>>,
): Special770InspectionData {
  return {
    ...data,
    excavators: data.excavators.map(exc => (exc.id === excavatorId ? { ...exc, ...patch } : exc)),
  }
}

export function updateItem(
  data: Special770InspectionData,
  excavatorId: string,
  code: string,
  patch: Partial<Special770ItemResult>,
): Special770InspectionData {
  return {
    ...data,
    excavators: data.excavators.map(exc => {
      if (exc.id !== excavatorId) return exc
      const current = exc.items?.[code] ?? { judgement: null }
      return { ...exc, items: { ...exc.items, [code]: { ...current, ...patch } } }
    }),
  }
}

export function addExcavator(data: Special770InspectionData): Special770InspectionData {
  return { ...data, excavators: [...data.excavators, createEmptyExcavator()] }
}

/** 빈 부적정 항목 기한만 점검일 7일 후로 채운다. UTC 달력 연산으로 시간대 영향을 피한다. */
export function fill770ActionDueDates(data: Special770InspectionData, inspectionDate: string): Special770InspectionData {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) return data
  const date = new Date(`${inspectionDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== inspectionDate) return data
  date.setUTCDate(date.getUTCDate() + 7)
  const dueDate = date.toISOString().slice(0, 10)
  let changed = false
  const excavators = data.excavators.map(exc => {
    const missing = Object.entries(exc.items).filter(([, item]) => item.judgement === '부적정' && !item.action_due_date)
    if (missing.length === 0) return exc
    changed = true
    const items = { ...exc.items }
    for (const [code, item] of missing) items[code] = { ...item, action_due_date: dueDate }
    return { ...exc, items }
  })
  return changed ? { ...data, excavators } : data
}

export function removeExcavator(data: Special770InspectionData, excavatorId: string): Special770InspectionData {
  return { ...data, excavators: data.excavators.filter(exc => exc.id !== excavatorId) }
}
