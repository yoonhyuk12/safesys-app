'use client'

// 수시 위험성평가 저장 단계 — 제목·작성자·관리기간·결재란 명단을 입력하고 저장 내용을 요약해 보여준다

import { formatManagePeriod } from './record'

export type SignatureNameKey = 'constructionName' | 'safetyName' | 'siteManagerName' | 'supervisorName'
export type SignatureNames = Record<SignatureNameKey, string>

const SIGNATURE_FIELDS: Array<{ key: SignatureNameKey; label: string; hint: string }> = [
  { key: 'constructionName', label: '공사(작성자)', hint: '접속자' },
  { key: 'safetyName', label: '안전', hint: '직접 입력' },
  { key: 'siteManagerName', label: '현장소장', hint: '프로젝트 소유자' },
  { key: 'supervisorName', label: '공사감독(점검)', hint: '프로젝트 감독' },
]

const PERIOD_PRESETS = [7, 15, 30, 60]

/** 시간대에 영향받지 않도록 UTC 기준으로 날짜만 더한다. */
function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return isoDate
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 시작·종료일로 관리기간 일수를 센다 (프리셋 강조용). */
function periodDays(start: string, end: string): number {
  if (!start || !end) return 0
  const startTime = Date.parse(`${start.slice(0, 10)}T00:00:00Z`)
  const endTime = Date.parse(`${end.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0
  return Math.floor((endTime - startTime) / 86400000) + 1
}

interface SaveStepProps {
  title: string
  authorName: string
  managePeriodStart: string
  managePeriodEnd: string
  businessTypeLabel: string
  detailWorkLabel: string
  trigger: string
  rowCount: number
  signatureNames: SignatureNames
  onTitleChange: (value: string) => void
  onAuthorNameChange: (value: string) => void
  onManagePeriodStartChange: (value: string) => void
  onManagePeriodEndChange: (value: string) => void
  onSignatureNameChange: (key: SignatureNameKey, value: string) => void
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
  signatureNames,
  onTitleChange,
  onAuthorNameChange,
  onManagePeriodStartChange,
  onManagePeriodEndChange,
  onSignatureNameChange,
}: SaveStepProps) {
  const currentDays = periodDays(managePeriodStart, managePeriodEnd)

  // 프리셋은 시작일을 기준으로 종료일만 옮긴다 (N일간 = 시작일 포함).
  const applyPreset = (days: number) => {
    if (!managePeriodStart) return
    onManagePeriodEndChange(shiftDate(managePeriodStart, days - 1))
  }

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
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {PERIOD_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => applyPreset(days)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  currentDays === days
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {days}일
              </button>
            ))}
          </div>
        </div>
      </div>

      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-sm font-semibold text-gray-800">결재란 명단</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SIGNATURE_FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="text-xs font-semibold text-gray-700">{field.label}</span>
              <input
                value={signatureNames[field.key]}
                onChange={(event) => onSignatureNameChange(field.key, event.target.value)}
                placeholder={field.hint}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900"
              />
            </label>
          ))}
        </div>
      </fieldset>

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

      <p className="text-xs text-gray-500">결재란에는 위 명단이 인쇄됩니다. 서명 이미지는 저장 후 별도 단계에서 수집합니다.</p>
    </div>
  )
}
