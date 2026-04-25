'use client'

import React from 'react'

interface CopyrightNoticeProps {
  className?: string
  withDivider?: boolean
}

const COPYRIGHT_YEAR = 2026
const COPYRIGHT_HOLDER = 'yoonhyuk'
const LEGAL_NOTICE =
  '본 시스템의 UI 디자인 및 기능 로직은 관련 법령에 의해 보호받으며, 무단 복제·배포·유사 결과물 제작 시 법적 책임을 질 수 있습니다.'

export default function CopyrightNotice({
  className = '',
  withDivider = true,
}: CopyrightNoticeProps) {
  return (
    <div
      className={`text-center space-y-2 ${withDivider ? 'pt-6 mt-2 border-t border-gray-100' : ''} ${className}`}
    >
      <p className="text-xs text-gray-500">
        Copyright {COPYRIGHT_YEAR}. {COPYRIGHT_HOLDER}. All rights reserved.
      </p>
      <p className="text-[11px] leading-relaxed text-gray-400 px-2">
        {LEGAL_NOTICE}
      </p>
    </div>
  )
}
