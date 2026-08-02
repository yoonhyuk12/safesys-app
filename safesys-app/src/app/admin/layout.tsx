'use client'

// 관리자 섹션 공통 레이아웃 — 관리자 여부를 서버에 확인하는 가드와 탭 네비게이션
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TABS = [
  { href: '/admin/users', label: '가입자 관리' },
  { href: '/admin/projects', label: '프로젝트 현황' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<'checking' | 'allowed'>('checking')

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

  if (status !== 'allowed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-sm text-gray-500">
        관리자 권한 확인 중...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">SafeSys 관리자</h1>
          <nav className="flex gap-1">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 rounded text-sm ${
                  pathname?.startsWith(tab.href)
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="ml-auto text-sm text-gray-500 hover:text-gray-800">
            메인으로
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
