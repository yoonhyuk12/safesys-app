'use client'

// 장비 일일점검에서 원본 양식의 장비 23종 중 하나를 고르는 그리드다.

import { Check } from 'lucide-react'
import type { EquipmentChecklist } from '@/lib/equipment-inspection-types'

interface EquipmentPickerProps {
  checklists: EquipmentChecklist[]
  selectedId: string
  onSelect: (checklist: EquipmentChecklist) => void
}

export default function EquipmentPicker({ checklists, selectedId, onSelect }: EquipmentPickerProps) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">점검할 장비를 선택하세요. 장비를 바꾸면 입력한 점검 결과와 서명은 초기화됩니다.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {checklists.map((checklist) => {
          const selected = checklist.id === selectedId
          return (
            <button
              key={checklist.id}
              type="button"
              onClick={() => onSelect(checklist)}
              aria-pressed={selected}
              className={`min-h-[44px] px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                selected
                  ? 'border-blue-600 bg-blue-50 text-blue-800 font-medium'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-start justify-between gap-1">
                {/* 고소작업대(시저형)·고소작업대(차량탑재형)처럼 뒷부분이 구분점이라 이름을 자르지 않는다. */}
                <span className="break-keep">{checklist.name}</span>
                {selected && <Check className="h-4 w-4 shrink-0 mt-0.5" />}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">{checklist.items.length}개 항목</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
