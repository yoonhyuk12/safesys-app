'use client'

import React from 'react'
import { Download, Trash2, FileText } from 'lucide-react'
import { InspectionRequestRecord } from '@/lib/inspection/inspection-types'

interface InspectionRequestListProps {
  records: InspectionRequestRecord[]
  selectedId: string | null
  currentUserId?: string
  onSelect: (record: InspectionRequestRecord) => void
  onDelete: (record: InspectionRequestRecord) => void
  onDownload: (record: InspectionRequestRecord) => void
  downloadingId: string | null
}

export default function InspectionRequestList({
  records,
  selectedId,
  currentUserId,
  onSelect,
  onDelete,
  onDownload,
  downloadingId,
}: InspectionRequestListProps) {
  if (records.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
        등록된 검측요청서가 없습니다.
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
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">요청일자</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">위치 및 공종</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap">검측부위</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-14">합격</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-10">엑셀</th>
            <th className="px-1.5 py-2 font-semibold whitespace-nowrap w-10">삭제</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {records.map((record, index) => {
            const isMine = !currentUserId || record.created_by === currentUserId
            return (
              <tr
                key={record.id}
                onClick={() => onSelect(record)}
                className={`cursor-pointer transition-colors ${
                  selectedId === record.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-1.5 py-2 text-gray-500 whitespace-nowrap">
                  {record.request_no || records.length - index}
                  {record.is_reinspection && (
                    <span className="text-red-600 font-semibold ml-0.5">(재)</span>
                  )}
                </td>
                <td className="px-1.5 py-2 text-gray-700 whitespace-nowrap">
                  {record.request_date || '-'}
                </td>
                <td className="px-1.5 py-2 text-gray-700 text-left max-w-[150px]">
                  <span className="line-clamp-2">{record.location_and_type || '-'}</span>
                </td>
                <td className="px-1.5 py-2 text-gray-700 text-left max-w-[120px]">
                  <span className="line-clamp-2">{record.inspection_part || '-'}</span>
                </td>
                <td className="px-1.5 py-2">
                  {record.pass_status === '합격' ? (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">합격</span>
                  ) : record.pass_status === '불합격' ? (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">불합격</span>
                  ) : (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">대기</span>
                  )}
                </td>
                <td className="px-1.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onDownload(record)}
                    disabled={downloadingId === record.id}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-md mx-auto flex disabled:opacity-40"
                    title="검측요청서 엑셀 다운로드"
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
