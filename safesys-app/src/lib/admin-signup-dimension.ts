// 관리자 가입 추이 그래프의 막대 분해 축(역할·직책·본부) 카테고리와 색을 산출하는 유틸
export type ChartDimension = 'role' | 'position' | 'organization'

export interface DimensionCategory {
  /** 범례 라벨이자 counts의 키 */
  key: string
  color: string
}

/** 분해 축 산출에 필요한 최소 필드. */
export interface DimensionUser {
  role: string | null
  position: string | null
  hq_division: string | null
}

const UNASSIGNED_ROLE = '미배정'
const NOT_SPECIFIED = '미기재'
const OTHERS_KEY = '기타'
const OTHERS_COLOR = '#94a3b8'

/** 역할 축은 앱 전역 역할 색을 승계하므로 건수와 무관하게 순서·색이 고정이다. */
const ROLE_CATEGORIES: readonly DimensionCategory[] = [
  { key: '발주청', color: '#2563eb' },
  { key: '감리단', color: '#f59e0b' },
  { key: '시공사', color: '#059669' },
  { key: UNASSIGNED_ROLE, color: OTHERS_COLOR },
]

/** 색각 검증을 통과한 배열 순서다. 순서를 바꾸거나 색을 갈아끼우지 마라. */
const DYNAMIC_PALETTE: readonly string[] = [
  '#2563eb', '#ea580c', '#059669', '#7c3aed', '#0891b2', '#db2777', '#d97706',
]

/**
 * 자유 입력된 직책을 화면 표시용으로만 묶는다. DB 값은 바꾸지 않는다.
 * '4' · '토목4급' · '4급 토목'을 모두 '4급'으로 모은다.
 */
export function normalizePosition(raw: string | null): string {
  if (!raw) return NOT_SPECIFIED

  const trimmed = raw.trim()
  if (!trimmed) return NOT_SPECIFIED

  const compact = trimmed.replace(/\s+/g, '')
  // 숫자만 있는 값을 먼저 처리해야 '4'가 '4급'으로 모인다.
  const gradeOnly = compact.match(/^([1-9])급?$/)
  if (gradeOnly) return `${gradeOnly[1]}급`

  const gradeInside = compact.match(/([1-9])급/)
  if (gradeInside) return `${gradeInside[1]}급`

  return trimmed
}

/** 가입자에게서 해당 축의 원본 값을 뽑는다. */
export function getDimensionValue(user: DimensionUser, dimension: ChartDimension): string {
  if (dimension === 'position') return normalizePosition(user.position)
  if (dimension === 'organization') return user.hq_division?.trim() || NOT_SPECIFIED
  return user.role ?? UNASSIGNED_ROLE
}

/** 카테고리 목록에 없는 값은 '기타'로 접는다. */
export function resolveCategoryKey(value: string, categoryKeys: ReadonlySet<string>): string {
  return categoryKeys.has(value) ? value : OTHERS_KEY
}

function paletteColor(index: number): string {
  return DYNAMIC_PALETTE[index] ?? OTHERS_COLOR
}

/**
 * 축별 카테고리를 만든다. 역할은 고정 목록이고, 직책·본부는 건수 내림차순 상위 7개에
 * 팔레트를 배정한 뒤 나머지를 '기타' 하나로 접는다. 8개 이하면 접지 않고 전부 개별 표시한다.
 */
export function buildCategories(
  users: readonly DimensionUser[],
  dimension: ChartDimension
): DimensionCategory[] {
  if (dimension === 'role') return [...ROLE_CATEGORIES]

  const countByValue = new Map<string, number>()
  for (const user of users) {
    const value = getDimensionValue(user, dimension)
    countByValue.set(value, (countByValue.get(value) ?? 0) + 1)
  }

  // 동점이면 이름순으로 고정해 렌더마다 순서가 흔들리지 않게 한다.
  const ranked = Array.from(countByValue.entries())
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => (
      rightCount - leftCount || leftKey.localeCompare(rightKey, 'ko-KR')
    ))
    .map(([key]) => key)

  if (ranked.length <= DYNAMIC_PALETTE.length + 1) {
    return ranked.map((key, index) => ({ key, color: paletteColor(index) }))
  }

  const top = ranked
    .slice(0, DYNAMIC_PALETTE.length)
    .map((key, index) => ({ key, color: paletteColor(index) }))

  // 상위권에 '기타'라는 값이 실제로 있으면 꼬리가 그쪽으로 합쳐지므로 버킷을 더 만들지 않는다.
  if (top.some((category) => category.key === OTHERS_KEY)) return top
  return [...top, { key: OTHERS_KEY, color: OTHERS_COLOR }]
}
