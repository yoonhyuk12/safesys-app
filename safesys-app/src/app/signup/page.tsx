'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import SignUpForm from '@/components/auth/SignUpForm'

export default function SignUpPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    // 이미 로그인된 사용자는 대시보드로 리다이렉트
    if (user && !loading) {
      router.push('/')
    }
  }, [user, loading, router])

  // 로딩 중이거나 이미 로그인된 경우 빈 화면 표시
  if (loading || user) {
    return null
  }

  return <SignUpForm />
} 