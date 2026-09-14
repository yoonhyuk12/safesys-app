'use client'

// 장비 일일점검 작성 폼 — 기본사항, 원문 항목별 적합/부적합/해당없음, 점검자 직접 서명을 받는다.

import { useState } from 'react'
import { PenTool } from 'lucide-react'
import SignaturePad from '@/components/ui/SignaturePad'
import type { EquipmentChecklist, EquipmentInspectionResult } from '@/lib/equipment-inspection-types'
import {
  EQUIPMENT_INSPECTION_RESULTS,
  EQUIPMENT_INSPECTION_RESULT_LABELS,
  EQUIPMENT_INSPECTOR_NAME_MAX,
  editEquipmentInspectionDraft,
  isBlankEquipmentSignature,
  setEquipmentAnswerNote,
  setEquipmentAnswerResult,
  unansweredEquipmentItems,
  type EquipmentInspectionDraft,
} from '@/lib/equipment-inspections'

interface EquipmentInspectionFormProps {
  draft: EquipmentInspectionDraft
  checklist: EquipmentChecklist
  saving: boolean
  onChange: (draft: EquipmentInspectionDraft) => void
}

const INPUT_CLASS =
  'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm'

const RESULT_CLASS: Record<EquipmentInspectionResult, string> = {
  pass: 'border-green-600 bg-green-50 text-green-800',
  fail: 'border-red-600 bg-red-50 text-red-800',
  na: 'border-gray-400 bg-gray-100 text-gray-700',
}

/** 원문 양식의 분류 순서를 유지한 채 항목을 분류별로 묶는다. */
function groupByCategory(checklist: EquipmentChecklist) {
  const groups: { category: string; items: EquipmentChecklist['items'] }[] = []
  for (const item of checklist.items) {
    const last = groups[groups.length - 1]
    if (last && last.category === item.category) {
      last.items.push(item)
      continue
    }
    groups.push({ category: item.category, items: [item] })
  }
  return groups
}

export default function EquipmentInspectionForm({
  draft,
  checklist,
  saving,
  onChange,
}: EquipmentInspectionFormProps) {
  const [showSignaturePad, setShowSignaturePad] = useState(false)

  const remaining = unansweredEquipmentItems(draft, checklist)
  const signed = !isBlankEquipmentSignature(draft.signature)

  /** 서명 뒤 내용이 바뀌면 서명을 무효로 만드는 규칙을 모든 입력이 함께 쓴다. */
  const edit = (patch: Partial<EquipmentInspectionDraft>) => onChange(editEquipmentInspectionDraft(draft, patch))

  return (
    <div className="space-y-4">
      {/* 기본사항 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">점검일</span>
          <input
            type="date"
            value={draft.inspectionDate}
            onChange={(event) => edit({ inspectionDate: event.target.value })}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">업체명</span>
          <input
            type="text"
            value={draft.companyName}
            onChange={(event) => edit({ companyName: event.target.value })}
            disabled={saving}
            className={INPUT_CLASS}
            placeholder="장비 보유 업체"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">차량번호</span>
          <input
            type="text"
            value={draft.vehicleNumber}
            onChange={(event) => edit({ vehicleNumber: event.target.value })}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">기계번호</span>
          <input
            type="text"
            value={draft.machineNumber}
            onChange={(event) => edit({ machineNumber: event.target.value })}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      {/* 점검 항목 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            {checklist.name} 점검항목 <span className="text-gray-500">({checklist.items.length}개)</span>
          </h3>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              remaining.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
            }`}
          >
            {remaining.length > 0 ? `미점검 ${remaining.length}개` : '점검 완료'}
          </span>
        </div>

        <div className="divide-y divide-gray-200">
          {groupByCategory(checklist).map((group) => (
            <div key={group.category}>
              <p className="px-3 py-1.5 bg-blue-50 text-xs font-medium text-blue-800">{group.category}</p>
              {group.items.map((item) => {
                const response = draft.responses[item.id]
                return (
                  <div key={item.id} className="px-3 py-2.5 border-t border-gray-100">
                    <p className="text-sm text-gray-900 whitespace-normal">{item.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {EQUIPMENT_INSPECTION_RESULTS.map((result) => {
                        const active = response?.result === result
                        return (
                          <button
                            key={result}
                            type="button"
                            onClick={() => onChange(setEquipmentAnswerResult(draft, item.id, result))}
                            disabled={saving}
                            aria-pressed={active}
                            className={`min-h-[44px] px-4 py-2 text-sm rounded-lg border transition-colors ${
                              active ? RESULT_CLASS[result] : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {EQUIPMENT_INSPECTION_RESULT_LABELS[result]}
                          </button>
                        )
                      })}
                      <input
                        type="text"
                        value={response?.note ?? ''}
                        onChange={(event) => onChange(setEquipmentAnswerNote(draft, item.id, event.target.value))}
                        disabled={saving}
                        placeholder="비고"
                        className={`${INPUT_CLASS} flex-1 min-w-[140px]`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 종합 비고 */}
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1">종합 비고</span>
        <textarea
          value={draft.remarks}
          onChange={(event) => edit({ remarks: event.target.value })}
          disabled={saving}
          rows={3}
          className={INPUT_CLASS}
          placeholder="조치 사항이나 특이사항을 적습니다."
        />
      </label>

      {/* 점검자 서명 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="block flex-1 min-w-[160px]">
            <span className="block text-sm font-medium text-gray-700 mb-1">점검자 성명</span>
            <input
              type="text"
              value={draft.inspectorName}
              onChange={(event) => edit({ inspectorName: event.target.value })}
              disabled={saving}
              maxLength={EQUIPMENT_INSPECTOR_NAME_MAX}
              className={INPUT_CLASS}
            />
          </label>
          <div className="flex-1 min-w-[160px]">
            <span className="block text-sm font-medium text-gray-700 mb-1">점검자 서명</span>
            {signed ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.signature} alt="점검자 서명" className="h-12 border border-gray-200 rounded-md bg-white" />
                <button
                  type="button"
                  onClick={() => setShowSignaturePad(true)}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  다시 서명
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSignaturePad(true)}
                disabled={saving}
                className="min-h-[44px] w-full disabled:opacity-50 px-4 py-2 text-sm text-gray-700 bg-white border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center justify-center gap-2"
              >
                <PenTool className="h-4 w-4" />
                서명하기
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          ※ 점검자 본인이 직접 서명합니다. 감독·시공사 일괄서명 대상이 아닙니다.
          <br />
          ※ 서명 후 점검 결과나 기본사항을 고치면 서명이 지워집니다. 모든 입력을 마친 뒤 마지막에 서명하세요.
        </p>
      </div>

      {showSignaturePad && (
        <SignaturePad
          title="점검자 서명"
          onSave={(signature) => {
            onChange({ ...draft, signature })
            setShowSignaturePad(false)
          }}
          onCancel={() => setShowSignaturePad(false)}
        />
      )}
    </div>
  )
}
