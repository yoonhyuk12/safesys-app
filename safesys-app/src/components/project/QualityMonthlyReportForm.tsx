'use client'

// 품질시험 월례보고서 작성/수정 폼 — 헤더 정보 + 행 입력 테이블(소계·계·누계·시공잔량 자동 계산)

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  QualityMonthlyReportFormData,
  QualityMonthlyReportRow,
  createEmptyRow,
  deriveRow,
  formatNum,
} from '@/lib/quality/quality-monthly-types'

interface QualityMonthlyReportFormProps {
  formData: QualityMonthlyReportFormData
  onChange: (data: QualityMonthlyReportFormData) => void
  isEditing: boolean // 수정 모드면 연/월 변경 잠금 (월 1건 고유키 보호)
}

const INPUT_CLASS = 'w-full px-1.5 py-1 border border-gray-300 rounded text-sm text-gray-900'
const TH_CLASS = 'border border-gray-300 bg-gray-100 px-1.5 py-1.5 text-xs font-semibold text-gray-700 whitespace-nowrap'
const TD_CLASS = 'border border-gray-300 px-1 py-1'
const CALC_TD_CLASS = 'border border-gray-300 px-1.5 py-1 bg-blue-50 text-sm text-blue-900 text-center whitespace-nowrap'

export default function QualityMonthlyReportForm({ formData, onChange, isEditing }: QualityMonthlyReportFormProps) {
  const updateField = <K extends keyof QualityMonthlyReportFormData>(
    field: K,
    value: QualityMonthlyReportFormData[K]
  ) => {
    onChange({ ...formData, [field]: value })
  }

  const updateRow = (index: number, field: keyof QualityMonthlyReportRow, value: string) => {
    const rows = formData.report_rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    onChange({ ...formData, report_rows: rows })
  }

  const addRow = () => {
    onChange({ ...formData, report_rows: [...formData.report_rows, createEmptyRow()] })
  }

  const removeRow = (index: number) => {
    onChange({ ...formData, report_rows: formData.report_rows.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      {/* 헤더 정보 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">보고 연도</label>
          <input
            type="number"
            value={formData.report_year}
            onChange={(e) => updateField('report_year', parseInt(e.target.value) || new Date().getFullYear())}
            disabled={isEditing}
            className={`${INPUT_CLASS} disabled:bg-gray-100 disabled:text-gray-500`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">보고 월</label>
          <select
            value={formData.report_month}
            onChange={(e) => updateField('report_month', parseInt(e.target.value))}
            disabled={isEditing}
            className={`${INPUT_CLASS} disabled:bg-gray-100 disabled:text-gray-500`}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">지구명</label>
          <input
            type="text"
            value={formData.district_name}
            onChange={(e) => updateField('district_name', e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">작성자 (현장대리인)</label>
          <input
            type="text"
            value={formData.author_name}
            onChange={(e) => updateField('author_name', e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">확인자 (공사사무소장)</label>
          <input
            type="text"
            value={formData.confirmer_name}
            onChange={(e) => updateField('confirmer_name', e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* 행 입력 테이블 */}
      <div className="overflow-x-auto border border-gray-300 rounded-lg">
        <table className="border-collapse min-w-max">
          <thead>
            <tr>
              <th rowSpan={2} className={TH_CLASS}>공종</th>
              <th rowSpan={2} className={TH_CLASS}>시험항목</th>
              <th rowSpan={2} className={TH_CLASS}>{formData.report_year}년<br />시공계획</th>
              <th colSpan={4} className={`${TH_CLASS} bg-amber-50`}>{formData.report_month}월 실적</th>
              <th colSpan={4} className={TH_CLASS}>전월까지 누계</th>
              <th rowSpan={2} className={TH_CLASS}>다음월<br />시공계획</th>
              <th colSpan={3} className={`${TH_CLASS} bg-blue-100`}>자동 계산</th>
              <th rowSpan={2} className={TH_CLASS}></th>
            </tr>
            <tr>
              <th className={`${TH_CLASS} bg-amber-50`}>시공물량</th>
              <th className={`${TH_CLASS} bg-amber-50`}>품질시험①</th>
              <th className={`${TH_CLASS} bg-amber-50`}>전문기관②</th>
              <th className={`${TH_CLASS} bg-amber-50`}>기타확인②</th>
              <th className={TH_CLASS}>시공물량</th>
              <th className={TH_CLASS}>품질시험</th>
              <th className={TH_CLASS}>전문기관</th>
              <th className={TH_CLASS}>기타확인</th>
              <th className={`${TH_CLASS} bg-blue-100`}>누계물량</th>
              <th className={`${TH_CLASS} bg-blue-100`}>시험 계</th>
              <th className={`${TH_CLASS} bg-blue-100`}>시공잔량</th>
            </tr>
          </thead>
          <tbody>
            {formData.report_rows.length === 0 && (
              <tr>
                <td colSpan={16} className="border border-gray-300 px-3 py-6 text-center text-sm text-gray-400">
                  행 추가 버튼으로 공종/시험항목을 등록해주세요.
                </td>
              </tr>
            )}
            {formData.report_rows.map((row, index) => {
              const d = deriveRow(row)
              return (
                <tr key={index}>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.workType} onChange={(e) => updateRow(index, 'workType', e.target.value)} className={`${INPUT_CLASS} min-w-20`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.testItem} onChange={(e) => updateRow(index, 'testItem', e.target.value)} className={`${INPUT_CLASS} min-w-24`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.yearlyPlan} onChange={(e) => updateRow(index, 'yearlyPlan', e.target.value)} className={`${INPUT_CLASS} min-w-20`} />
                  </td>
                  <td className={`${TD_CLASS} bg-amber-50/50`}>
                    <input type="text" value={row.monthVolume} onChange={(e) => updateRow(index, 'monthVolume', e.target.value)} className={`${INPUT_CLASS} min-w-20`} />
                  </td>
                  <td className={`${TD_CLASS} bg-amber-50/50`}>
                    <input type="text" value={row.monthQualityTest} onChange={(e) => updateRow(index, 'monthQualityTest', e.target.value)} className={`${INPUT_CLASS} min-w-16`} />
                  </td>
                  <td className={`${TD_CLASS} bg-amber-50/50`}>
                    <input type="text" value={row.monthExpertConfirm} onChange={(e) => updateRow(index, 'monthExpertConfirm', e.target.value)} className={`${INPUT_CLASS} min-w-16`} />
                  </td>
                  <td className={`${TD_CLASS} bg-amber-50/50`}>
                    <input type="text" value={row.monthOtherConfirm} onChange={(e) => updateRow(index, 'monthOtherConfirm', e.target.value)} className={`${INPUT_CLASS} min-w-16`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.prevCumulVolume} onChange={(e) => updateRow(index, 'prevCumulVolume', e.target.value)} className={`${INPUT_CLASS} min-w-20`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.prevCumulQualityTest} onChange={(e) => updateRow(index, 'prevCumulQualityTest', e.target.value)} className={`${INPUT_CLASS} min-w-16`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.prevCumulExpertConfirm} onChange={(e) => updateRow(index, 'prevCumulExpertConfirm', e.target.value)} className={`${INPUT_CLASS} min-w-16`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.prevCumulOtherConfirm} onChange={(e) => updateRow(index, 'prevCumulOtherConfirm', e.target.value)} className={`${INPUT_CLASS} min-w-16`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.nextMonthPlan} onChange={(e) => updateRow(index, 'nextMonthPlan', e.target.value)} className={`${INPUT_CLASS} min-w-20`} />
                  </td>
                  <td className={CALC_TD_CLASS}>{formatNum(d.cumulVolume) || '-'}</td>
                  <td className={CALC_TD_CLASS}>{formatNum(d.cumulTotal) || '-'}</td>
                  <td className={CALC_TD_CLASS}>{formatNum(d.remaining) || '-'}</td>
                  <td className={`${TD_CLASS} text-center`}>
                    <button
                      onClick={() => removeRow(index)}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      title="행 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={addRow}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100"
        >
          <Plus className="h-4 w-4" />
          행 추가
        </button>
        <p className="text-xs text-gray-400">
          ※ 확인시험 소계, 계(①+②), 누계, 시공잔량은 자동 계산되어 PDF 양식에 반영됩니다.
        </p>
      </div>
    </div>
  )
}
