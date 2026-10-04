// 굴삭기 특별점검 상세보기(읽기 전용) — 굴착기별 판정표, 지적·조치 사진, 현장점검 사진
'use client'

import React from 'react'
import { FileText } from 'lucide-react'
import {
  SPECIAL_770_CATEGORIES,
  SPECIAL_770_CHECKLIST,
  SPECIAL_770_ETC_CODE,
  type Special770InspectionData,
  type Special770Judgement,
} from '@/lib/special-inspection-770/types'
import { excavatorFindings, inspectionStats } from '@/lib/special-inspection-770/summary'
import { SPECIAL_770_CHECKLIST_FILE } from './Special770Checklist'

const JUDGEMENT_BADGE: Record<Special770Judgement, string> = {
  적정: 'bg-green-100 text-green-800',
  부적정: 'bg-red-100 text-red-800',
  해당없음: 'bg-gray-100 text-gray-800',
}

interface Special770DetailProps {
  data: Special770InspectionData | null | undefined
  onEnlarge: (url: string) => void
}

function Photo({ url, label, onEnlarge }: { url: string | null | undefined; label: string; onEnlarge: (url: string) => void }) {
  return (
    <div>
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {url && url !== 'N/A' ? (
        <img src={url} alt={label} className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90" onClick={() => onEnlarge(url)} />
      ) : (
        <div className="w-full h-32 bg-gray-50 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-500">사진 없음</div>
      )}
    </div>
  )
}

export default function Special770Detail({ data, onEnlarge }: Special770DetailProps) {
  const stats = inspectionStats(data)
  const excavators = data?.excavators ?? []
  const sitePhotos = data?.site_photo_urls ?? []

  return (
    <>
      <section>
        <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">2. 굴착기 점검 결과</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-3">
          <div><span className="text-gray-500">점검반:</span> <span className="font-medium">{data?.inspection_team || '-'}</span></div>
          <div><span className="text-gray-500">점검공종:</span> <span className="font-medium">{data?.inspected_work || '-'}</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mb-4">
          <span>굴착기 {stats.excavators}대</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">지적 {stats.findings}건</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">조치완료 {stats.completed}건</span>
          {stats.pending > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">조치중 {stats.pending}건</span>
          )}
        </div>

        {excavators.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 굴착기가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {excavators.map((excavator, index) => {
              const findings = excavatorFindings(excavator)
              return (
                <div key={excavator.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-900">
                    굴착기 {index + 1} · {excavator.vehicle_no || '차량번호 미입력'}
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {SPECIAL_770_CATEGORIES.map(category => {
                      const rows = category.no === 4
                        ? [{ code: SPECIAL_770_ETC_CODE, text: excavator.etc_text?.trim() || '기타 점검 사항' }]
                        : SPECIAL_770_CHECKLIST.filter(item => item.category === category.no)
                      return (
                        <div key={category.no}>
                          <h4 className="text-xs font-semibold text-gray-700 mb-1">{category.no}. {category.title}</h4>
                          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                            {rows.map(row => {
                              const judgement = excavator.items?.[row.code]?.judgement
                              return (
                                <li key={row.code} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                                  <span className="text-gray-600"><span className="text-gray-500 mr-1">{row.code}</span>{row.text}</span>
                                  {judgement ? (
                                    <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${JUDGEMENT_BADGE[judgement]}`}>{judgement}</span>
                                  ) : (
                                    <span className="shrink-0 text-xs text-gray-500">미판정</span>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )
                    })}

                    {excavator.pin_photo_url && (
                      <div className="max-w-xs">
                        <Photo url={excavator.pin_photo_url} label="안전핀 증빙사진" onEnlarge={onEnlarge} />
                      </div>
                    )}

                    {findings.map(f => (
                      <div key={f.code} className="border border-red-100 bg-red-50 rounded-lg p-3 space-y-3">
                        <div className="text-sm font-medium text-gray-900">[{f.code}] {f.itemText}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div><span className="block text-xs text-gray-500 mb-0.5">지적사항</span><p className="text-gray-900 whitespace-pre-wrap">{f.result.finding || '-'}</p></div>
                          <div><span className="block text-xs text-gray-500 mb-0.5">조치(예정)사항</span><p className="text-gray-900 whitespace-pre-wrap">{f.result.action || '-'}</p></div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <Photo url={f.result.before_photo_url} label="조치 전" onEnlarge={onEnlarge} />
                          <Photo url={f.result.after_photo_url} label="조치 후" onEnlarge={onEnlarge} />
                          <div className="col-span-2 md:col-span-1 text-sm">
                            <span className="block text-xs text-gray-500 mb-0.5">조치예정일</span>
                            <span className="text-gray-900">{f.result.action_due_date || '-'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {stats.findings === 0 && sitePhotos.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">3. 현장점검 사진</h3>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {sitePhotos.map((url, i) => (
              <Photo key={url} url={url} label={`사진 ${i + 1}`} onEnlarge={onEnlarge} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">점검표</h3>
        <a
          href={SPECIAL_770_CHECKLIST_FILE}
          download
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FileText className="h-4 w-4" /> 점검표 원본(HWPX)
        </a>
      </section>
    </>
  )
}
