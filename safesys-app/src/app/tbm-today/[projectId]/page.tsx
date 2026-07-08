'use client'
// 상시 TBM QR 랜딩 페이지 — 당일(한국시간) TBM 제출건으로 이동, 없으면 안내 표시

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CalendarX, Shield } from 'lucide-react'

export default function TBMTodayPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const [notFound, setNotFound] = useState<{ date: string; projectName?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return

    let cancelled = false
    const findToday = async () => {
      try {
        const res = await fetch(`/api/tbm-today/${projectId}`)
        const json = await res.json()
        if (cancelled) return

        if (res.ok && json.id) {
          router.replace(`/tbm-view/${json.id}`)
          return
        }
        if (res.status === 404 && json.date) {
          setNotFound({ date: json.date, projectName: json.projectName })
          return
        }
        setError(json.error || '당일 TBM 조회 중 오류가 발생했습니다.')
      } catch {
        if (!cancelled) setError('당일 TBM 조회 중 오류가 발생했습니다.')
      }
    }
    findToday()
    return () => { cancelled = true }
  }, [projectId, router])

  // 금일 제출건 없음 안내
  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <CalendarX className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">금일 TBM 제출건이 없습니다.</h2>
          {notFound.projectName && (
            <p className="mt-2 text-sm font-medium text-gray-700">{notFound.projectName}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">{notFound.date} (한국시간 기준)</p>
          <p className="mt-3 text-xs text-gray-400">TBM 제출 후 QR을 다시 스캔해주세요.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">오류가 발생했습니다</h2>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  // 조회 중
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Shield className="h-8 w-8 text-blue-500" />
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="text-sm text-gray-500">오늘의 TBM 교육 내용을 찾는 중...</p>
      </div>
    </div>
  )
}
