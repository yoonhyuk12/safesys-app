'use client'
// 장비 종류와 규격 및 모델을 선택해 공식 카탈로그 제원을 작업계획서에 자동 입력하는 선택기

import { useState } from 'react'
import {
  EQUIPMENT_CATALOG,
  getEquipmentCategoryLabel,
  getEquipmentDisplayName,
  type EquipmentCatalogItem,
} from '@/lib/work-plan/equipment-catalog'

interface EquipmentCatalogSelectorProps {
  planType: 'loading' | 'construction' | 'heavy'
  onSelect: (item: EquipmentCatalogItem) => void
}

const CRANE_CAPACITY_WARNING = '크레인의 최대능력은 현장 작업반경에서의 허용하중이 아닙니다. 실제 작업 조건에 맞는 정격하중표를 반드시 확인하세요.'

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function fixedSpecRows(item: EquipmentCatalogItem) {
  const { specs } = item
  return [
    ['장비중량', specs.operatingWeightTon, 'ton'],
    ['전폭', specs.widthM, 'm'],
    ['최소 선회반경', specs.minimumTurningRadiusM, 'm'],
    ['최대 인양높이', specs.maxLiftingHeightM, 'm'],
    ['최대 작업반경', specs.maxWorkingRadiusM, 'm'],
    ['최대 정격하중', specs.maxRatedLoadTon, 'ton'],
  ].filter((row): row is [string, number, string] => typeof row[1] === 'number')
}

export default function EquipmentCatalogSelector({ planType, onSelect }: EquipmentCatalogSelectorProps) {
  const [category, setCategory] = useState<EquipmentCatalogItem['category'] | ''>('')
  const [sizeClass, setSizeClass] = useState('')
  const [modelId, setModelId] = useState('')

  const applicableItems = EQUIPMENT_CATALOG.filter((item) => item.applicablePlanTypes.includes(planType))
  const categories = unique(applicableItems.map((item) => item.category))
  const selectedCategory = categories.includes(category as EquipmentCatalogItem['category']) ? category : ''
  const categoryItems = selectedCategory
    ? applicableItems.filter((item) => item.category === selectedCategory)
    : []
  const sizeClasses = unique(categoryItems.map((item) => item.sizeClass))
  const selectedSizeClass = sizeClasses.includes(sizeClass) ? sizeClass : ''
  const modelItems = selectedSizeClass
    ? categoryItems.filter((item) => item.sizeClass === selectedSizeClass)
    : []
  const selectedItem = modelItems.find((item) => item.id === modelId)
  const categoryLabel = selectedItem ? getEquipmentCategoryLabel(selectedItem.category) : ''
  const isCrane = categoryLabel.includes('크레인')
  const specRows = selectedItem ? fixedSpecRows(selectedItem) : []

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4" aria-label="표준 장비 제원 자동입력">
      <div className="mb-4">
        <h3 className="font-bold text-gray-900">표준 장비 제원 자동입력</h3>
        <p className="mt-1 text-xs text-gray-600">장비군, 규격급, 모델을 차례로 선택하면 공식 자료의 고정 제원을 불러옵니다.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-gray-700">장비군</span>
          <select
            value={selectedCategory}
            onChange={(event) => {
              setCategory(event.target.value as EquipmentCatalogItem['category'] | '')
              setSizeClass('')
              setModelId('')
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">장비군 선택</option>
            {categories.map((itemCategory) => (
              <option key={itemCategory} value={itemCategory}>{getEquipmentCategoryLabel(itemCategory)}</option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-gray-700">규격급</span>
          <select
            value={selectedSizeClass}
            disabled={!selectedCategory}
            onChange={(event) => {
              setSizeClass(event.target.value)
              setModelId('')
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">규격급 선택</option>
            {sizeClasses.map((itemSizeClass) => (
              <option key={itemSizeClass} value={itemSizeClass}>{itemSizeClass}</option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-gray-700">제조사·모델</span>
          <select
            value={selectedItem?.id ?? ''}
            disabled={!selectedSizeClass}
            onChange={(event) => {
              const nextModelId = event.target.value
              setModelId(nextModelId)
              const nextItem = modelItems.find((item) => item.id === nextModelId)
              if (nextItem) onSelect(nextItem)
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">모델 선택</option>
            {modelItems.map((item) => (
              <option key={item.id} value={item.id}>{getEquipmentDisplayName(item)}</option>
            ))}
          </select>
        </label>
      </div>

      {selectedItem && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-blue-700">{categoryLabel} · {selectedItem.sizeClass}</p>
              <h4 className="mt-0.5 font-bold text-gray-900">{getEquipmentDisplayName(selectedItem)}</h4>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">제원 확인일 {selectedItem.sourceDate}</span>
          </div>

          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" role="status" aria-live="polite">
            아래 입력란에 자동 적용했습니다. 필요하면 수정하세요.
          </p>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-gray-500">제조사</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{selectedItem.manufacturer}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">모델</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{selectedItem.model}{selectedItem.variant ? ` · ${selectedItem.variant}` : ''}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <dt className="text-xs font-medium text-gray-500">고정제원 요약</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{selectedItem.specs.capacitySummary}</dd>
            </div>
            {specRows.map(([label, value, unit]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-gray-500">{label}</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{value.toLocaleString()} {unit}</dd>
              </div>
            ))}
          </dl>

          <a
            href={selectedItem.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            공식 출처 보기 · {selectedItem.sourceLabel}
          </a>

          {selectedItem.warning && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900" role="alert">
              {selectedItem.warning}
            </p>
          )}
          {isCrane && selectedItem.warning !== CRANE_CAPACITY_WARNING && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800" role="alert">
              {CRANE_CAPACITY_WARNING}
            </p>
          )}

          <button
            type="button"
            onClick={() => onSelect(selectedItem)}
            className="mt-4 w-full rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
          >
            제원 다시 적용
          </button>
        </div>
      )}
    </section>
  )
}
