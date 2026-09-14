'use client'
// 안전현황 신규지구 안전컨설팅 카드 라우트 — Dashboard가 경로로 카드를 선택한다

import Dashboard from '@/components/Dashboard'
import { Suspense } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function SafeNewDistrictConsultingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  )
}
