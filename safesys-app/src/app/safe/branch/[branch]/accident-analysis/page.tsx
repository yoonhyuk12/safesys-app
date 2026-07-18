'use client'
// 안전현황 지사별 사고 통계 분석 카드 라우트에서 Dashboard를 렌더링한다.

import Dashboard from '@/components/Dashboard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { Suspense } from 'react'

export default function SafeBranchAccidentAnalysisPage() {
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
