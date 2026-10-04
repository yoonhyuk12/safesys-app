// 특별점검770 결과 단계 — 부적정 항목의 지적사항과 결과 사진을 입력한다.
'use client'

import React, { useEffect } from 'react'
import { SPECIAL_770_CATEGORIES, type Special770InspectionData, type Special770ItemResult } from '@/lib/special-inspection-770/types'
import { inspectionFindings } from '@/lib/special-inspection-770/summary'
import Special770PhotoSlot from './Special770PhotoSlot'
import { fill770ActionDueDates, updateItem, type Special770Setter } from './state'

const MAX_SITE_PHOTOS = 2
const INPUT = 'block w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm bg-white'

interface Special770ResultsProps {
  projectId: string
  data: Special770InspectionData
  setData: Special770Setter
  readOnly?: boolean
  inspectionDate?: string
}

export default function Special770Results({ projectId, data, setData, readOnly, inspectionDate }: Special770ResultsProps) {
  useEffect(() => {
    if (!readOnly && inspectionDate) setData(prev => fill770ActionDueDates(prev, inspectionDate))
  }, [data, inspectionDate, readOnly, setData])
  const findings = inspectionFindings(data)
  const sitePhotos = data.site_photo_urls ?? []

  const setSitePhoto = (slot: number, url: string | null) => {
    setData(prev => {
      const current = prev.site_photo_urls ?? []
      const next = url
        ? (slot < current.length ? current.map((u, i) => (i === slot ? url : u)) : [...current, url])
        : current.filter((_, i) => i !== slot)
      return { ...prev, site_photo_urls: next }
    })
  }

  const siteSlots = readOnly ? sitePhotos.length : Math.min(sitePhotos.length + 1, MAX_SITE_PHOTOS)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">2. 점검결과(굴착기 사용 대수: {data.excavators.length}대)</h3>
      {findings.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 bg-white">
          부적정 항목이 없습니다. 굴착기 점검표에서 부적정으로 선택한 항목의 지적사항을 이곳에서 작성합니다.
        </div>
      )}
      {findings.map(finding => {
        const { excavatorId, code, result } = finding
        const vehicle = finding.vehicleNo.trim() || `굴착기 ${data.excavators.findIndex(exc => exc.id === excavatorId) + 1}`
        const category = SPECIAL_770_CATEGORIES.find(item => item.no === finding.category)
        const onItemChange = (patch: Partial<Special770ItemResult>) => setData(prev => updateItem(prev, excavatorId, code, patch))
        const fieldId = `result-${excavatorId}-${code}`

        return (
          <div key={`${excavatorId}-${code}`} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">{vehicle} · {code}</h4>
                <p className="text-xs text-gray-500 mt-1">{finding.category}. {category?.title}</p>
                <p className="text-sm text-gray-700 mt-1">{finding.itemText}</p>
              </div>
              <div className="w-full sm:w-44 sm:shrink-0">
                <label htmlFor={`${fieldId}-due`} className="block text-xs font-medium text-gray-700 mb-1">조치기한일</label>
                <input
                  id={`${fieldId}-due`}
                  type="date"
                  value={result.action_due_date ?? ''}
                  onChange={e => onItemChange({ action_due_date: e.target.value || null })}
                  disabled={readOnly}
                  className={INPUT}
                />
                {!readOnly && inspectionDate && <p className="mt-1 text-xs text-gray-500">미입력 시 점검일 7일 후로 설정됩니다.</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Special770PhotoSlot
                projectId={projectId}
                url={result.before_photo_url}
                label="조치 전 사진"
                tag={`before_${code}`}
                onChange={url => onItemChange({ before_photo_url: url })}
                readOnly={readOnly}
              />
              <div className="min-w-0 md:col-span-2">
                <label htmlFor={`${fieldId}-finding`} className="block text-xs font-medium text-gray-700 mb-1">지적사항</label>
                <textarea
                  id={`${fieldId}-finding`}
                  value={result.finding ?? ''}
                  onChange={e => onItemChange({ finding: e.target.value })}
                  disabled={readOnly}
                  rows={3}
                  placeholder="지적 내용을 입력하세요."
                  className={`${INPUT} h-28 resize-none`}
                />
              </div>
            </div>
          </div>
        )
      })}

      {findings.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-1">현장점검 사진</h4>
          <p className="text-xs text-gray-500 mb-3">지적사항이 없을 때 결과 사진대지에 들어갑니다. 최대 {MAX_SITE_PHOTOS}장.</p>
          {siteSlots === 0 ? (
            <p className="text-sm text-gray-500">사진 없음</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {Array.from({ length: siteSlots }, (_, i) => (
                <Special770PhotoSlot
                  key={`${i}-${sitePhotos[i] ?? 'empty'}`}
                  projectId={projectId}
                  url={sitePhotos[i]}
                  label={`사진 ${i + 1}`}
                  tag={`site_${i}`}
                  onChange={url => setSitePhoto(i, url)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
