'use client'

// 5대 핵심이행사항 현황 라우트 — Dashboard thin 래퍼
import Dashboard from '@/components/Dashboard'
import { Suspense } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function SafeFiveKeyPage() {
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
