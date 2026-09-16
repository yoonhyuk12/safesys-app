'use client'
// 사고 한 건의 모든 기록 항목을 보여주는 상세 화면

import { Edit, Trash2 } from 'lucide-react'
import type { ProjectAccident } from '@/lib/accident-analysis'
import {
  compClaimBadgeClass,
  compClaimLabel,
  formatAccidentDate,
  formatAccidentDateTime,
  severityBadgeClass,
  severityLabel,
} from '@/lib/accident-report-format'

interface AccidentReportDetailProps {
  accident: ProjectAccident
  projectName: string
  /** 본인 작성 건이거나 본부급 관할일 때만 수정·삭제를 보여준다. */
  canModify: boolean
  deleting: boolean
  onEdit: () => void
  onDelete: () => void
}

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
  canModify,
  deleting,
  onEdit,
  onDelete,
}: AccidentReportDetailProps) {
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
        {canModify && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="min-h-[44px] inline-flex items-center gap-1 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Edit className="h-4 w-4" />
              수정
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="min-h-[44px] inline-flex items-center gap-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
              삭제
            </button>
          </div>
        )}
      </div>

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

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-gray-100 pt-4">
        <DetailField label="등록일시">{formatAccidentDateTime(accident.created_at)}</DetailField>
        <DetailField label="최종 수정일시">{formatAccidentDateTime(accident.updated_at)}</DetailField>
      </dl>
    </div>
  )
}
