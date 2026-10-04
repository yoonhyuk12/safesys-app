'use client'

// 프로젝트에 들어올 때마다 현재 안전 공지를 모달로 띄우고 닫기·확인으로 닫는 컴포넌트
import React, { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, X } from 'lucide-react'
import { CURRENT_SAFETY_NOTICE } from '@/lib/safety-notice'

export default function SafetyNoticeModal() {
  const [open, setOpen] = useState(true)
  const notice = CURRENT_SAFETY_NOTICE

  if (!open || !notice) return null

  const close = () => setOpen(false)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="safety-notice-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        {/* 상단 띠 — 사고 공유라는 성격을 색으로 먼저 알린다 */}
        <div className="relative bg-gradient-to-r from-red-600 to-red-700 px-6 pt-6 pb-5 text-white">
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="absolute top-3 right-3 p-2 rounded-md text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-3 pr-8">
            <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/20 ring-4 ring-white/10">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wider uppercase text-red-100">긴급 안전 공지</p>
              <h2 id="safety-notice-title" className="mt-1 text-xl font-bold leading-snug">
                {notice.title}
              </h2>
            </div>
          </div>
        </div>

        {/* 본문 — 사고 개요와 현장 실천 사항 */}
        <div className="px-6 py-5">
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3">
            <Clock className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
            <p className="text-sm font-semibold text-red-800 leading-snug">{notice.headline}</p>
          </div>

          <p className="mt-5 text-xs font-medium text-gray-500 uppercase tracking-wider">현장 실천 사항</p>
          <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
            {notice.items.map((item) => (
              <li key={item} className="flex items-start gap-3 px-4 py-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-blue-600" />
                <span className="text-sm font-medium text-gray-900 leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={close}
            className="w-full min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  )
}
