'use client'

// 수시 위험성평가 저장 단계 — 제목·작성자·관리기간·결재란 서명을 입력하고 저장 내용을 요약해 보여준다

import { useState } from 'react'
import { Eraser, PenLine } from 'lucide-react'
import SignaturePad from '@/components/ui/SignaturePad'
import { formatManagePeriod } from './record'

/** 서명 이미지(dataURL) 키 — RiskAssessmentSignatures의 서명 필드와 같은 이름이다 */
export type SignatureDataKey = 'construction' | 'safety' | 'siteManager' | 'supervisor'
export type SignatureDataUrls = Record<SignatureDataKey, string | null>

const SIGNATURE_FIELDS: Array<{ signKey: SignatureDataKey; label: string }> = [
  { signKey: 'construction', label: '공사' },
  { signKey: 'safety', label: '안전' },
  { signKey: 'siteManager', label: '현장소장' },
  { signKey: 'supervisor', label: '공사감독(점검)' },
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
  signatureDataUrls: SignatureDataUrls
  onTitleChange: (value: string) => void
  onAuthorNameChange: (value: string) => void
  onManagePeriodStartChange: (value: string) => void
  onManagePeriodEndChange: (value: string) => void
  onSignatureDataChange: (key: SignatureDataKey, dataUrl: string | null) => void
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
  signatureDataUrls,
  onTitleChange,
  onAuthorNameChange,
  onManagePeriodStartChange,
  onManagePeriodEndChange,
  onSignatureDataChange,
}: SaveStepProps) {
  const [activeSign, setActiveSign] = useState<{ signKey: SignatureDataKey; label: string } | null>(null)
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
        <legend className="px-1 text-sm font-semibold text-gray-800">결재란 서명</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SIGNATURE_FIELDS.map((field) => {
            const signature = signatureDataUrls[field.signKey]
            return (
              <div key={field.signKey} className="rounded-lg border border-gray-200 bg-white p-2">
                <span className="block text-xs font-semibold text-gray-700">{field.label}</span>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {signature && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signature} alt={`${field.label} 서명`} className="h-9 w-16 shrink-0 rounded border border-gray-200 bg-white object-contain" />
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveSign({ signKey: field.signKey, label: field.label })}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${
                      signature ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    {signature ? '다시 서명' : '서명하기'}
                  </button>
                  {signature && (
                    <button
                      type="button"
                      onClick={() => onSignatureDataChange(field.signKey, null)}
                      className="flex items-center rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      aria-label={`${field.label} 서명 지우기`}
                    >
                      <Eraser className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </fieldset>

      {activeSign && (
        <SignaturePad
          title={`${activeSign.label} 서명`}
          onSave={(dataUrl) => {
            onSignatureDataChange(activeSign.signKey, dataUrl)
            setActiveSign(null)
          }}
          onCancel={() => setActiveSign(null)}
        />
      )}

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

      <p className="text-xs text-gray-500">결재란에는 위 서명이 그대로 인쇄됩니다. 성명 없이 서명만 받으면 됩니다.</p>
    </div>
  )
}
