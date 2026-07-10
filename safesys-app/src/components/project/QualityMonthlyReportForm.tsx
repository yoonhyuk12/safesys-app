'use client'

// 품질시험 월례보고서 작성/수정 폼 — 헤더 정보 + 행 입력 테이블(소계·계·누계·시공잔량 자동 계산)

import React, { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  QualityMonthlyReportFormData,
  QualityMonthlyReportRow,
  createEmptyRow,
  deriveRow,
  formatNum,
  parseNum,
} from '@/lib/quality/quality-monthly-types'

interface QualityMonthlyReportFormProps {
  formData: QualityMonthlyReportFormData
  onChange: (data: QualityMonthlyReportFormData) => void
  isEditing: boolean // 수정 모드면 연/월 변경 잠금 (월 1건 고유키 보호)
}

// 공종 퀵입력 프리셋 — 버튼 클릭 시 해당 공종의 시험항목 행들을 일괄 추가, volume은 시공계획 물량 기본값
const WORK_TYPE_PRESETS: { label: string; items: string[]; volume: string }[] = [
  { label: '콘크리트', items: ['슬럼프', '공기량', '염화물', '단위수량', '압축강도'], volume: '㎥' },
  { label: '토공', items: ['현장밀도', '함수비', '다짐'], volume: '토취장마다' },
  { label: '강관비계', items: ['인장하중\n(비계용)', '휨하중\n(강관조인트)', '인장하중\n(강관조인트)', '압축하중\n(강관조인트)'], volume: '공급자마다' },
  { label: '시스템비계', items: ['압축하중\n(수직재)', '휨하중\n(수평재)', '압축하중\n(가새재)', '휨하중\n(트러스)', '압축하중\n(연결조인트)', '인장하중\n(연결조인트)'], volume: '공급자마다' },
]

// 콘크리트 시험 빈도 — 물량 120㎥당 1회 (횟수 자동 계산, 소수점은 올림)
const CONCRETE_VOLUME_PER_TEST = 120

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
    const edited = formData.report_rows[index]
    // 콘크리트 슬럼프 행에 물량 입력 시 나머지 콘크리트 시험항목 행에도 동일 물량 전파
    const propagateVolume =
      field === 'yearlyPlan' && edited.workType === '콘크리트' && edited.testItem.trim() === '슬럼프'
    const rows = formData.report_rows.map((row, i) => {
      const isTarget = i === index || (propagateVolume && row.workType === '콘크리트')
      if (!isTarget) return row
      const updated = i === index ? { ...row, [field]: value } : { ...row, yearlyPlan: value }
      // 콘크리트 물량 입력 시 횟수 자동 계산 (120㎥당 1회, 올림)
      if (field === 'yearlyPlan' && updated.workType === '콘크리트') {
        const volume = parseNum(value)
        updated.yearlyPlanCount = volume !== null && volume > 0 ? String(Math.ceil(volume / CONCRETE_VOLUME_PER_TEST)) : ''
      }
      return updated
    })
    onChange({ ...formData, report_rows: rows })
  }

  const addRow = () => {
    onChange({ ...formData, report_rows: [...formData.report_rows, createEmptyRow()] })
  }

  const removeRow = (index: number) => {
    onChange({ ...formData, report_rows: formData.report_rows.filter((_, i) => i !== index) })
  }

  // 공종 입력 포커스 시 입력칸 옆에 띄울 퀵입력 플로팅 패널 (행 인덱스 + fixed 좌표)
  const [quickInput, setQuickInput] = useState<{ index: number; top: number; left: number } | null>(null)

  // 퀵입력 적용 — 현재 행에 공종+첫 시험항목을 채우고, 나머지 시험항목은 아래에 행으로 추가. 물량 기본값도 함께 채움
  const applyPreset = (index: number, preset: { label: string; items: string[]; volume: string }) => {
    const rows = [...formData.report_rows]
    rows[index] = {
      ...rows[index],
      workType: preset.label,
      testItem: preset.items[0],
      yearlyPlan: rows[index].yearlyPlan || preset.volume,
      monthVolume: rows[index].monthVolume || preset.volume,
    }
    const extraRows = preset.items.slice(1).map((item) => ({
      ...createEmptyRow(),
      workType: preset.label,
      testItem: item,
      yearlyPlan: preset.volume,
      monthVolume: preset.volume,
    }))
    rows.splice(index + 1, 0, ...extraRows)
    onChange({ ...formData, report_rows: rows })
    setQuickInput(null)
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

      {/* 공종 퀵입력 플로팅 패널 — 포커스된 공종 입력칸 바로 옆에 표시 (fixed라 표 스크롤 영역에 안 갇힘) */}
      {quickInput !== null && (
        <div
          className="fixed z-50 grid grid-cols-2 gap-1 w-max bg-white border border-gray-200 rounded-md shadow-lg p-1"
          style={{ top: quickInput.top, left: quickInput.left }}
        >
          {WORK_TYPE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onMouseDown={(e) => {
                e.preventDefault()
                applyPreset(quickInput.index, preset)
              }}
              className="px-2 py-0.5 text-xs text-blue-700 bg-blue-50 border border-blue-300 rounded hover:bg-blue-100 whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* 행 입력 테이블 */}
      <div className="overflow-x-auto border border-gray-300 rounded-lg">
        <table className="border-collapse min-w-max">
          <thead>
            <tr>
              <th rowSpan={2} className={TH_CLASS}>공종</th>
              <th rowSpan={2} className={TH_CLASS}>시험항목</th>
              <th rowSpan={2} className={TH_CLASS}></th>
              <th colSpan={2} className={TH_CLASS}>{formData.report_year}년<br />시공계획</th>
              <th colSpan={4} className={`${TH_CLASS} bg-amber-50`}>{formData.report_month}월 실적</th>
              <th colSpan={4} className={TH_CLASS}>전월까지 누계</th>
              <th rowSpan={2} className={TH_CLASS}>다음월<br />시공계획</th>
              <th colSpan={3} className={`${TH_CLASS} bg-blue-100`}>자동 계산</th>
            </tr>
            <tr>
              <th className={TH_CLASS}>물량</th>
              <th className={TH_CLASS}>횟수</th>
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
                <td colSpan={17} className="border border-gray-300 px-3 py-6 text-center text-sm text-gray-400">
                  행 추가 버튼으로 공종/시험항목을 등록해주세요.
                </td>
              </tr>
            )}
            {formData.report_rows.map((row, index) => {
              const d = deriveRow(row)
              return (
                <tr key={index}>
                  <td className={TD_CLASS}>
                    {/* 입력값과 같은 서체의 투명 사이저를 겹쳐 컬럼 폭이 데이터 최대폭을 따라가게 함 */}
                    <div className="grid min-w-20">
                      <span aria-hidden="true" className="invisible whitespace-pre col-start-1 row-start-1 px-1.5 py-1 text-sm border border-transparent">
                        {row.workType + ' '}
                      </span>
                      <input
                        type="text"
                        size={1}
                        value={row.workType}
                        onChange={(e) => updateRow(index, 'workType', e.target.value)}
                        onFocus={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setQuickInput({ index, top: rect.top, left: rect.right + 6 })
                        }}
                        onBlur={() => setQuickInput(null)}
                        className={`${INPUT_CLASS} col-start-1 row-start-1`}
                      />
                    </div>
                  </td>
                  <td className={TD_CLASS}>
                    <div className="grid min-w-24">
                      <span aria-hidden="true" className="invisible whitespace-pre col-start-1 row-start-1 px-1.5 py-1 text-sm border border-transparent">
                        {row.testItem + ' '}
                      </span>
                      <textarea
                        cols={1}
                        value={row.testItem}
                        onChange={(e) => updateRow(index, 'testItem', e.target.value)}
                        rows={Math.max(1, row.testItem.split('\n').length)}
                        className={`${INPUT_CLASS} col-start-1 row-start-1 resize-none`}
                      />
                    </div>
                  </td>
                  <td className={`${TD_CLASS} text-center`}>
                    <button
                      onClick={() => removeRow(index)}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      title="행 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.yearlyPlan} onChange={(e) => updateRow(index, 'yearlyPlan', e.target.value)} className={`${INPUT_CLASS} min-w-20`} />
                  </td>
                  <td className={TD_CLASS}>
                    <input type="text" value={row.yearlyPlanCount} onChange={(e) => updateRow(index, 'yearlyPlanCount', e.target.value)} className={`${INPUT_CLASS} min-w-16`} />
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
