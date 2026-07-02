'use client'

// 단속·점검방문 일지 목록 테이블 — 행 클릭으로 수정, 작성자만 삭제 가능

import React from 'react'
import { Download, Trash2, FileText } from 'lucide-react'
import { InspectionVisitLogRecord } from '@/lib/inspection/inspection-visit-log-types'

interface InspectionVisitLogListProps {
  records: InspectionVisitLogRecord[]
  selectedId: string | null
  currentUserId?: string
  onSelect: (record: InspectionVisitLogRecord) => void
  onDelete: (record: InspectionVisitLogRecord) => void
  onDownload: (record: InspectionVisitLogRecord) => void
  downloadingId: string | null
}

export default function InspectionVisitLogList({
  records,
  selectedId,
  currentUserId,
  onSelect,
  onDelete,
  onDownload,
  downloadingId,
}: InspectionVisitLogListProps) {
  if (records.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
        등록된 단속·점검방문 일지가 없습니다.
        <br />
        상단 추가 버튼으로 등록하세요.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm text-center">
        <thead className="bg-[#EBF1F5] text-gray-800 border-b border-gray-200">
          <tr>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-12">번호</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">방문일자</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">방문 근거 및 목적</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">방문자</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-10">엑셀</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-10">삭제</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {records.map((record, index) => {
            const isMine = !currentUserId || record.created_by === currentUserId
            const visitorNames = (record.visitors || [])
              .map((v) => v.name)
              .filter(Boolean)
              .join(', ')
            return (
              <tr
                key={record.id}
                onClick={() => onSelect(record)}
                className={`cursor-pointer transition-colors ${
                  selectedId === record.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-1.5 py-2 text-gray-500 whitespace-nowrap">
                  {records.length - index}
                </td>
                <td className="px-1.5 py-2 text-gray-700 whitespace-nowrap">
                  {record.visit_date || '-'}
                </td>
                <td className="px-1.5 py-2 text-gray-700 text-left max-w-[180px]">
                  <span className="line-clamp-2">{record.visit_basis_purpose || '-'}</span>
                </td>
                <td className="px-1.5 py-2 text-gray-700 text-left max-w-[120px]">
                  <span className="line-clamp-2">{visitorNames || '-'}</span>
                </td>
                <td className="px-1.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onDownload(record)}
                    disabled={downloadingId === record.id}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-md mx-auto flex disabled:opacity-40"
                    title="단속·점검방문 일지 엑셀 다운로드"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </td>
                <td className="px-1.5 py-2" onClick={(e) => e.stopPropagation()}>
                  {isMine && (
                    <button
                      onClick={() => onDelete(record)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-md mx-auto flex"
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
