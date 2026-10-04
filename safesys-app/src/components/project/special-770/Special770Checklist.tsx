// 굴삭기 특별점검 점검표 단계 — 점검표 원본 링크와 굴착기별 판정 입력
'use client'

import React from 'react'
import { FileText, Plus, X } from 'lucide-react'
import type { Special770InspectionData } from '@/lib/special-inspection-770/types'
import { inspectionStats } from '@/lib/special-inspection-770/summary'
import Special770ExcavatorCard from './Special770ExcavatorCard'
import { createEmptyExcavator, removeExcavator, type Special770Setter } from './state'

export const SPECIAL_770_CHECKLIST_FILE = '/특별점검(굴삭기 버킷 사고) 점검표.hwpx'

interface Special770ChecklistProps {
  projectId: string
  data: Special770InspectionData
  setData: Special770Setter
  readOnly?: boolean
}

export default function Special770Checklist({ projectId, data, setData, readOnly }: Special770ChecklistProps) {
  const stats = inspectionStats(data)
  const tabsId = React.useId()
  const [selectedId, setSelectedId] = React.useState(() => data.excavators[0]?.id)
  const activeId = data.excavators.find(excavator => excavator.id === selectedId)?.id ?? data.excavators[0]?.id

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = data.excavators.length - 1
    const next = event.key === 'ArrowRight' ? (index + 1) % data.excavators.length
      : event.key === 'ArrowLeft' ? (index + last) % data.excavators.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
    if (next === null) return
    event.preventDefault()
    setSelectedId(data.excavators[next].id)
    event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>굴착기 {stats.excavators}대</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">지적 {stats.findings}건</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">조치완료 {stats.completed}건</span>
        </div>
        <a
          href={SPECIAL_770_CHECKLIST_FILE}
          download
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FileText className="h-4 w-4" /> 점검표 원본(HWPX)
        </a>
      </div>

      {data.excavators.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 bg-white">
          등록된 굴착기가 없습니다.
        </div>
      )}

      {(data.excavators.length > 0 || !readOnly) && (
        <div role="tablist" aria-label="굴착기 선택" className="flex flex-wrap gap-2">
          {data.excavators.map((excavator, index) => (
            <div key={excavator.id} className={`inline-flex items-center rounded-lg border ${excavator.id === activeId ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
              <button
                type="button"
                role="tab"
                id={`${tabsId}-tab-${excavator.id}`}
                aria-controls={`${tabsId}-panel-${excavator.id}`}
                aria-selected={excavator.id === activeId}
                tabIndex={excavator.id === activeId ? 0 : -1}
                onClick={() => setSelectedId(excavator.id)}
                onKeyDown={event => handleTabKeyDown(event, index)}
                className={`min-h-[44px] px-4 py-2 text-sm font-medium ${readOnly ? 'rounded-lg' : 'rounded-l-lg'} transition-colors ${excavator.id === activeId ? 'text-white hover:bg-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                굴착기 {index + 1}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`굴착기 ${index + 1}${excavator.vehicle_no.trim() ? ` (${excavator.vehicle_no.trim()})` : ''} 삭제`}
                  onClick={() => {
                    const label = excavator.vehicle_no.trim() || `굴착기 ${index + 1}`
                    if (!window.confirm(`${label}의 점검 내용을 삭제할까요?`)) return
                    setData(prev => removeExcavator(prev, excavator.id))
                  }}
                  className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-sm rounded-r-lg transition-colors ${excavator.id === activeId ? 'text-white hover:bg-blue-700' : 'text-red-600 hover:bg-red-50'}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              aria-label="굴착기 추가"
              onClick={() => {
                const excavator = createEmptyExcavator()
                setData(prev => ({ ...prev, excavators: [...prev.excavators, excavator] }))
                setSelectedId(excavator.id)
              }}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {data.excavators.map((excavator, index) => (
        <div
          key={excavator.id}
          role="tabpanel"
          id={`${tabsId}-panel-${excavator.id}`}
          aria-labelledby={`${tabsId}-tab-${excavator.id}`}
          hidden={excavator.id !== activeId}
          tabIndex={excavator.id === activeId ? 0 : -1}
        >
          {excavator.id === activeId && (
            <Special770ExcavatorCard
              projectId={projectId}
              index={index}
              excavator={excavator}
              setData={setData}
              readOnly={readOnly}
            />
          )}
        </div>
      ))}
    </div>
  )
}
