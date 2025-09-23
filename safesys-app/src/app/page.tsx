'use client'

import { useAuth } from '@/contexts/AuthContext'
import LoginForm from '@/components/auth/LoginForm'
import Dashboard from '@/components/Dashboard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

function HomeContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (loading) return
    if (!user) return
    // 안전 관련 쿼리 파라미터가 있으면 /safe로, 아니면 /list로 리다이렉트
    if (searchParams.get('selectedSafetyBranch')) {
      router.replace('/safe')
    } else {
      router.replace('/list')
    }
  }, [user, loading, searchParams, router])

  if (loading) {
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
