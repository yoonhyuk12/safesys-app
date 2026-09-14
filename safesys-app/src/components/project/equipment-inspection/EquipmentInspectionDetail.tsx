'use client'

// 제출된 장비 일일점검 한 건의 상세 — 제출 당시 원문 항목·결과·서명을 그대로 보여준다.

import { Download, Loader2, Pencil } from 'lucide-react'
import type { EquipmentInspection, EquipmentInspectionResult } from '@/lib/equipment-inspection-types'
import { EQUIPMENT_INSPECTION_RESULT_LABELS } from '@/lib/equipment-inspections'

interface EquipmentInspectionDetailProps {
  record: EquipmentInspection
  downloading: boolean
  /** 현장 정보를 아직 못 읽었으면 이름 없는 문서가 나가므로 내려받기를 잠근다. */
  downloadDisabled: boolean
  /** 제출한 본인에게만 수정 진입점을 준다. 남의 서명이 달린 점검은 고칠 수 없다. */
  canEdit: boolean
  onDownload: () => void
  onEdit: () => void
}

const RESULT_BADGE: Record<EquipmentInspectionResult, string> = {
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  na: 'bg-gray-100 text-gray-700',
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  )
}

export default function EquipmentInspectionDetail({
  record,
  downloading,
  downloadDisabled,
  canEdit,
  onDownload,
  onEdit,
}: EquipmentInspectionDetailProps) {
  const answers = record.answers ?? []

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onEdit}
            className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            수정
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCell label="점검일" value={record.inspection_date} />
        <InfoCell label="장비" value={record.equipment_name} />
        <InfoCell label="업체명" value={record.company_name} />
        <InfoCell label="점검자" value={record.inspector_name} />
        <InfoCell label="차량번호" value={record.vehicle_number} />
        <InfoCell label="기계번호" value={record.machine_number} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">분류</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">점검항목</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">결과</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비고</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {answers.map((answer) => (
                <tr key={answer.id}>
                  <td className="px-3 py-3 text-xs text-center text-gray-600 whitespace-nowrap">{answer.category}</td>
                  <td className="px-3 py-3 text-xs text-left text-gray-900 whitespace-pre-line">{answer.text}</td>
                  <td className="px-3 py-3 text-xs text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${RESULT_BADGE[answer.result]}`}
                    >
                      {EQUIPMENT_INSPECTION_RESULT_LABELS[answer.result]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-left text-gray-700 whitespace-pre-line">{answer.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {record.remarks && (
        <div>
          <p className="text-xs text-gray-500 mb-1">종합 비고</p>
          <p className="text-sm text-gray-900 whitespace-pre-line">{record.remarks}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">점검자 서명</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={record.signature}
            alt={`${record.inspector_name} 서명`}
            className="h-16 border border-gray-200 rounded-md bg-white"
          />
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadDisabled || downloading}
          title={downloadDisabled ? '현장 정보를 불러온 뒤 내려받을 수 있습니다' : undefined}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? '생성 중...' : 'HWPX 다운로드'}
        </button>
      </div>
    </div>
  )
}
