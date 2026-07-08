'use client'

// 구 단독 페이지 경로 — 재해예방기술지도 현황이 사업현황 카드로 통합되어 /business?card=disasterPrevention으로 보낸다
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function DisasterPreventionContractsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/business?card=disasterPrevention')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}
