'use client'
// 요청사항의 처리 상태를 일관된 색상 뱃지로 표시하는 컴포넌트

import { BOARD_STATUS_STYLES, type BoardStatus } from '@/lib/board/types'

interface BoardStatusBadgeProps {
  status: BoardStatus
}

export default function BoardStatusBadge({ status }: BoardStatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${BOARD_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}
