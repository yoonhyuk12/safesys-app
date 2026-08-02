'use client'

import { useAuth } from '@/contexts/AuthContext'
import LoginForm from '@/components/auth/LoginForm'
import Dashboard from '@/components/Dashboard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'

function HomeContent() {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (loading) return
    if (!user) return

    // userProfile이 로드될 때까지 대기 (회원가입 직후 프로필 로딩 보장)
    if (!userProfile) return

    let cancelled = false
    const redirect = async () => {
      // admin 계정은 관리자 페이지로 우선 이동
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const res = await fetch('/api/admin/me', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const result = await res.json()
          if (!cancelled && result?.isAdmin && result?.otpVerified) {
            router.replace('/admin')
            return
          }
        }
      } catch {
        // 관리자 확인 실패 시 일반 리다이렉트로 진행
      }
      if (cancelled) return

      // 안전 관련 쿼리 파라미터가 있으면 /safe로, 아니면 /tbm으로 리다이렉트
      if (searchParams.get('selectedSafetyBranch')) {
        router.replace('/safe')
      } else {
        router.replace('/tbm')
      }
    }
    redirect()
    return () => {
      cancelled = true
    }
  }, [user, userProfile, loading, searchParams, router])

  // 로딩 중이거나 user는 있지만 userProfile이 아직 로드되지 않은 경우
  if (loading || (user && !userProfile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // 로그인된 사용자는 리다이렉트 중, 비로그인 사용자는 로그인 폼
  return user ? null : <LoginForm />
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
