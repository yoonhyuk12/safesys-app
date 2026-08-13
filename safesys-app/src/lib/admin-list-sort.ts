// 가입자와 프로젝트 관리자 목록의 정렬 열 및 값 추출기를 정의한다
import type { SortValue } from '@/lib/admin-sort'

export type AdminUserSortKey =
  | 'name' | 'email' | 'role' | 'organization' | 'company'
  | 'position' | 'createdAt' | 'lastSignInAt' | 'confirmed'
export type AdminProjectSortKey =
  | 'name' | 'hq' | 'branch' | 'creator' | 'createdAt' | 'status'

export const ADMIN_USER_SORT_OPTIONS = [
  { key: 'name', label: '이름' },
  { key: 'email', label: '이메일' },
  { key: 'role', label: '역할' },
  { key: 'organization', label: '본부·지사' },
  { key: 'company', label: '회사' },
  { key: 'position', label: '직책' },
  { key: 'createdAt', label: '가입일' },
  { key: 'lastSignInAt', label: '최근 로그인' },
  { key: 'confirmed', label: '인증 상태' },
] as const

export const ADMIN_PROJECT_SORT_OPTIONS = [
  { key: 'name', label: '프로젝트명' },
  { key: 'hq', label: '본부' },
  { key: 'branch', label: '지사' },
  { key: 'creator', label: '등록자' },
  { key: 'createdAt', label: '등록일' },
  { key: 'status', label: '상태' },
] as const

type UserSortRecord = {
  full_name: string | null; email: string | null; role: string | null
  hq_division: string | null; branch_division: string | null
  company_name: string | null; position: string | null; created_at: string
  last_sign_in_at: string | null; email_confirmed_at: string | null
}

type ProjectSortRecord = {
  project_name: string; managing_hq: string; managing_branch: string
  created_at: string; isHandedOver: boolean
  creator: { fullName: string; affiliation: string } | null
}

function timestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function getAdminUserSortValue(row: UserSortRecord, key: AdminUserSortKey): SortValue {
  const values: Record<AdminUserSortKey, SortValue> = {
    name: row.full_name,
    email: row.email,
    role: row.role,
    organization: [row.hq_division, row.branch_division].filter(Boolean).join(' ') || null,
    company: row.company_name,
    position: row.position,
    createdAt: timestamp(row.created_at),
    lastSignInAt: timestamp(row.last_sign_in_at),
    confirmed: Boolean(row.email_confirmed_at),
  }
  return values[key]
}

export function getAdminProjectSortValue(row: ProjectSortRecord, key: AdminProjectSortKey): SortValue {
  const values: Record<AdminProjectSortKey, SortValue> = {
    name: row.project_name,
    hq: row.managing_hq,
    branch: row.managing_branch,
    creator: row.creator ? `${row.creator.fullName} ${row.creator.affiliation}`.trim() : null,
    createdAt: timestamp(row.created_at),
    status: row.isHandedOver,
  }
  return values[key]
}
