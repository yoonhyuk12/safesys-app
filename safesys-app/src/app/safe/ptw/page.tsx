'use client'

// 작업허가제(PTW) 안전현황 라우트 — Dashboard가 pathname으로 selectedSafetyCard='ptw'를 결정
import Dashboard from '@/components/Dashboard'
import { Suspense } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function SafePtwPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    }>
      <Dashboard />
    </Suspense>
  )
}
