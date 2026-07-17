export interface OrganizationScopeProfile {
  role?: string | null
  hq_division?: string | null
  branch_division?: string | null
}

export interface OrganizationScopeTarget {
  managing_hq?: string | null
  managing_branch?: string | null
}

function normalizeOrganizationName(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

/**
 * 사용자 소속 기준으로 본부·지사 데이터 접근 범위를 확인한다.
 * 본사/관리자급은 전사, 본부 소속은 해당 본부 전체, 지사 소속은 해당 지사만 허용한다.
 */
export function isOrganizationInUserScope(
  profile: OrganizationScopeProfile | null | undefined,
  target: OrganizationScopeTarget
): boolean {
  if (!profile) return false

  const userHq = normalizeOrganizationName(profile.hq_division)
  const userBranch = normalizeOrganizationName(profile.branch_division)
  const targetHq = normalizeOrganizationName(target.managing_hq)
  const targetBranch = normalizeOrganizationName(target.managing_branch)

  if (!userHq || userHq === '본사') return profile.role === '발주청'
  if (targetHq !== userHq) return false

  if (profile.role !== '발주청') {
    return Boolean(userBranch) && targetBranch === userBranch
  }

  const isHeadquartersLevel = (
    !userBranch ||
    userBranch === '본사' ||
    userBranch.endsWith('본부')
  )
  if (isHeadquartersLevel) return true

  return targetBranch === userBranch
}
