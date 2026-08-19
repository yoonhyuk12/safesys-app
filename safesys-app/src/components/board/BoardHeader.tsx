'use client'
// 게시판 화면의 뒤로가기와 제목, 우측 동작 버튼을 배치하는 공용 헤더

import type { ReactNode } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'

interface BoardHeaderProps {
  title: string
  onBack: () => void
  action?: ReactNode
  /** 목록처럼 넓은 화면을 쓰는 페이지에서 본문 폭에 맞춰 헤더도 넓힌다 */
  wide?: boolean
}

export default function BoardHeader({ title, onBack, action, wide = false }: BoardHeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div
        className={`mx-auto flex h-16 items-center px-4 sm:px-6 ${
          wide ? 'max-w-7xl lg:max-w-none lg:px-4' : 'max-w-4xl'
        }`}
      >
        <button
          type="button"
          onClick={onBack}
          className="mr-2 flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-blue-600"
          aria-label="뒤로 가기"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <MessageSquare className="mr-2 h-6 w-6 flex-shrink-0 text-blue-600" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 lg:text-xl">
          {title}
        </h1>
        {action && <div className="ml-3 shrink-0">{action}</div>}
      </div>
    </header>
  )
}
