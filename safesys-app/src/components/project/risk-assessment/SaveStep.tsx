'use client'

// 수시 위험성평가 5단계 — 제목·작성자·관리기간을 입력하고 저장 내용을 요약해 보여준다

import { formatManagePeriod } from './record'

interface SaveStepProps {
  title: string
  authorName: string
  managePeriodStart: string
  managePeriodEnd: string
  businessTypeLabel: string
  detailWorkLabel: string
  trigger: string
  rowCount: number
  onTitleChange: (value: string) => void
  onAuthorNameChange: (value: string) => void
  onManagePeriodStartChange: (value: string) => void
  onManagePeriodEndChange: (value: string) => void
}

export default function SaveStep({
  title,
  authorName,
  managePeriodStart,
  managePeriodEnd,
  businessTypeLabel,
  detailWorkLabel,
  trigger,
  rowCount,
  onTitleChange,
  onAuthorNameChange,
  onManagePeriodStartChange,
  onManagePeriodEndChange,
}: SaveStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-gray-800">제목<span className="ml-1 text-red-500">*</span></span>
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">작성자</span>
          <input
            value={authorName}
            onChange={(event) => onAuthorNameChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-sm font-semibold text-gray-800">관리기간 시작</span>
            <input
              type="date"
              value={managePeriodStart}
              onChange={(event) => onManagePeriodStartChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gray-800">관리기간 종료</span>
            <input
              type="date"
              value={managePeriodEnd}
              onChange={(event) => onManagePeriodEndChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
        </div>
      </div>

      <dl className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-gray-600">사업별</dt>
          <dd className="min-w-0 text-gray-900">{businessTypeLabel}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-gray-600">세부단위작업</dt>
          <dd className="min-w-0 text-gray-900">{detailWorkLabel || '-'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-gray-600">관리기간</dt>
          <dd className="min-w-0 text-gray-900">{formatManagePeriod(managePeriodStart || null, managePeriodEnd || null) || '-'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-gray-600">표 행 수</dt>
          <dd className="min-w-0 text-gray-900">{rowCount}행</dd>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <dt className="shrink-0 font-semibold text-gray-600">수시평가 사유</dt>
          <dd className="min-w-0 whitespace-pre-wrap text-gray-900">{trigger || '-'}</dd>
        </div>
      </dl>

      <p className="text-xs text-gray-500">결재란 서명은 저장 후 별도 단계에서 수집합니다. 지금은 서명 없이 저장됩니다.</p>
    </div>
  )
}
