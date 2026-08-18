'use client'
// 게시판 화면의 뒤로가기와 제목, 우측 동작 버튼을 배치하는 공용 헤더

import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

interface BoardHeaderProps {
  title: string
  onBack: () => void
  action?: ReactNode
}

export default function BoardHeader({ title, onBack, action }: BoardHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-4xl items-center px-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mr-2 flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          aria-label="뒤로 가기"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-gray-900 sm:text-xl">
          {title}
        </h1>
        {action && <div className="ml-3 shrink-0">{action}</div>}
      </div>
    </header>
  )
}
