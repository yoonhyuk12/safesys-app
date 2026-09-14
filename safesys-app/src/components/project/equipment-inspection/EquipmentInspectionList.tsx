'use client'

// 제출된 장비 일일점검 목록 표 — 선택·삭제·HWPX 다운로드 진입점이다.

import { Download, Loader2, Trash2 } from 'lucide-react'
import type { EquipmentInspection } from '@/lib/equipment-inspection-types'

interface EquipmentInspectionListProps {
  records: EquipmentInspection[]
  selectedId: string | null
  currentUserId: string
  downloadingId: string | null
  /** 현장 정보를 아직 못 읽었으면 이름 없는 문서가 나가므로 내려받기를 잠근다. */
  downloadDisabled: boolean
  onSelect: (record: EquipmentInspection) => void
  onDownload: (record: EquipmentInspection) => void
  onDelete: (record: EquipmentInspection) => void
}

/** 부적합 건수는 목록에서 바로 보여야 조치가 필요한 점검을 찾을 수 있다. */
function failCount(record: EquipmentInspection): number {
  return (record.answers ?? []).filter((answer) => answer.result === 'fail').length
}

export default function EquipmentInspectionList({
  records,
  selectedId,
  currentUserId,
  downloadingId,
  downloadDisabled,
  onSelect,
  onDownload,
  onDelete,
}: EquipmentInspectionListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">점검일</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">장비</th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">점검자</th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">결과</th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {records.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                제출된 장비 일일점검이 없습니다.
              </td>
            </tr>
          ) : (
            records.map((record) => {
              const fails = failCount(record)
              const selected = record.id === selectedId
              return (
                <tr
                  key={record.id}
                  onClick={() => onSelect(record)}
                  className={`cursor-pointer ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-3 text-xs text-center text-gray-700">{record.inspection_date}</td>
                  <td className="px-3 py-3 text-xs text-left font-medium text-gray-900">{record.equipment_name}</td>
                  <td className="px-3 py-3 text-xs text-center text-gray-700">{record.inspector_name}</td>
                  <td className="px-3 py-3 text-xs text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        fails > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {fails > 0 ? `부적합 ${fails}건` : '적합'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        aria-label="HWPX 다운로드"
                        title={downloadDisabled ? '현장 정보를 불러온 뒤 내려받을 수 있습니다' : 'HWPX 다운로드'}
                        disabled={downloadDisabled || downloadingId === record.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          onDownload(record)
                        }}
                        className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm disabled:opacity-50"
                      >
                        {downloadingId === record.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                      {record.created_by === currentUserId && (
                        <button
                          type="button"
                          aria-label="점검 삭제"
                          title="점검 삭제"
                          onClick={(event) => {
                            event.stopPropagation()
                            onDelete(record)
                          }}
                          className="inline-flex items-center justify-center p-1.5 rounded-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
