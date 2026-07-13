'use client'
// 근거법령 등을 ⓘ 버튼 클릭 시 팝오버로 보여주는 컴포넌트 (모바일 대응 — hover 아닌 click)

import { useState } from 'react'
import { Info } from 'lucide-react'

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-gray-400 hover:text-blue-600"
        aria-label="근거법령 보기"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          {/* 바깥 클릭 시 닫힘 (모바일 포함) */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-5 top-0 z-50 w-64 max-w-[80vw] whitespace-pre-line rounded-md border border-gray-200 bg-white p-2.5 text-[11px] leading-relaxed text-gray-700 shadow-lg">
            {text}
          </div>
        </>
      )}
    </span>
  )
}
