// 안전현황 지사별 공사감독 순회점검 카드 라우트 — Dashboard가 경로로 지사·카드를 선택한다
'use client'

import Dashboard from '@/components/Dashboard'
import { Suspense } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function SafeBranchPatrolLedgerPage() {
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
