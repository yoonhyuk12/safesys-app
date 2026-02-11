'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import SignUpForm from '@/components/auth/SignUpForm'

export default function SignUpPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [termsChecked, setTermsChecked] = useState(false)

  useEffect(() => {
    // 이미 로그인된 사용자는 대시보드로 리다이렉트
    if (user && !loading) {
      router.push('/')
      return
    }

    // 약관 동의 여부 확인
    const agreed = sessionStorage.getItem('termsAgreed')
    if (!agreed) {
      router.push('/signup/terms')
      return
    }

    setTermsChecked(true)
  }, [user, loading, router])

  // 로딩 중이거나 이미 로그인된 경우 또는 약관 미동의 시 빈 화면 표시
  if (loading || user || !termsChecked) {
    return null
  }

  return <SignUpForm />
} 