'use client'

// 관리자 가입자 목록과 인증·수정·삭제 작업을 제공하는 클라이언트 화면
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, HardHat, Landmark,
  Pencil, RefreshCw, Search, Trash2, UserCheck, UsersRound, X, type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { nextSortState, sortRows, type SortState } from '@/lib/admin-sort'
import {
  ADMIN_USER_SORT_OPTIONS,
  getAdminUserSortValue,
  type AdminUserSortKey,
} from '@/lib/admin-list-sort'
import { AdminMobileDisclosure } from '@/components/admin/AdminMobileDisclosure'
import { AdminMonthlySignupChart, type ChartFocus } from '@/components/admin/AdminMonthlySignupChart'
import { MobileSortControls, SortableHeader } from '@/components/admin/AdminSortControls'

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

interface UserActions {
  pendingAction: string | null
  onConfirm: (user: AdminUser) => void
  onEdit: (user: AdminUser) => void
  onDelete: (user: AdminUser) => void
}

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
  return 'bg-slate-50 text-slate-500 ring-slate-200'
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

const SUMMARY_TONES = {
  blue: 'bg-blue-50 text-blue-700',
  mint: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
} as const

type SummaryTone = keyof typeof SUMMARY_TONES

interface SummaryItem {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  tone: SummaryTone
  focusKey: ChartFocus
  highlight?: boolean
}

const ROLE_SUMMARY_META: Record<Role, { icon: LucideIcon; tone: SummaryTone }> = {
  발주청: { icon: Landmark, tone: 'blue' },
  감리단: { icon: ClipboardCheck, tone: 'amber' },
  시공사: { icon: HardHat, tone: 'mint' },
}

function buildUserSummaries(users: AdminUser[]): SummaryItem[] {
  return [
    { label: '전체', value: users.length, hint: '등록 계정', icon: UsersRound, tone: 'blue', focusKey: 'all' },
    ...ROLES.map((role) => ({
      label: role,
      value: users.filter((user) => user.role === role).length,
      hint: '역할 배정',
      focusKey: role,
      ...ROLE_SUMMARY_META[role],
    })),
    {
      label: '미인증',
      value: users.filter((user) => !user.email_confirmed_at).length,
      hint: '이메일 확인 대기',
      icon: Clock3,
      tone: 'amber',
      focusKey: 'unconfirmed',
      highlight: true,
    },
  ]
}

function summaryAriaLabel(summary: SummaryItem, active: boolean): string {
  const count = `${summary.label} ${summary.value.toLocaleString()}명`
  if (summary.focusKey === 'all') return `${count}, 누르면 그래프를 전체 가입자로 표시합니다`
  if (active) return `${count}, 그래프에 적용 중, 누르면 전체 가입자로 되돌립니다`
  return `${count}, 누르면 그래프를 ${summary.label}만 표시합니다`
}

function SummaryCards({ users, focus, onFocusChange }: {
  users: AdminUser[]
  focus: ChartFocus
  onFocusChange: (focus: ChartFocus) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:gap-3 md:overflow-visible md:pb-0">
      {buildUserSummaries(users).map((summary) => {
        const Icon = summary.icon
        const active = focus === summary.focusKey
        return (
          <button
            key={summary.label}
            type="button"
            aria-pressed={active}
            aria-label={summaryAriaLabel(summary, active)}
            onClick={() => onFocusChange(active && summary.focusKey !== 'all' ? 'all' : summary.focusKey)}
            className={`min-w-[132px] shrink-0 rounded-2xl border p-3 text-left shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 md:w-full md:min-w-0 md:shrink md:p-4 ${
              summary.highlight
                ? 'border-amber-200 bg-amber-50/70 hover:border-amber-300'
                : 'border-slate-200 bg-white hover:border-slate-300'
            } ${active ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${SUMMARY_TONES[summary.tone]}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="truncate text-xs font-semibold text-slate-500">{summary.label}</p>
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">
              {summary.value.toLocaleString()}
              <span className="ml-0.5 text-sm font-semibold text-slate-500">명</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{summary.hint}</p>
          </button>
        )
      })}
    </div>
  )
}

function UsersFilterPanel({
  search, roleFilter, unconfirmedOnly, onSearchChange, onRoleChange, onUnconfirmedChange,
}: {
  search: string
  roleFilter: Role | 'all'
  unconfirmedOnly: boolean
  onSearchChange: (value: string) => void
  onRoleChange: (value: Role | 'all') => void
  onUnconfirmedChange: (value: boolean) => void
}) {
  return (
    <div className="grid gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center md:gap-3 md:p-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={(event) => onSearchChange(event.target.value)}
          placeholder="이름, 이메일, 회사 검색" aria-label="가입자 검색"
          className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <select
        value={roleFilter} onChange={(event) => onRoleChange(event.target.value as Role | 'all')} aria-label="역할 필터"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        <option value="all">전체 역할</option>
        {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 md:whitespace-nowrap">
        <input
          type="checkbox" checked={unconfirmedOnly} onChange={(event) => onUnconfirmedChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-200"
        />
        미인증만
      </label>
    </div>
  )
}

function ConfirmedBadge({ confirmed }: { confirmed: boolean }) {
  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 인증
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> 미인증
    </span>
  )
}

function UserRowActions({ user, actions }: { user: AdminUser; actions: UserActions }) {
  const busy = Boolean(actions.pendingAction)
  return (
    <div className="flex justify-end gap-1">
      {!user.email_confirmed_at && (
        <button
          type="button" onClick={() => actions.onConfirm(user)} disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 font-semibold text-emerald-700 outline-none transition hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {actions.pendingAction === `confirm-${user.id}` ? '처리 중' : '인증 처리'}
        </button>
      )}
      <button
        type="button" onClick={() => actions.onEdit(user)} disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> 수정
      </button>
      <button
        type="button" onClick={() => actions.onDelete(user)} disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 font-semibold text-red-700 outline-none transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {actions.pendingAction === `delete-${user.id}` ? '삭제 중' : '삭제'}
      </button>
    </div>
  )
}

function UserTableRow({ user, actions }: { user: AdminUser; actions: UserActions }) {
  return (
    <tr className="transition hover:bg-slate-50">
      <td className="max-w-36 px-3 py-3">
        <p className="truncate font-semibold text-slate-950">{user.full_name ?? '이름 없음'}</p>
        {!user.has_profile && <p className="mt-0.5 text-[11px] font-medium text-amber-700">프로필 없음</p>}
      </td>
      <td className="max-w-52 truncate px-3 py-3" title={user.email ?? undefined}>{user.email ?? '-'}</td>
      <td className="px-3 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${roleBadgeClass(user.role)}`}>
          {user.role ?? '-'}
        </span>
      </td>
      <td className="max-w-40 px-3 py-3">
        <p className="truncate">{user.hq_division ?? '-'}</p>
        {user.branch_division && <p className="truncate text-slate-500">{user.branch_division}</p>}
      </td>
      <td className="max-w-40 truncate px-3 py-3" title={user.company_name ?? undefined}>{user.company_name ?? '-'}</td>
      <td className="max-w-28 truncate px-3 py-3">{user.position ?? '-'}</td>
      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatDate(user.created_at)}</td>
      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatDate(user.last_sign_in_at, true)}</td>
      <td className="px-3 py-3"><ConfirmedBadge confirmed={Boolean(user.email_confirmed_at)} /></td>
      <td className="px-3 py-3"><UserRowActions user={user} actions={actions} /></td>
    </tr>
  )
}

function UsersTable({ users, sortState, onSort, actions }: {
  users: AdminUser[]
  sortState: SortState<AdminUserSortKey>
  onSort: (key: AdminUserSortKey) => void
  actions: UserActions
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <SortableHeader label="이름" sortKey="name" sortState={sortState} onSort={onSort} />
              <SortableHeader label="이메일" sortKey="email" sortState={sortState} onSort={onSort} />
              <SortableHeader label="역할" sortKey="role" sortState={sortState} onSort={onSort} />
              <SortableHeader label="본부·지사" sortKey="organization" sortState={sortState} onSort={onSort} />
              <SortableHeader label="회사" sortKey="company" sortState={sortState} onSort={onSort} />
              <SortableHeader label="직책" sortKey="position" sortState={sortState} onSort={onSort} />
              <SortableHeader label="가입일" sortKey="createdAt" sortState={sortState} onSort={onSort} />
              <SortableHeader label="최근 로그인" sortKey="lastSignInAt" sortState={sortState} onSort={onSort} />
              <SortableHeader label="인증 상태" sortKey="confirmed" sortState={sortState} onSort={onSort} />
              <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-600">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {users.map((user) => <UserTableRow key={user.id} user={user} actions={actions} />)}
            {users.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-16 text-center text-sm text-slate-500">
                  조건에 맞는 가입자가 없습니다. 검색어나 필터를 해제하면 더 많은 가입자를 볼 수 있습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UserMobileSummary({ user }: { user: AdminUser }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 font-bold text-blue-700">
        {(user.full_name ?? user.email ?? '?').slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-slate-950">
          {user.full_name ?? '이름 없음'} · {user.role ?? '역할 없음'}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{user.email ?? '이메일 없음'}</span>
      </span>
      <span
        className={user.email_confirmed_at
          ? 'shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'
          : 'shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700'}
      >
        {user.email_confirmed_at ? '인증' : '대기'}
      </span>
    </div>
  )
}

function DetailItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 truncate font-medium tabular-nums text-slate-700">{value}</dd>
    </div>
  )
}

function UserMobileDetails({ user }: { user: AdminUser }) {
  return (
    <>
      {!user.has_profile && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          이 계정에는 프로필 행이 없습니다.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <DetailItem label="소속" value={[user.hq_division, user.branch_division].filter(Boolean).join(' · ') || '-'} />
        <DetailItem label="회사" value={user.company_name ?? '-'} />
        <DetailItem label="직책" value={user.position ?? '-'} />
        <DetailItem label="가입일" value={formatDate(user.created_at)} />
        <DetailItem label="최근 로그인" value={formatDate(user.last_sign_in_at, true)} wide />
      </dl>
    </>
  )
}

function UserMobileActions({ user, actions }: { user: AdminUser; actions: UserActions }) {
  const busy = Boolean(actions.pendingAction)
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {!user.email_confirmed_at && (
        <button
          type="button" onClick={() => actions.onConfirm(user)} disabled={busy}
          className="col-span-2 min-h-11 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white outline-none transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          {actions.pendingAction === `confirm-${user.id}` ? '처리 중' : '인증 처리'}
        </button>
      )}
      <button
        type="button" onClick={() => actions.onEdit(user)} disabled={busy}
        className="min-h-11 rounded-xl bg-[#15396f] px-3 text-sm font-semibold text-white outline-none transition hover:bg-[#1c4886] focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      >
        정보 수정
      </button>
      <button
        type="button" onClick={() => actions.onDelete(user)} disabled={busy}
        className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 outline-none transition hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      >
        {actions.pendingAction === `delete-${user.id}` ? '삭제 중' : '계정 삭제'}
      </button>
    </div>
  )
}

function UsersMobileList({ users, expandedUserId, onToggle, actions }: {
  users: AdminUser[]
  expandedUserId: string | null
  onToggle: (id: string) => void
  actions: UserActions
}) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm md:hidden">
        조건에 맞는 가입자가 없습니다.
        <span className="mt-1 block text-xs text-slate-400">검색어나 필터를 해제하면 더 많은 가입자를 볼 수 있습니다.</span>
      </div>
    )
  }

  return (
    <div className="grid gap-2 md:hidden">
      {users.map((user) => (
        <AdminMobileDisclosure
          key={user.id}
          id={user.id}
          expanded={expandedUserId === user.id}
          onToggle={() => onToggle(user.id)}
          summary={<UserMobileSummary user={user} />}
        >
          <UserMobileDetails user={user} />
          <UserMobileActions user={user} actions={actions} />
        </AdminMobileDisclosure>
      ))}
    </div>
  )
}

function PaginationBar({ total, currentPage, totalPages, onPrev, onNext }: {
  total: number
  currentPage: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}) {
  const stepClass = 'grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-sm md:px-4">
      <span className="tabular-nums">
        검색 결과 {total.toLocaleString()}명 · 페이지당 {PAGE_SIZE}명
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={currentPage === 1} aria-label="이전 페이지" className={stepClass}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="w-16 text-center font-semibold tabular-nums text-slate-700">
          {currentPage.toLocaleString()} / {totalPages.toLocaleString()}
        </span>
        <button type="button" onClick={onNext} disabled={currentPage === totalPages} aria-label="다음 페이지" className={stepClass}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

const FIELD_CLASS = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

function ProfileField({ label, value, onChange }: {
  label: string; value: string; onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className={FIELD_CLASS} />
    </label>
  )
}

function EditUserModal({ user, onClose, onSave }: {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div
        role="dialog" aria-modal="true" aria-labelledby="edit-user-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl shadow-slate-950/20"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="edit-user-title" className="text-base font-bold text-slate-950">가입자 정보 수정</h2>
            <p className="mt-0.5 text-xs text-slate-500">{user.email ?? '이메일 없음'}</p>
          </div>
          <button
            type="button" onClick={onClose} disabled={saving} aria-label="수정 창 닫기"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-400 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
            {!user.has_profile && (
              <p className="sm:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                이 계정에는 프로필 행이 없어 저장 시 수정할 수 없다는 안내가 표시됩니다.
              </p>
            )}
            <ProfileField label="이름" value={draft.full_name} onChange={(value) => changeField('full_name', value)} />
            <ProfileField label="연락처" value={draft.phone_number} onChange={(value) => changeField('phone_number', value)} />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">역할</span>
              <select
                value={draft.role}
                onChange={(event) => changeField('role', event.target.value as Role | '')}
                className={FIELD_CLASS}
              >
                <option value="">역할 선택</option>
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <ProfileField label="직책" value={draft.position} onChange={(value) => changeField('position', value)} />
            <ProfileField label="본부" value={draft.hq_division} onChange={(value) => changeField('hq_division', value)} />
            <ProfileField label="지사" value={draft.branch_division} onChange={(value) => changeField('branch_division', value)} />
            <div className="sm:col-span-2">
              <ProfileField label="회사" value={draft.company_name} onChange={(value) => changeField('company_name', value)} />
            </div>
            {error && (
              <p role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <button
              type="button" onClick={onClose} disabled={saving}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit" disabled={saving}
              className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
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
  const [sortState, setSortState] = useState<SortState<AdminUserSortKey>>({ key: null, direction: null })
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [chartFocus, setChartFocus] = useState<ChartFocus>('all')
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
      setExpandedUserId(null)
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

  const sortedUsers = useMemo(
    () => sortRows(filteredUsers, sortState, getAdminUserSortValue),
    [filteredUsers, sortState]
  )
  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleUsers = sortedUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const resetListPosition = () => {
    setPage(1)
    setExpandedUserId(null)
  }

  const goToPage = (nextPage: number) => {
    setPage(nextPage)
    setExpandedUserId(null)
  }

  const handleSort = (key: AdminUserSortKey) => {
    setSortState((current) => nextSortState(current, key))
    resetListPosition()
  }

  const handleMobileSortChange = (state: SortState<AdminUserSortKey>) => {
    setSortState(state)
    resetListPosition()
  }

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

  const actions: UserActions = {
    pendingAction,
    onConfirm: (user) => void handleConfirm(user),
    onEdit: (user) => setEditingUser(user),
    onDelete: (user) => void handleDelete(user),
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.18em] text-blue-600">MEMBER DIRECTORY</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">가입자 관리</h2>
          <p className="mt-1 text-sm text-slate-500">가입자 정보와 이메일 인증 상태를 관리합니다.</p>
        </div>
        <button
          type="button" onClick={() => void loadUsers()} disabled={refreshing || loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          새로고침
        </button>
      </div>

      <SummaryCards users={users} focus={chartFocus} onFocusChange={setChartFocus} />

      <AdminMonthlySignupChart users={users} focus={chartFocus} />

      <UsersFilterPanel
        search={search}
        roleFilter={roleFilter}
        unconfirmedOnly={unconfirmedOnly}
        onSearchChange={(value) => {
          setSearch(value)
          resetListPosition()
        }}
        onRoleChange={(value) => {
          setRoleFilter(value)
          resetListPosition()
        }}
        onUnconfirmedChange={(value) => {
          setUnconfirmedOnly(value)
          resetListPosition()
        }}
      />

      <MobileSortControls
        options={ADMIN_USER_SORT_OPTIONS}
        sortState={sortState}
        onChange={handleMobileSortChange}
      />

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500 shadow-sm">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden="true" />
          가입자 목록을 불러오는 중...
        </div>
      ) : (
        <>
          <UsersMobileList
            users={visibleUsers}
            expandedUserId={expandedUserId}
            onToggle={(id) => setExpandedUserId((current) => (current === id ? null : id))}
            actions={actions}
          />
          <UsersTable users={visibleUsers} sortState={sortState} onSort={handleSort} actions={actions} />
          <PaginationBar
            total={sortedUsers.length}
            currentPage={currentPage}
            totalPages={totalPages}
            onPrev={() => goToPage(Math.max(1, currentPage - 1))}
            onNext={() => goToPage(Math.min(totalPages, currentPage + 1))}
          />
        </>
      )}

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
