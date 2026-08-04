'use client'

// 관리자 섹션 공통 레이아웃 — 관리자 여부를 서버에 확인하는 가드와 반응형 콘솔 셸, 로그아웃
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FolderKanban, Home, LogOut, PanelLeftClose, PanelLeftOpen, ShieldCheck, UsersRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { performAdminSignOut } from '@/lib/admin-session'

const TABS = [
  { href: '/admin/users', label: '가입자 관리', icon: UsersRound },
  { href: '/admin/projects', label: '프로젝트 현황', icon: FolderKanban },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<'checking' | 'allowed'>('checking')
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const lastTouchToggleRef = useRef(0)

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev)

  // 사이드바 빈 공간: 마우스는 더블클릭, 터치는 한 번 탭으로 접고 펼친다
  const handleBlankDoubleClick = () => {
    // 터치 기기에서 탭 직후 합성 dblclick이 뒤따라 토글이 상쇄되는 것을 막는다
    if (Date.now() - lastTouchToggleRef.current < 700) return
    toggleSidebar()
  }

  const handleBlankTouchEnd = () => {
    lastTouchToggleRef.current = Date.now()
    toggleSidebar()
  }

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }
      try {
        const res = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const result = await res.json()
        if (cancelled) return
        if (!result?.isAdmin) {
          alert('관리자 권한이 없습니다.')
          router.replace('/')
          return
        }
        if (!result?.otpVerified) {
          // 인증번호 로그인이 아니면 로그인 화면에서 admin 아이디로 다시 로그인하게 한다
          router.replace('/login')
          return
        }
        setStatus('allowed')
      } catch {
        if (!cancelled) router.replace('/')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [router])

  const handleSignOut = async () => {
    setSigningOut(true)
    setLogoutError(null)
    try {
      await performAdminSignOut(
        () => supabase.auth.signOut(),
        (path) => router.replace(path)
      )
    } catch {
      setLogoutError('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSigningOut(false)
    }
  }

  if (status !== 'allowed') {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 px-4">
        <div className="flex flex-col items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0b1730] text-white shadow-lg shadow-slate-900/10">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </span>
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-slate-500">관리자 권한 확인 중</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 hidden flex-col bg-[#0b1730] transition-[width] duration-200 md:flex ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div
          className={`flex py-6 ${
            sidebarCollapsed ? 'flex-col items-center gap-3 px-3' : 'items-center gap-3 px-5'
          }`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          {!sidebarCollapsed && (
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">SafeSys</span>
              <span className="block text-xs text-slate-400">관리자 콘솔</span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 outline-none transition hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-blue-400 ${
              sidebarCollapsed ? '' : 'ml-auto'
            }`}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {TABS.map((tab) => {
            const active = pathname?.startsWith(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                title={sidebarCollapsed ? tab.label : undefined}
                className={`flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold transition ${
                  sidebarCollapsed ? 'justify-center' : 'gap-3'
                } ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!sidebarCollapsed && <span className="truncate">{tab.label}</span>}
              </Link>
            )
          })}
        </nav>
        <div
          className="flex-1 select-none"
          onDoubleClick={handleBlankDoubleClick}
          onTouchEnd={handleBlankTouchEnd}
          title={sidebarCollapsed ? '두 번 클릭하거나 터치하면 펼쳐집니다' : '두 번 클릭하거나 터치하면 접힙니다'}
          aria-hidden="true"
        />
        <Link
          href="/"
          title={sidebarCollapsed ? '메인으로' : undefined}
          className={`mx-3 mb-5 flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white ${
            sidebarCollapsed ? 'justify-center' : 'gap-3'
          }`}
        >
          <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!sidebarCollapsed && <span className="truncate">메인으로</span>}
        </Link>
      </aside>

      <header className="sticky top-0 z-40 bg-[#0b1730] md:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" title="메인으로">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-bold text-white">SafeSys 관리자</span>
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm font-semibold text-slate-100 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {signingOut ? '로그아웃 중' : '로그아웃'}
          </button>
        </div>
        <nav className="grid grid-cols-2 gap-1 px-3 pb-3">
          {TABS.map((tab) => {
            const active = pathname?.startsWith(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <div className={`transition-[padding] duration-200 ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-60'}`}>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-8 md:py-8">
          <div className="mb-4 hidden justify-end md:flex">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {signingOut ? '로그아웃 중' : '로그아웃'}
            </button>
          </div>
          {logoutError && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {logoutError}
            </div>
          )}
          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}
