// 남이 올린 사고보고까지 고칠 수 있는 사용자인지 소속과 현장 관할로 판정하는 순수 모듈

/** 판정에 필요한 소속 정보만 추린 모양. UserProfile을 그대로 넣어도 된다. */
export interface AccidentManagerProfile {
  role: string
  hq_division?: string | null
  branch_division?: string | null
}

/** 판정에 필요한 현장 정보만 추린 모양. Project를 그대로 넣어도 된다. */
export interface AccidentManagedProject {
  managing_hq: string
}

/**
 * 전사 범위로 사고 이력을 다루는 사용자인지 본다 — 관리자급(hq_division 없음)과 본사 소속이다.
 * `Dashboard.tsx`의 `canSeeAllHq`와 같은 기준이며, 본부 소속은 여기서 참이 되지 않는다.
 */
function isCompanyWideManager(profile: AccidentManagerProfile): boolean {
  return (
    profile.hq_division == null ||
    (profile.hq_division === '본사' && profile.branch_division === '본사')
  )
}

/**
 * 본인이 올리지 않은 사고보고까지 수정·삭제할 수 있는지 판정한다.
 * 전사 범위 사용자는 어느 현장이든 되고, 본부 소속은 자기 본부가 관할하는 현장일 때만 된다.
 * 작성자 본인 여부는 여기서 보지 않는다 — 호출하는 쪽이 `created_by`와 함께 OR로 묶는다.
 * `database/20260718-0506_add_project_accidents.sql`의 수정·삭제 RLS와 같은 갈래이며,
 * 정책을 넓힐 때는 이 함수와 SQL을 함께 고쳐야 한다.
 */
export function canManageProjectAccidents(
  profile: AccidentManagerProfile | null | undefined,
  project: AccidentManagedProject | null | undefined,
): boolean {
  if (!profile || profile.role !== '발주청') return false
  if (isCompanyWideManager(profile)) return true
  if (!profile.branch_division?.endsWith('본부')) return false
  // 본부 소속은 관할 본부가 일치해야 한다. 현장을 모르면 관할을 확인할 수 없으므로 열지 않는다.
  return Boolean(project?.managing_hq) && project?.managing_hq === profile.hq_division
}
