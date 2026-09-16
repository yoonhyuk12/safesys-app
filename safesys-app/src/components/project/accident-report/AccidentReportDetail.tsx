'use client'
// 사고 한 건의 모든 기록 항목을 보여주는 상세 화면

import { AlertCircle, Download, Edit, Loader2, Trash2 } from 'lucide-react'
import type { ProjectAccident } from '@/lib/accident-analysis'
import {
  compClaimBadgeClass,
  compClaimLabel,
  formatAccidentDate,
  formatAccidentDateTime,
  severityBadgeClass,
  severityLabel,
} from '@/lib/accident-report-format'
import {
  ACCIDENT_NOTIFICATION_OPTIONS,
  ACCIDENT_REPORT_TEXT_KEYS,
  ACCIDENT_REPORT_TEXT_LABELS,
  ACCIDENT_VICTIM_ACTION_OPTIONS,
  listUnfilledAccidentReportFields,
  normalizeAccidentReportDetails,
} from '@/lib/accident-report'

interface AccidentReportDetailProps {
  accident: ProjectAccident
  projectName: string
  /** 이 현장을 열 수 있는 사용자면 참 — 수정 버튼을 보여준다. */
  canEdit: boolean
  /** 본인 작성 건이거나 본부급 관할일 때만 참 — 삭제 버튼을 보여준다. */
  canDelete: boolean
  deleting: boolean
  onEdit: () => void
  onDelete: () => void
  onDownloadHwpx: () => void
  downloading: boolean
  downloadError: string
  /** 보고서 항목(report_details)을 아직 읽고 있으면 참 */
  detailLoading: boolean
  detailError: string
  onRetryDetail: () => void
}

/** 선택지 값을 사람이 읽는 라벨로 바꾼다. 모르는 값은 그대로 보여준다. */
const toLabels = (values: readonly string[], options: ReadonlyArray<{ value: string; label: string }>): string =>
  values.map((value) => options.find((option) => option.value === value)?.label ?? value).join(' · ')

interface DetailFieldProps {
  label: string
  children: React.ReactNode
}

function DetailField({ label, children }: DetailFieldProps) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  )
}

export default function AccidentReportDetail({
  accident,
  projectName,
  canEdit,
  canDelete,
  deleting,
  onEdit,
  onDelete,
  onDownloadHwpx,
  downloading,
  downloadError,
  detailLoading,
  detailError,
  onRetryDetail,
}: AccidentReportDetailProps) {
  // report_details가 undefined면 아직 읽지 않은 것이고, null이면 읽었는데 작성분이 없는 것이다.
  const detailsLoaded = accident.report_details !== undefined
  const details = normalizeAccidentReportDetails(accident.report_details ?? null)
  const filledKeys = ACCIDENT_REPORT_TEXT_KEYS.filter((key) => details[key].length > 0)
  const unfilledKeys = listUnfilledAccidentReportFields(details)
  const hasAnyReportValue =
    filledKeys.length > 0 ||
    details.notifications.length > 0 ||
    details.victimActions.length > 0 ||
    details.photos.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${severityBadgeClass(accident.severity)}`}>
            {severityLabel(accident.severity)}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {accident.accident_type}
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${compClaimBadgeClass(accident.workers_comp_claim)}`}>
            산재 {compClaimLabel(accident.workers_comp_claim)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDownloadHwpx}
            disabled={downloading || detailLoading}
            className="min-h-[44px] inline-flex items-center gap-1 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            한글 다운로드
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="min-h-[44px] inline-flex items-center gap-1 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Edit className="h-4 w-4" />
              수정
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="min-h-[44px] inline-flex items-center gap-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
              삭제
            </button>
          )}
        </div>
      </div>

      {downloadError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        <DetailField label="현장">{projectName || '-'}</DetailField>
        <DetailField label="사고일자">{formatAccidentDate(accident.accident_at)}</DetailField>
        <DetailField label="사고 장소">{accident.location}</DetailField>
        <DetailField label="사고 당시 작업">{accident.work_description}</DetailField>
      </dl>

      <dl className="grid gap-4">
        <DetailField label="사고 개요">{accident.description}</DetailField>
        <DetailField label="사고 원인">{accident.cause}</DetailField>
        <DetailField label="재발방지 대책">{accident.prevention_action}</DetailField>
      </dl>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-gray-100 pt-4">
        <DetailField label="부상자 수">{accident.injured_count.toLocaleString('ko-KR')}명</DetailField>
        <DetailField label="사망자 수">{accident.fatal_count.toLocaleString('ko-KR')}명</DetailField>
        <DetailField label="휴업일수">{accident.lost_workdays.toLocaleString('ko-KR')}일</DetailField>
        <DetailField label="산재신청 여부">{compClaimLabel(accident.workers_comp_claim)}</DetailField>
      </dl>

      <section className="border-t border-gray-100 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">사고발생보고서 항목</h3>

        {!detailsLoaded && detailLoading ? (
          <p className="text-sm text-gray-500">보고서 항목을 불러오는 중</p>
        ) : detailError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{detailError}</p>
            <button
              type="button"
              onClick={onRetryDetail}
              className="min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              보고서 항목 다시 불러오기
            </button>
          </div>
        ) : (
          <>
            {hasAnyReportValue ? (
              <>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {filledKeys.map((key) => (
                    <DetailField key={key} label={ACCIDENT_REPORT_TEXT_LABELS[key]}>{details[key]}</DetailField>
                  ))}
                  {details.notifications.length > 0 && (
                    <DetailField label="신고처">{toLabels(details.notifications, ACCIDENT_NOTIFICATION_OPTIONS)}</DetailField>
                  )}
                  {details.victimActions.length > 0 && (
                    <DetailField label="피해자 조치">{toLabels(details.victimActions, ACCIDENT_VICTIM_ACTION_OPTIONS)}</DetailField>
                  )}
                </dl>

                {details.photos.length > 0 && (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {details.photos.map((photo, index) => (
                      <li key={`${index}-${photo.dataUrl.slice(-24)}`} className="rounded-lg border border-gray-200 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.dataUrl}
                          alt={photo.caption || `사고 사진 ${index + 1}`}
                          className="h-48 w-full rounded-md object-contain bg-gray-50"
                        />
                        {photo.caption && <p className="mt-1.5 text-xs text-gray-600 break-words">{photo.caption}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                보고서 추가 항목이 아직 없습니다. 수정에서 문서를 업로드하거나 직접 입력할 수 있습니다.
              </p>
            )}

            {hasAnyReportValue && unfilledKeys.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-medium">아직 작성하지 않은 보고 항목</p>
                <p className="mt-1 break-words">
                  {unfilledKeys.map((key) => ACCIDENT_REPORT_TEXT_LABELS[key]).join(' · ')}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-gray-100 pt-4">
        <DetailField label="등록일시">{formatAccidentDateTime(accident.created_at)}</DetailField>
        <DetailField label="최종 수정일시">{formatAccidentDateTime(accident.updated_at)}</DetailField>
      </dl>
    </div>
  )
}
