'use client'

import React from 'react'
import { Download, Trash2, FileText } from 'lucide-react'
import { PtwPermitRecord, PERMIT_TYPE_CONFIGS } from '@/lib/ptw/permit-types'

interface PtwPermitListProps {
  records: PtwPermitRecord[]
  selectedId: string | null
  currentUserId?: string
  canDelete?: boolean // 작성자 외 삭제 허용 여부 (소유자·공유받은자·발주청)
  onSelect: (record: PtwPermitRecord) => void
  onDelete: (record: PtwPermitRecord) => void
  onDownload: (record: PtwPermitRecord) => void
  downloadingId: string | null
}

export default function PtwPermitList({
  records,
  selectedId,
  currentUserId,
  canDelete,
  onSelect,
  onDelete,
  onDownload,
  downloadingId,
}: PtwPermitListProps) {
  if (records.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
        작성된 허가서가 없습니다.
        <br />
        상단 추가 버튼으로 작성하세요.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm text-center">
        <thead className="bg-[#EBF1F5] text-gray-800 border-b border-gray-200">
          <tr>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-10">번호</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">작업유형</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">작업내용</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">신청인</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-12">완료</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-10">엑셀</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-10">삭제</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {records.map((record, index) => {
            const config = PERMIT_TYPE_CONFIGS[record.permit_type]
            const isMine = !currentUserId || record.created_by === currentUserId
            const showDelete = isMine || canDelete
            return (
              <tr
                key={record.id}
                onClick={() => onSelect(record)}
                className={`cursor-pointer transition-colors ${
                  selectedId === record.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-1.5 py-2 text-gray-500">{records.length - index}</td>
                <td className="px-1.5 py-2 whitespace-nowrap">
                  <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {config?.short || record.permit_type}
                  </span>
                  {record.permit_date && (
                    <div className="text-[11px] text-gray-400 mt-0.5">{record.permit_date}</div>
                  )}
                </td>
                <td className="px-1.5 py-2 text-gray-700 text-left max-w-[160px]">
                  <span className="line-clamp-2">{record.work_content || '-'}</span>
                </td>
                <td className="px-1.5 py-2 text-gray-700 whitespace-nowrap">{record.applicant_name || '-'}</td>
                <td className="px-1.5 py-2">
                  {record.is_completed ? (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">완료</span>
                  ) : (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">진행</span>
                  )}
                </td>
                <td className="px-1.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onDownload(record)}
                    disabled={downloadingId === record.id}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-md mx-auto flex disabled:opacity-40"
                    title="엑셀 다운로드"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </td>
                <td className="px-1.5 py-2" onClick={(e) => e.stopPropagation()}>
                  {showDelete && (
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
