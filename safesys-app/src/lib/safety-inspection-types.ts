// 정기·특별 안전점검 유형 문자열과 특별점검 판별 헬퍼 — 유형 문자열 비교는 여기 상수만 쓴다
export const SPECIAL_287_TYPE = '특별점검(안전혁신건설-287)'
export const SPECIAL_770_TYPE = '특별점검(굴삭기 버킷 사고)'

/** DB CHECK 제약(safety_inspections_inspection_type_check)과 같은 순서로 유지한다. */
export const SAFETY_INSPECTION_TYPES = ['해빙기', '우기', '종합', SPECIAL_287_TYPE, SPECIAL_770_TYPE] as const
export type SafetyInspectionType = (typeof SAFETY_INSPECTION_TYPES)[number]

/** 서명 단계가 없고 지적·조치를 점검 본문 안에 담는 특별점검류인지 판별한다. */
export function isSpecialInspectionType(type: string | null | undefined): boolean {
  return type === SPECIAL_287_TYPE || type === SPECIAL_770_TYPE
}

export function isSpecial287Type(type: string | null | undefined): boolean {
  return type === SPECIAL_287_TYPE
}

export function isSpecial770Type(type: string | null | undefined): boolean {
  return type === SPECIAL_770_TYPE
}

/** 탭·배지처럼 좁은 자리에 쓰는 짧은 라벨. */
export function shortInspectionTypeLabel(type: string): string {
  if (type === SPECIAL_287_TYPE) return '특별'
  if (type === SPECIAL_770_TYPE) return '특별(굴삭기)'
  return type
}
