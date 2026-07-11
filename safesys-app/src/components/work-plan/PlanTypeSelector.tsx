'use client'

// 작성할 작업계획서 종류를 복수 선택하는 카드형 선택기

import { Check, Construction, Forklift, Scale, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PlanType } from '@/lib/work-plan/types'

interface PlanTypeSelectorProps {
  selectedTypes: PlanType[]
  onChange: (types: PlanType[]) => void
}

const PLAN_CARDS: Array<{
  type: PlanType
  attachment: string
  title: string
  description: string
  icon: LucideIcon
  color: string
}> = [
  {
    type: 'loading',
    attachment: '붙임 2-1',
    title: '차량계 하역운반기계',
    description: '지게차·화물차 등 운반·하역 장비 작업',
    icon: Forklift,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  {
    type: 'construction',
    attachment: '붙임 2-2',
    title: '차량계 건설기계',
    description: '굴착기·천공기·크레인 등 건설기계 작업',
    icon: Construction,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  {
    type: 'electric',
    attachment: '붙임 2-3',
    title: '전기 작업',
    description: '전로 차단·활선·전기설비 점검 및 시공',
    icon: Zap,
    color: 'text-violet-700 bg-violet-50 border-violet-200',
  },
  {
    type: 'heavy',
    attachment: '붙임 2-4',
    title: '중량물 취급',
    description: '중량물 인양·운반·적재 작업',
    icon: Scale,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
]

export default function PlanTypeSelector({ selectedTypes, onChange }: PlanTypeSelectorProps) {
  const toggleType = (type: PlanType) => {
    onChange(
      selectedTypes.includes(type)
        ? selectedTypes.filter((selected) => selected !== type)
        : [...selectedTypes, type]
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">작성할 서류를 선택해주세요.</h2>
        <p className="mt-1 text-sm text-gray-500">
          같은 작업에 필요한 서류를 복수 선택하면 기본정보를 한 번만 입력할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PLAN_CARDS.map((card) => {
          const selected = selectedTypes.includes(card.type)
          const Icon = card.icon
          return (
            <button
              key={card.type}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleType(card.type)}
              className={`relative flex min-h-36 items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                selected
                  ? 'border-blue-600 bg-blue-50 shadow-sm ring-1 ring-blue-600'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${card.color}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="text-xs font-semibold text-gray-500">{card.attachment}</span>
                <span className="mt-1 block font-bold text-gray-900">{card.title}</span>
                <span className="mt-2 block text-sm leading-5 text-gray-500">{card.description}</span>
              </span>
              <span
                className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border ${
                  selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-transparent'
                }`}
              >
                <Check className="h-4 w-4" />
              </span>
            </button>
          )
        })}
      </div>

      {selectedTypes.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          다음 단계로 이동하려면 한 종류 이상 선택해주세요.
        </p>
      )}
    </div>
  )
}
