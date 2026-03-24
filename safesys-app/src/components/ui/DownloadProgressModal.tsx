'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'

interface DownloadProgressModalProps {
  current: number
  total: number
  stage: string
  title?: string
}

export default function DownloadProgressModal({ current, total, stage, title = '문서 다운로드' }: DownloadProgressModalProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-80 space-y-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        </div>

        <div className="space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{stage} ({current}/{total})</span>
            <span className="font-medium text-blue-600">{percent}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
