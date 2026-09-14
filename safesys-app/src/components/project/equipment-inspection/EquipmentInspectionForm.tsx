'use client'

// 장비 일일점검 작성 폼 — 기본사항, 원문 항목별 적합/부적합/해당없음, 점검자 직접 서명을 받는다.

import { useCallback, useEffect, useRef, useState } from 'react'
import { PenTool } from 'lucide-react'
import SignaturePad from '@/components/ui/SignaturePad'
import EquipmentGuideImages from '@/components/project/equipment-inspection/EquipmentGuideImages'
import type {
  EquipmentChecklist,
  EquipmentChecklistItem,
  EquipmentInspectionResult,
} from '@/lib/equipment-inspection-types'
import {
  EQUIPMENT_INSPECTION_RESULTS,
  EQUIPMENT_INSPECTION_RESULT_LABELS,
  EQUIPMENT_INSPECTOR_NAME_MAX,
  editEquipmentInspectionDraft,
  flattenEquipmentItemText,
  isBlankEquipmentSignature,
  resolveEquipmentItemText,
  setEquipmentAnswerNote,
  setEquipmentAnswerResult,
  setEquipmentAnswerText,
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

/**
 * 점검항목 문구 입력칸 — 내용 높이에 맞춰 늘어나 긴 문구가 잘리지 않는다.
 * 원문 PDF의 강제 줄바꿈은 원본 양식의 칸 너비 때문에 생긴 것이라 표시할 때 한 줄로 펴고,
 * 고쳐 쓰지 않은 항목은 저장할 때 원문 그대로 나간다.
 */
function ItemTextInput({
  item,
  value,
  disabled,
  onChange,
}: {
  item: EquipmentChecklistItem
  value: string
  disabled: boolean
  onChange: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const fitHeight = useCallback(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [])

  useEffect(() => {
    fitHeight()
  }, [value, fitHeight])

  /**
   * 폭이 좁아지면 같은 문구도 줄 수가 늘어난다. 값이 바뀔 때만 높이를 재면
   * 화면을 좁힌 뒤(예: 390px 휴대폰 폭) 문구 끝이 잘려 보인다.
   */
  useEffect(() => {
    const element = ref.current
    if (!element) return

    // 높이는 우리가 직접 바꾸는 값이다. 폭이 실제로 달라졌을 때만 다시 재야 관찰이 스스로를 깨우지 않는다.
    let lastWidth = element.clientWidth
    const refit = () => {
      const width = ref.current?.clientWidth ?? lastWidth
      if (width === lastWidth) return
      lastWidth = width
      fitHeight()
    }

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', refit)
      return () => window.removeEventListener('resize', refit)
    }

    // 창 크기뿐 아니라 좌우 배치가 한 칸으로 접히는 경우까지 잡으려면 칸 자체를 본다.
    const observer = new ResizeObserver(refit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [fitHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(flattenEquipmentItemText(event.target.value))}
      // 항목 문구는 한 문단이다. 줄바꿈을 넣으면 화면에서 바로 공백으로 펴져 입력 위치가 튀므로 아예 받지 않는다.
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault()
      }}
      disabled={disabled}
      rows={1}
      aria-label={`점검항목 문구 — ${flattenEquipmentItemText(item.text)}`}
      className={`${INPUT_CLASS} text-gray-900 resize-none overflow-hidden block`}
    />
  )
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
            placeholder="출력후 작성해도 무방"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">차량번호</span>
          <input
            type="text"
            value={draft.vehicleNumber}
            placeholder="출력후 작성해도 무방"
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
            placeholder="출력후 작성해도 무방"
            onChange={(event) => edit({ machineNumber: event.target.value })}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      {/* 장비 안내 그림 */}
      <EquipmentGuideImages equipmentId={checklist.id} equipmentName={checklist.name} />

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

        <p className="px-3 py-2 bg-white text-xs text-gray-500 border-b border-gray-200">
          ※ 점검항목 문구는 현장 실정에 맞게 고쳐 쓸 수 있습니다. 고친 문구는 이 점검에만 적용되고 원본 양식은 그대로입니다.
        </p>

        <div className="divide-y divide-gray-200">
          {groupByCategory(checklist).map((group) => (
            <div key={group.category}>
              <p className="px-3 py-1.5 bg-blue-50 text-xs font-medium text-blue-800">{group.category}</p>
              {group.items.map((item) => {
                const response = draft.responses[item.id]
                return (
                  <div key={item.id} className="px-3 py-2.5 border-t border-gray-100">
                    <ItemTextInput
                      item={item}
                      value={flattenEquipmentItemText(resolveEquipmentItemText(draft, item))}
                      disabled={saving}
                      onChange={(text) => onChange(setEquipmentAnswerText(draft, item.id, text))}
                    />
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
          ※ 서명 후 점검항목 문구·결과나 기본사항을 고치면 서명이 지워집니다. 모든 입력을 마친 뒤 마지막에 서명하세요.
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
