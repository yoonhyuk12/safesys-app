/** @jsxImportSource react */
'use client'

// 모바일 관리자 목록의 접힌 요약과 펼친 상세 영역을 제공한다
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function AdminMobileDisclosure({ id, expanded, onToggle, summary, children }: {
  id: string; expanded: boolean; onToggle: () => void; summary: ReactNode; children: ReactNode
}) {
  const contentId = `admin-mobile-detail-${id}`
  return (
    <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${expanded ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={onToggle}
        className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180 text-blue-600' : ''}`} aria-hidden="true" />
      </button>
      {expanded && <div id={contentId} className="border-t border-slate-100 px-4 py-4">{children}</div>}
    </article>
  )
}
