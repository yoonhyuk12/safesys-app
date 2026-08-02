// 관리자 목록에서 공유하는 3단계 안정 정렬 규칙을 제공한다
export type SortDirection = 'asc' | 'desc'
export type SortValue = string | number | boolean | null | undefined

export interface SortState<K extends string> {
  key: K | null
  direction: SortDirection | null
}

export function nextSortState<K extends string>(
  current: SortState<K>,
  key: K
): SortState<K> {
  if (current.key !== key || current.direction === null) return { key, direction: 'asc' }
  if (current.direction === 'asc') return { key, direction: 'desc' }
  return { key: null, direction: null }
}

function hasValue(value: SortValue): value is string | number | boolean {
  return value !== null && value !== undefined && value !== '' &&
    !(typeof value === 'number' && Number.isNaN(value))
}

function compareValues(left: Exclude<SortValue, null | undefined>, right: Exclude<SortValue, null | undefined>): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
  return String(left).localeCompare(String(right), 'ko-KR', { numeric: true, sensitivity: 'base' })
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  state: SortState<K>,
  getValue: (row: T, key: K) => SortValue
): T[] {
  if (!state.key || !state.direction) return [...rows]

  const key = state.key
  const direction = state.direction
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftValue = getValue(left.row, key)
      const rightValue = getValue(right.row, key)
      const leftHasValue = hasValue(leftValue)
      const rightHasValue = hasValue(rightValue)
      if (!leftHasValue || !rightHasValue) {
        if (!leftHasValue && !rightHasValue) return left.index - right.index
        return leftHasValue ? -1 : 1
      }
      const compared = compareValues(leftValue, rightValue)
      return compared === 0 ? left.index - right.index : compared * (direction === 'asc' ? 1 : -1)
    })
    .map(({ row }) => row)
}
