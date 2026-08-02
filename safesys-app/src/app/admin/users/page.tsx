'use client'

// 관리자 가입자 목록과 인증·수정·삭제 작업을 제공하는 클라이언트 화면
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 50
const ROLES = ['발주청', '감리단', '시공사'] as const

type Role = (typeof ROLES)[number]
type NullableText = string | null

interface AdminUser {
  id: string
  email: NullableText
  full_name: NullableText
  phone_number: NullableText
  position: NullableText
  role: Role | null
  hq_division: NullableText
  branch_division: NullableText
  company_name: NullableText
  created_at: string
  last_sign_in_at: NullableText
  email_confirmed_at: NullableText
  has_profile: boolean
}

interface UserListResponse {
  success: true
  users: AdminUser[]
}

interface SuccessResponse {
  success: true
}

interface ProfileDraft {
  full_name: string
  phone_number: string
  position: string
  role: Role | ''
  hq_division: string
  branch_division: string
  company_name: string
}

type ProfilePatch = Omit<ProfileDraft, 'role'> & { role: Role }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${session.access_token}`)
  const response = await fetch(path, { ...init, headers })
  const payload: unknown = await response.json().catch(() => null)
  const errorMessage = isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : '요청을 처리하지 못했습니다.'

  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(errorMessage)
  }

  return payload as T
}

function formatDate(value: NullableText, includeTime = false): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

function roleBadgeClass(role: Role | null): string {
  if (role === '발주청') return 'bg-blue-50 text-blue-700 ring-blue-200'
  if (role === '감리단') return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (role === '시공사') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  return 'bg-gray-50 text-gray-500 ring-gray-200'
}

function toProfileDraft(user: AdminUser): ProfileDraft {
  return {
    full_name: user.full_name ?? '',
    phone_number: user.phone_number ?? '',
    position: user.position ?? '',
    role: user.role ?? '',
    hq_division: user.hq_division ?? '',
    branch_division: user.branch_division ?? '',
    company_name: user.company_name ?? '',
  }
}

function SummaryCards({ users }: { users: AdminUser[] }) {
  const summaries = [
    { label: '전체', value: users.length },
    ...ROLES.map((role) => ({
      label: role,
      value: users.filter((user) => user.role === role).length,
    })),
    {
      label: '미인증',
      value: users.filter((user) => !user.email_confirmed_at).length,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {summaries.map((summary) => (
        <div key={summary.label} className="rounded border border-gray-200 bg-white px-3 py-2">
          <p className="text-xs text-gray-500">{summary.label}</p>
          <p className="mt-0.5 text-lg font-semibold text-gray-900">
            {summary.value.toLocaleString()}명
          </p>
        </div>
      ))}
    </div>
  )
}

function ProfileField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-gray-300 px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-gray-600"
      />
    </label>
  )
}

function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser
  onClose: () => void
  onSave: (id: string, profile: ProfilePatch) => Promise<void>
}) {
  const [draft, setDraft] = useState<ProfileDraft>(() => toProfileDraft(user))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changeField = <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.role) {
      setError('역할을 선택해 주세요.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(user.id, { ...draft, role: draft.role })
      onClose()
    } catch (saveError) {
      setError(messageFromError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
        className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="edit-user-title" className="text-base font-semibold text-gray-900">
              가입자 정보 수정
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">{user.email ?? '이메일 없음'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="수정 창 닫기"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
            {!user.has_profile && (
              <p className="sm:col-span-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                이 계정에는 프로필 행이 없어 저장 시 수정할 수 없다는 안내가 표시됩니다.
              </p>
            )}
            <ProfileField
              label="이름"
              value={draft.full_name}
              onChange={(value) => changeField('full_name', value)}
            />
            <ProfileField
              label="연락처"
              value={draft.phone_number}
              onChange={(value) => changeField('phone_number', value)}
            />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">역할</span>
              <select
                value={draft.role}
                onChange={(event) => changeField('role', event.target.value as Role | '')}
                className="w-full rounded border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-gray-600"
              >
                <option value="">역할 선택</option>
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <ProfileField
              label="직책"
              value={draft.position}
              onChange={(value) => changeField('position', value)}
            />
            <ProfileField
              label="본부"
              value={draft.hq_division}
              onChange={(value) => changeField('hq_division', value)}
            />
            <ProfileField
              label="지사"
              value={draft.branch_division}
              onChange={(value) => changeField('branch_division', value)}
            />
            <div className="sm:col-span-2">
              <ProfileField
                label="회사"
                value={draft.company_name}
                onChange={(value) => changeField('company_name', value)}
              />
            </div>
            {error && (
              <p className="sm:col-span-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const loadUsers = useCallback(async (showInitialLoading = false) => {
    if (showInitialLoading) setLoading(true)
    else setRefreshing(true)

    try {
      const result = await adminRequest<UserListResponse>('/api/admin/users')
      if (!Array.isArray(result.users)) throw new Error('가입자 목록 형식이 올바르지 않습니다.')
      setUsers(result.users)
      setError(null)
    } catch (loadError) {
      setError(messageFromError(loadError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers(true)
  }, [loadUsers])

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko-KR')
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false
      if (unconfirmedOnly && user.email_confirmed_at) return false
      if (!keyword) return true

      return [user.full_name, user.email, user.company_name]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('ko-KR').includes(keyword))
    })
  }, [roleFilter, search, unconfirmedOnly, users])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const resetPage = () => setPage(1)

  const handleConfirm = async (user: AdminUser) => {
    setPendingAction(`confirm-${user.id}`)
    setError(null)
    setNotice(null)
    try {
      await adminRequest<SuccessResponse>(`/api/admin/users/${user.id}/confirm`, {
        method: 'POST',
      })
      setNotice(`${user.full_name ?? user.email ?? '가입자'}의 이메일 인증을 처리했습니다.`)
      await loadUsers()
    } catch (confirmError) {
      setError(messageFromError(confirmError))
    } finally {
      setPendingAction(null)
    }
  }

  const handleSave = async (id: string, profile: ProfilePatch) => {
    setPendingAction(`edit-${id}`)
    setError(null)
    setNotice(null)
    try {
      await adminRequest<SuccessResponse>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      setNotice('가입자 정보를 수정했습니다.')
      await loadUsers()
    } finally {
      setPendingAction(null)
    }
  }

  const handleDelete = async (user: AdminUser) => {
    const target = user.full_name ?? user.email ?? '선택한 가입자'
    if (!window.confirm(`${target} 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return

    setPendingAction(`delete-${user.id}`)
    setError(null)
    setNotice(null)
    try {
      await adminRequest<SuccessResponse>(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      })
      setNotice(`${target} 계정을 삭제했습니다.`)
      await loadUsers()
    } catch (deleteError) {
      setError(messageFromError(deleteError))
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">가입자 관리</h2>
          <p className="mt-1 text-sm text-gray-500">가입자 정보와 이메일 인증 상태를 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <SummaryCards users={users} />

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-3">
        <label className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPage()
            }}
            placeholder="이름, 이메일, 회사 검색"
            className="w-full rounded border border-gray-300 py-2 pl-8 pr-3 text-sm text-gray-900 outline-none focus:border-gray-600"
          />
        </label>
        <select
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value as Role | 'all')
            resetPage()
          }}
          aria-label="역할 필터"
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-600"
        >
          <option value="all">전체 역할</option>
          {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 whitespace-nowrap px-1 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={unconfirmedOnly}
            onChange={(event) => {
              setUnconfirmedOnly(event.target.checked)
              resetPage()
            }}
            className="h-4 w-4 rounded border-gray-300"
          />
          미인증만
        </label>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-500">가입자 목록을 불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">이메일</th>
                  <th className="px-3 py-2 font-medium">역할</th>
                  <th className="px-3 py-2 font-medium">본부·지사</th>
                  <th className="px-3 py-2 font-medium">회사</th>
                  <th className="px-3 py-2 font-medium">직책</th>
                  <th className="px-3 py-2 font-medium">가입일</th>
                  <th className="px-3 py-2 font-medium">최근 로그인</th>
                  <th className="px-3 py-2 font-medium">인증 상태</th>
                  <th className="px-3 py-2 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {visibleUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/70">
                    <td className="max-w-36 px-3 py-2">
                      <p className="truncate font-medium text-gray-900">{user.full_name ?? '이름 없음'}</p>
                      {!user.has_profile && <p className="mt-0.5 text-[11px] text-amber-700">프로필 없음</p>}
                    </td>
                    <td className="max-w-52 truncate px-3 py-2" title={user.email ?? undefined}>
                      {user.email ?? '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded px-2 py-0.5 ring-1 ring-inset ${roleBadgeClass(user.role)}`}>
                        {user.role ?? '-'}
                      </span>
                    </td>
                    <td className="max-w-40 px-3 py-2">
                      <p className="truncate">{user.hq_division ?? '-'}</p>
                      {user.branch_division && <p className="truncate text-gray-500">{user.branch_division}</p>}
                    </td>
                    <td className="max-w-40 truncate px-3 py-2" title={user.company_name ?? undefined}>
                      {user.company_name ?? '-'}
                    </td>
                    <td className="max-w-28 truncate px-3 py-2">{user.position ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(user.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(user.last_sign_in_at, true)}</td>
                    <td className="px-3 py-2">
                      {user.email_confirmed_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> 인증
                        </span>
                      ) : (
                        <span className="text-amber-700">미인증</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {!user.email_confirmed_at && (
                          <button
                            type="button"
                            onClick={() => void handleConfirm(user)}
                            disabled={Boolean(pendingAction)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            {pendingAction === `confirm-${user.id}` ? '처리 중' : '인증 처리'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingUser(user)}
                          disabled={Boolean(pendingAction)}
                          className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(user)}
                          disabled={Boolean(pendingAction)}
                          className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {pendingAction === `delete-${user.id}` ? '삭제 중' : '삭제'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-16 text-center text-sm text-gray-500">
                      조건에 맞는 가입자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-3 py-2 text-xs text-gray-600">
            <span>
              검색 결과 {filteredUsers.length.toLocaleString()}명 · 페이지당 {PAGE_SIZE}명
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                aria-label="이전 페이지"
                className="rounded border border-gray-300 p-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>{currentPage.toLocaleString()} / {totalPages.toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                aria-label="다음 페이지"
                className="rounded border border-gray-300 p-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <EditUserModal
          key={editingUser.id}
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSave}
        />
      )}
    </section>
  )
}
