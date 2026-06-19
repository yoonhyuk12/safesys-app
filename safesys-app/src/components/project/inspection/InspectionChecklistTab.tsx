'use client'

// 검측 체크리스트(별지 제5호) 탭 — 요청서에 첨부되는 체크리스트 입력 UI

import React, { useState } from 'react'
import { ClipboardCheck, Sparkles } from 'lucide-react'
import {
  InspectionRequestFormData,
  ChecklistItem,
  PassStatus,
} from '@/lib/inspection/inspection-types'

interface InspectionChecklistTabProps {
  formData: InspectionRequestFormData
  onChange: (data: InspectionRequestFormData) => void
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const cellInputCls =
  'w-full border border-gray-200 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const RESULT_OPTIONS: PassStatus[] = ['', '합격', '불합격']

export default function InspectionChecklistTab({ formData, onChange }: InspectionChecklistTabProps) {
  const [aiLoading, setAiLoading] = useState(false)

  const set = <K extends keyof InspectionRequestFormData>(key: K, value: InspectionRequestFormData[K]) => {
    onChange({ ...formData, [key]: value })
  }

  const setItem = <K extends keyof ChecklistItem>(index: number, key: K, value: ChecklistItem[K]) => {
    const items = formData.checklist_items.map((it, i) => (i === index ? { ...it, [key]: value } : it))
    onChange({ ...formData, checklist_items: items })
  }

  // AI 자동 채우기 — 입력한 공종·시설물 정보로 위키 검사기준 기반 검측항목·검사기준 생성
  const handleAiFill = async () => {
    if (!formData.work_type.trim() && !formData.structure_name.trim()) {
      alert('공종명 또는 시설물명을 먼저 입력해주세요. (검측요청서 탭에서도 입력할 수 있습니다.)')
      return
    }
    const hasContent = formData.checklist_items.some((it) => it.item || it.standard)
    if (hasContent && !confirm('기존 검측 항목을 AI가 생성한 내용으로 덮어쓸까요?')) return

    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/inspection-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workType: formData.work_type,
          facilityName: formData.structure_name,
          location: formData.inspection_part || formData.location_and_type,
          quantity: formData.quantity,
          inspectionItems: formData.inspection_items,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'AI 호출 실패')

      const aiItems: { item: string; standard: string }[] = Array.isArray(data.items) ? data.items : []
      // 생성된 항목으로 item/standard만 채우고, 검사결과·조치사항은 유지
      const merged = formData.checklist_items.map((it, i) => ({
        ...it,
        item: aiItems[i]?.item || '',
        standard: aiItems[i]?.standard || '',
      }))
      onChange({ ...formData, checklist_items: merged })
    } catch (e) {
      alert('AI 자동 채우기 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'))
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 — 시설물명 / 위치 또는 부위 / 공종명 / 물량 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          검측 체크리스트 (별지 제5호)
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>시설물명</label>
            <input
              type="text"
              value={formData.structure_name}
              onChange={(e) => set('structure_name', e.target.value)}
              placeholder="예: 용수로"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>위치 또는 부위</label>
            <input
              type="text"
              value={formData.inspection_part}
              onChange={(e) => set('inspection_part', e.target.value)}
              placeholder="예: STA.0+200 ~ 0+350"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>공종명</label>
            <input
              type="text"
              value={formData.work_type}
              onChange={(e) => set('work_type', e.target.value)}
              placeholder="예: 토공"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>물량(길이 면적 등)</label>
            <input
              type="text"
              value={formData.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              placeholder="예: 150m"
              className={inputCls}
            />
          </div>
        </div>
        <p className="px-3 pb-3 text-[11px] text-gray-400">
          ※ 시설물명·위치·공종명·물량은 「검측요청서」 탭의 구조물명·검측부위·공종·수량과 자동 연동됩니다.
        </p>
      </div>

      {/* 검측 항목 표 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 border-b border-gray-300 flex items-center justify-between gap-2">
          <span className="font-semibold text-sm">검측 항목</span>
          <button
            type="button"
            onClick={handleAiFill}
            disabled={aiLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            title="입력한 공종·시설물 정보로 검사기준 기반 검측 항목을 AI가 작성합니다"
          >
            <Sparkles className="h-4 w-4" />
            {aiLoading ? 'AI 작성 중...' : 'AI 자동 채우기'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead className="bg-[#EBF1F5] text-gray-800">
              <tr>
                <th className="px-2 py-2 font-semibold border border-gray-200 w-10">No</th>
                <th className="px-2 py-2 font-semibold border border-gray-200">검측 항목</th>
                <th className="px-2 py-2 font-semibold border border-gray-200">검사기준(시방서·도면)</th>
                <th className="px-2 py-2 font-semibold border border-gray-200 w-24">시공자<br />(합/불)</th>
                <th className="px-2 py-2 font-semibold border border-gray-200 w-24">감독원<br />(합/불)</th>
                <th className="px-2 py-2 font-semibold border border-gray-200">조치사항</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {formData.checklist_items.map((it, i) => (
                <tr key={i}>
                  <td className="px-1 py-1 text-center text-gray-400 border border-gray-200">{i + 1}</td>
                  <td className="px-1 py-1 border border-gray-200">
                    <input
                      type="text"
                      value={it.item}
                      onChange={(e) => setItem(i, 'item', e.target.value)}
                      className={cellInputCls}
                    />
                  </td>
                  <td className="px-1 py-1 border border-gray-200">
                    <input
                      type="text"
                      value={it.standard}
                      onChange={(e) => setItem(i, 'standard', e.target.value)}
                      className={cellInputCls}
                    />
                  </td>
                  <td className="px-1 py-1 border border-gray-200">
                    <select
                      value={it.contractor_result}
                      onChange={(e) => setItem(i, 'contractor_result', e.target.value as PassStatus)}
                      className={cellInputCls}
                    >
                      {RESULT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt || '-'}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1 border border-gray-200">
                    <select
                      value={it.supervisor_result}
                      onChange={(e) => setItem(i, 'supervisor_result', e.target.value as PassStatus)}
                      className={cellInputCls}
                    >
                      {RESULT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt || '-'}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1 border border-gray-200">
                    <input
                      type="text"
                      value={it.action}
                      onChange={(e) => setItem(i, 'action', e.target.value)}
                      className={cellInputCls}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-[11px] text-gray-400">
          ※ 검사결과는 시공자 점검(상단)과 감독원 검측(하단)으로 출력됩니다. 매몰부분 등은 검측 사진을 별도 첨부하세요.
        </p>
      </div>

      {/* 푸터 — 점검/검측 일자 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>시공자 점검일자</label>
            <input
              type="date"
              value={formData.contractor_check_date || ''}
              onChange={(e) => set('contractor_check_date', e.target.value || null)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>감독원 검측일자</label>
            <input
              type="date"
              value={formData.supervisor_check_date || ''}
              onChange={(e) => set('supervisor_check_date', e.target.value || null)}
              className={inputCls}
            />
          </div>
        </div>
        <p className="px-3 pb-3 text-[11px] text-gray-400">
          ※ 현장대리인·감독원 서명은 「검측요청서」 탭의 서명을 사용합니다.
        </p>
      </div>
    </div>
  )
}
