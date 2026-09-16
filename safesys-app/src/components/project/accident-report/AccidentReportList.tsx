'use client'
// 프로젝트 사고보고 목록 표 — 조회 오류·빈 목록·사고 목록 세 가지 상태를 함께 다룬다

import { AlertTriangle, Edit, Plus, Trash2 } from 'lucide-react'
import type { ProjectAccident } from '@/lib/accident-analysis'
import {
  compClaimBadgeClass,
  compClaimLabel,
  formatAccidentDate,
  severityBadgeClass,
  severityLabel,
} from '@/lib/accident-report-format'

interface AccidentReportListProps {
  accidents: ProjectAccident[]
  /** 조회에 실패했으면 그 사유. 빈 목록과 구분해 보여준다. */
  loadError: string | null
  canCreate: boolean
  /** 사고 한 건을 수정할 수 있는지 — 이 현장을 열 수 있는 사용자면 참이다. */
  canEdit: (accident: ProjectAccident) => boolean
  /** 사고 한 건을 삭제할 수 있는지 — 본인 작성 건이거나 본부급 관할일 때 참이다. */
  canDelete: (accident: ProjectAccident) => boolean
  deletingId: string | null
  onRetry: () => void
  onSelect: (accident: ProjectAccident) => void
  onCreate: () => void
  onEdit: (accident: ProjectAccident) => void
  onDelete: (accident: ProjectAccident) => void
}

const casualtySummary = (accident: ProjectAccident): string =>
  `부상 ${accident.injured_count}명 · 사망 ${accident.fatal_count}명 · 휴업 ${accident.lost_workdays}일`

const iconButtonClassName = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md'

export default function AccidentReportList({
  accidents,
  loadError,
  canCreate,
  canEdit,
  canDelete,
  deletingId,
  onRetry,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: AccidentReportListProps) {
  if (loadError) {
    return (
      <div className="m-4 border border-dashed border-red-300 rounded-md p-6 text-center text-sm text-red-700" role="alert">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (accidents.length === 0) {
    return (
      <div className="m-4 border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500">
        <AlertTriangle className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3">등록된 사고가 없습니다.</p>
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 min-h-[44px] inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            사고 등록
          </button>
        )}
      </div>
    )
  }

  const showManageColumn = accidents.some((accident) => canEdit(accident) || canDelete(accident))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">사고일자</th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">중대도</th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">사고 유형</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">사고 장소</th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">인명 피해</th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">산재신청</th>
            {showManageColumn && (
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {accidents.map((accident) => {
            const accidentDate = formatAccidentDate(accident.accident_at)
            return (
              <tr key={accident.id} className="hover:bg-gray-50">
                <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                  {/* 상세 진입은 이 버튼 하나다. 행 전체 클릭만 두면 키보드로 열 수 없다. */}
                  <button
                    type="button"
                    onClick={() => onSelect(accident)}
                    className="min-h-[44px] px-2 font-medium text-blue-700 hover:underline rounded-md"
                  >
                    {accidentDate}
                  </button>
                </td>
                <td className="px-3 py-3 text-sm text-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${severityBadgeClass(accident.severity)}`}>
                    {severityLabel(accident.severity)}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm text-center text-gray-600">{accident.accident_type}</td>
                <td className="px-3 py-3 text-sm text-left text-gray-600">{accident.location}</td>
                <td className="px-3 py-3 text-xs text-center text-gray-500 whitespace-nowrap">{casualtySummary(accident)}</td>
                <td className="px-3 py-3 text-sm text-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${compClaimBadgeClass(accident.workers_comp_claim)}`}>
                    {compClaimLabel(accident.workers_comp_claim)}
                  </span>
                </td>
                {showManageColumn && (
                  <td className="px-3 py-3 text-sm text-center">
                    <div className="inline-flex gap-1">
                      {canEdit(accident) && (
                        <button
                          type="button"
                          aria-label={`${accidentDate} 사고 수정`}
                          onClick={() => onEdit(accident)}
                          className={`${iconButtonClassName} text-blue-600 hover:bg-blue-50`}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete(accident) && (
                        <button
                          type="button"
                          aria-label={`${accidentDate} 사고 삭제`}
                          disabled={deletingId === accident.id}
                          onClick={() => onDelete(accident)}
                          className={`${iconButtonClassName} text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
