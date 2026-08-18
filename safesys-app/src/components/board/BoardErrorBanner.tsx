'use client'
// 게시판 비동기 작업 실패 내용을 사용자에게 알리는 오류 배너

import { AlertCircle, X } from 'lucide-react'

interface BoardErrorBannerProps {
  message: string | null
  onDismiss?: () => void
}

export default function BoardErrorBanner({ message, onDismiss }: BoardErrorBannerProps) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 min-h-[40px] min-w-[40px] rounded p-2 text-red-500 hover:bg-red-100"
          aria-label="오류 메시지 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
