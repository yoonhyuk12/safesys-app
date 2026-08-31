'use client'

// 품질시험 월례보고서 작성/수정 폼 — 헤더 정보 + 행 입력 테이블(소계·계·누계·시공잔량 자동 계산, 금월까지 누계는 직접 수정 가능)

import React, { useLayoutEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  QualityMonthlyReportFormData,
  QualityMonthlyReportRow,
  createEmptyRow,
  deriveRow,
  extractUnit,
  formatNum,
  formatThousands,
  parseNum,
  replaceUnit,
} from '@/lib/quality/quality-monthly-types'

interface QualityMonthlyReportFormProps {
  formData: QualityMonthlyReportFormData
  onChange: (data: QualityMonthlyReportFormData) => void
  isEditing: boolean // 수정 모드면 연/월 변경 잠금 (월 1건 고유키 보호)
}

// 공종 퀵입력 프리셋 — 버튼 클릭 시 해당 공종의 시험항목 행들을 일괄 추가, volume은 시공계획 물량 기본값
// workType은 버튼 라벨과 공종명이 다를 때만 지정한다(예: 슈미트해머 버튼 → 공종 콘크리트)
const WORK_TYPE_PRESETS: { label: string; workType?: string; items: string[]; volume: string }[] = [
  { label: '콘크리트', items: ['슬럼프', '공기량', '염화물', '단위수량', '압축강도'], volume: '㎥' },
  { label: '슈미트해머', workType: '콘크리트', items: ['슈미트해머'], volume: '㎥' },
  { label: '토공', items: ['현장밀도', '함수비', '다짐'], volume: '㎥' },
  { label: '강관서포트', items: ['평누름하중'], volume: '㎥' },
  { label: '강관비계', items: ['인장하중\n(강관)', '휨하중\n(조인트)', '인장하중\n(조인트)', '압축하중\n(조인트)'], volume: '㎡' },
  { label: '시스템비계', items: ['압축하중\n(수직재)', '휨하중\n(수평재)', '압축하중\n(가새재)', '휨하중\n(트러스)', '압축하중\n(연결조인트)', '인장하중\n(연결조인트)'], volume: '㎡' },
]

// 첫 행에 입력한 물량·횟수를 같은 공종 아래 행 전체로 전파하는 공종
const FIRST_ROW_PROPAGATE_WORK_TYPES = ['강관서포트', '강관비계']

// 시험 빈도 — 물량 N당 1회 (횟수 자동 계산, 소수점은 올림)
const CONCRETE_VOLUME_PER_TEST = 120 // 콘크리트 전 항목
const EARTHWORK_VOLUME_PER_TEST = 10000 // 토공 현장밀도·함수비

// 1,000단위 콤마를 자동 적용할 숫자 입력 필드 (월 실적 3칸은 자동집계값이 아니라 수정값 필드가 입력 대상)
const NUMERIC_FIELDS: ReadonlyArray<keyof QualityMonthlyReportRow> = [
  'yearlyPlan', 'yearlyPlanCount', 'monthVolume', 'monthQualityTestOverride',
  'monthExpertConfirmOverride', 'monthOtherConfirmOverride', 'nextMonthPlan', 'nextMonthPlanCount',
]

// 콘크리트 슬럼프 행에서 아래 콘크리트 행 전체로 동일 값이 전파되는 필드 (시공계획 물량 + 월 실적 전체 + 다음월 물량)
const SLUMP_PROPAGATE_FIELDS: ReadonlyArray<keyof QualityMonthlyReportRow> = [
  'yearlyPlan', 'monthVolume', 'monthQualityTestOverride', 'monthExpertConfirmOverride',
  'monthOtherConfirmOverride', 'nextMonthPlan',
]

// 토공 현장밀도·함수비 행은 물량·횟수 등 모든 숫자 입력을 서로 동일하게 유지
const EARTHWORK_SYNC_ITEMS = ['현장밀도', '함수비']
const EARTHWORK_SYNC_FIELDS: ReadonlyArray<keyof QualityMonthlyReportRow> = NUMERIC_FIELDS

// 물량 입력 필드 — 단위 자동 부착 대상이며, 토공은 다짐 등 나머지 행에도 그대로 전파
const VOLUME_FIELDS: ReadonlyArray<keyof QualityMonthlyReportRow> = [
  'yearlyPlan', 'monthVolume', 'nextMonthPlan',
]

// 금월까지 누계 6칸의 수정값 필드 — 값을 넣으면 자동 계산 대신 그 값이 쓰이고, 비우면 다시 자동 계산된다.
// 다른 입력칸과 달리 같은 공종 행으로 전파하지 않는다(누계는 행마다 실제 이력이 달라서).
const CUMUL_OVERRIDE_FIELDS: ReadonlyArray<keyof QualityMonthlyReportRow> = [
  'cumulVolumeOverride', 'cumulTotalOverride', 'cumulQualityTestOverride',
  'cumulConfirmSubtotalOverride', 'cumulExpertConfirmOverride', 'cumulOtherConfirmOverride',
]

// 시험 빈도 기준이 따로 없는 시험항목 — 공종 기준(콘크리트 120㎥당 1회 등)을 적용하지 않고 횟수를 사용자가 직접 넣는다
const NO_AUTO_COUNT_ITEMS = ['슈미트해머']

// 행의 횟수 자동 계산 기준 물량 — 자동 계산 대상이 아니면 null
const volumePerTestOf = (row: QualityMonthlyReportRow): number | null => {
  if (NO_AUTO_COUNT_ITEMS.includes(row.testItem.trim())) return null
  if (row.workType === '콘크리트') return CONCRETE_VOLUME_PER_TEST
  if (row.workType === '토공' && EARTHWORK_SYNC_ITEMS.includes(row.testItem.trim())) return EARTHWORK_VOLUME_PER_TEST
  return null
}

const INPUT_CLASS = 'w-full px-1.5 py-1 border border-gray-300 rounded text-sm text-gray-900'
const TH_CLASS = 'border border-gray-300 bg-gray-100 px-1.5 py-1.5 text-xs font-semibold text-gray-700 whitespace-nowrap'
const TD_CLASS = 'border border-gray-300 px-1 py-1'
const CALC_TD_CLASS = 'border border-gray-300 px-1.5 py-1 bg-blue-50 text-sm text-blue-900 text-right whitespace-nowrap'
// 자동값이 들어오는 입력칸 — 자동 상태는 계산 셀과 같은 톤(월 실적 amber, 누계 blue), 직접 고친 칸은 흰 배경·굵은 글씨로 구분
const CUMUL_AUTO_INPUT_CLASS = 'w-full px-1.5 py-1 border border-gray-300 rounded text-sm text-blue-900 bg-blue-50'
const CUMUL_EDITED_INPUT_CLASS = 'w-full px-1.5 py-1 border border-blue-500 rounded text-sm text-blue-900 font-semibold bg-white'
const MONTH_AUTO_INPUT_CLASS = 'w-full px-1.5 py-1 border border-gray-300 rounded text-sm text-amber-900 bg-amber-50'
const MONTH_EDITED_INPUT_CLASS = 'w-full px-1.5 py-1 border border-amber-500 rounded text-sm text-amber-900 font-semibold bg-white'

// 입력값 폭에 맞춰 늘어나는 인풋 — 같은 서체의 투명 사이저를 겹쳐 컬럼 폭이 데이터 최대폭을 따라가게 함
function SizedInput({
  value,
  minWidthClass,
  alignRight,
  inputClass,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string
  minWidthClass: string
  alignRight?: boolean // 숫자 컬럼은 우측 정렬
  inputClass?: string // 기본 입력칸 스타일 대체 (누계 칸의 자동/수정 상태 구분용)
  onChange: (value: string) => void
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
  onBlur?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // 콤마 자동 포맷으로 값이 재작성돼도 커서가 맨 뒤(단위 뒤)로 튀지 않게, 콤마 제외 문자 수 기준으로 위치 복원
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = inputRef.current
    if (el && pendingCaret.current !== null && document.activeElement === el) {
      let seen = 0
      let pos = 0
      while (pos < el.value.length && seen < pendingCaret.current) {
        if (el.value[pos] !== ',') seen++
        pos++
      }
      el.setSelectionRange(pos, pos)
    }
    pendingCaret.current = null
  })

  return (
    <div className={`grid ${minWidthClass}`}>
      <span aria-hidden="true" className="invisible whitespace-pre col-start-1 row-start-1 px-1.5 py-1 text-sm border border-transparent">
        {value + ' '}
      </span>
      <input
        ref={inputRef}
        type="text"
        size={1}
        value={value}
        onChange={(e) => {
          const caret = e.target.selectionStart ?? e.target.value.length
          pendingCaret.current = e.target.value.slice(0, caret).replace(/,/g, '').length
          onChange(e.target.value)
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`${inputClass ?? INPUT_CLASS} col-start-1 row-start-1${alignRight ? ' text-right' : ''}`}
      />
    </div>
  )
}

export default function QualityMonthlyReportForm({ formData, onChange, isEditing }: QualityMonthlyReportFormProps) {
  const updateField = <K extends keyof QualityMonthlyReportFormData>(
    field: K,
    value: QualityMonthlyReportFormData[K]
  ) => {
    onChange({ ...formData, [field]: value })
  }

  const updateRow = (index: number, field: keyof QualityMonthlyReportRow, value: string) => {
    if (NUMERIC_FIELDS.includes(field) || CUMUL_OVERRIDE_FIELDS.includes(field)) value = formatThousands(value)
    const edited = formData.report_rows[index]
    // 물량 칸에 숫자만 입력하면 년 시공계획 물량의 단위를 자동으로 붙임 (시공계획 자신은 기존 단위 유지)
    if (
      (VOLUME_FIELDS.includes(field) || field === 'cumulVolumeOverride') &&
      parseNum(value) !== null &&
      extractUnit(value) === ''
    ) {
      value += extractUnit(edited.yearlyPlan)
    }
    const normalizedWorkType = edited.workType.trim()
    // 같은 공종의 첫 행에서 물량을 입력하면 아래 동일 공종 행 전체로 전파
    const propagateVolume =
      VOLUME_FIELDS.includes(field) &&
      normalizedWorkType !== '' &&
      formData.report_rows.findIndex((row) => row.workType.trim() === normalizedWorkType) === index
    // 콘크리트 슬럼프 행에 시공계획 물량·월 실적 입력 시 나머지 콘크리트 시험항목 행에도 동일 값 전파
    const propagateFromSlump =
      SLUMP_PROPAGATE_FIELDS.includes(field) &&
      edited.workType === '콘크리트' &&
      edited.testItem.trim() === '슬럼프'
    // 토공 현장밀도·함수비 행끼리는 물량·계획 입력을 서로 동기화
    const propagateEarthwork =
      EARTHWORK_SYNC_FIELDS.includes(field) &&
      edited.workType === '토공' &&
      EARTHWORK_SYNC_ITEMS.includes(edited.testItem.trim())
    // 강관서포트·강관비계는 첫 행에 입력한 물량·횟수를 같은 공종 아래 시험항목 행 전체에 전파
    const propagateSteelPipe =
      NUMERIC_FIELDS.includes(field) &&
      FIRST_ROW_PROPAGATE_WORK_TYPES.includes(edited.workType) &&
      formData.report_rows.findIndex((r) => r.workType === edited.workType) === index
    const rows = formData.report_rows.map((row, i) => {
      const isTarget =
        i === index ||
        (propagateVolume && row.workType.trim() === normalizedWorkType) ||
        (propagateFromSlump && row.workType === '콘크리트') ||
        (propagateEarthwork &&
          row.workType === '토공' &&
          (EARTHWORK_SYNC_ITEMS.includes(row.testItem.trim()) || VOLUME_FIELDS.includes(field))) ||
        (propagateSteelPipe && row.workType === edited.workType)
      if (!isTarget) return row
      const updated = { ...row, [field]: value }
      // 물량 입력 시 횟수 자동 계산 (콘크리트 120㎥당 1회, 토공 현장밀도·함수비 1,000㎥당 1회, 올림)
      const volumePerTest = volumePerTestOf(updated)
      if ((field === 'yearlyPlan' || field === 'nextMonthPlan') && volumePerTest !== null) {
        const volume = parseNum(value)
        const count = volume !== null && volume > 0 ? formatThousands(String(Math.ceil(volume / volumePerTest))) : ''
        // 자동 계산 시에도 횟수 칸에 붙어 있던 단위(회 등)는 유지
        if (field === 'yearlyPlan') updated.yearlyPlanCount = count ? count + extractUnit(updated.yearlyPlanCount) : ''
        else updated.nextMonthPlanCount = count ? count + extractUnit(updated.nextMonthPlanCount) : ''
      }
      // 시공계획 물량의 단위를 수정하면 월 실적·다음월 물량의 단위도 동일하게 맞춤
      if (field === 'yearlyPlan') {
        const unit = extractUnit(value)
        updated.monthVolume = replaceUnit(updated.monthVolume, unit)
        updated.nextMonthPlan = replaceUnit(updated.nextMonthPlan, unit)
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
  const applyPreset = (index: number, preset: (typeof WORK_TYPE_PRESETS)[number]) => {
    const workType = preset.workType ?? preset.label
    const rows = [...formData.report_rows]
    rows[index] = {
      ...rows[index],
      workType,
      testItem: preset.items[0],
      yearlyPlan: rows[index].yearlyPlan || preset.volume,
      monthVolume: rows[index].monthVolume || preset.volume,
      nextMonthPlan: rows[index].nextMonthPlan || preset.volume,
    }
    const extraRows = preset.items.slice(1).map((item) => ({
      ...createEmptyRow(),
      workType,
      testItem: item,
      yearlyPlan: preset.volume,
      monthVolume: preset.volume,
      nextMonthPlan: preset.volume,
    }))
    rows.splice(index + 1, 0, ...extraRows)
    onChange({ ...formData, report_rows: rows })
    setQuickInput(null)
  }

  return (
    <div className="space-y-4 lg:w-fit">
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
          <label className="block text-xs font-medium text-gray-600 mb-1">작성자 (품질관리자)</label>
          <input
            type="text"
            value={formData.author_name}
            onChange={(e) => updateField('author_name', e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">확인자 (공사감독)</label>
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
              <th rowSpan={3} className={TH_CLASS}>공종</th>
              <th rowSpan={3} className={TH_CLASS}>시험항목</th>
              <th rowSpan={3} className={TH_CLASS}></th>
              <th colSpan={2} className={TH_CLASS}>{formData.report_year}년<br />시공계획</th>
              <th colSpan={6} className={`${TH_CLASS} bg-amber-50`}>{formData.report_month}월 실적</th>
              <th colSpan={6} className={`${TH_CLASS} bg-blue-100`}>금월까지 누계</th>
              <th colSpan={2} className={TH_CLASS}>다음월<br />시공계획</th>
              <th colSpan={2} className={`${TH_CLASS} bg-blue-100`}>시공잔량</th>
            </tr>
            <tr>
              <th rowSpan={2} className={TH_CLASS}>물량</th>
              <th rowSpan={2} className={TH_CLASS}>횟수</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-amber-50`}>시공물량</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-amber-50`}>계(①+②)</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-amber-50`}>품질시험①</th>
              <th colSpan={3} className={`${TH_CLASS} bg-amber-50`}>확인시험②</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-blue-100`}>시공물량</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-blue-100`}>계(①+②)</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-blue-100`}>품질시험①</th>
              <th colSpan={3} className={`${TH_CLASS} bg-blue-100`}>확인시험②</th>
              <th rowSpan={2} className={TH_CLASS}>물량</th>
              <th rowSpan={2} className={TH_CLASS}>횟수</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-blue-100`}>물량</th>
              <th rowSpan={2} className={`${TH_CLASS} bg-blue-100`}>횟수</th>
            </tr>
            <tr>
              <th className={`${TH_CLASS} bg-amber-50`}>소계</th>
              <th className={`${TH_CLASS} bg-amber-50`}>전문기관</th>
              <th className={`${TH_CLASS} bg-amber-50`}>기타확인</th>
              <th className={`${TH_CLASS} bg-blue-100`}>소계</th>
              <th className={`${TH_CLASS} bg-blue-100`}>전문기관</th>
              <th className={`${TH_CLASS} bg-blue-100`}>기타확인</th>
            </tr>
          </thead>
          <tbody>
            {formData.report_rows.length === 0 && (
              <tr>
                <td colSpan={21} className="border border-gray-300 px-3 py-6 text-center text-sm text-gray-400">
                  행 추가 버튼으로 공종/시험항목을 등록해주세요.
                </td>
              </tr>
            )}
            {formData.report_rows.map((row, index) => {
              const d = deriveRow(row)
              const volumeUnit = extractUnit(row.yearlyPlan)
              const countUnit = extractUnit(row.yearlyPlanCount)
              // 월 실적·금월까지 누계 칸 — 수정값이 있으면 그 값을, 없으면 자동값을 보여준다 (지우면 자동으로 복귀)
              const overrideCell = (
                field: keyof QualityMonthlyReportRow,
                auto: number | null,
                unit: string,
                minWidthClass: string,
                tone: 'month' | 'cumul'
              ) => {
                const override = row[field] ?? ''
                const isMonth = tone === 'month'
                return (
                  <td className={`${TD_CLASS} ${isMonth ? 'bg-amber-50/50' : 'bg-blue-50/50'}`}>
                    <SizedInput
                      value={override || (auto !== null ? formatNum(auto) + unit : '')}
                      minWidthClass={minWidthClass}
                      alignRight
                      inputClass={
                        override
                          ? (isMonth ? MONTH_EDITED_INPUT_CLASS : CUMUL_EDITED_INPUT_CLASS)
                          : (isMonth ? MONTH_AUTO_INPUT_CLASS : CUMUL_AUTO_INPUT_CLASS)
                      }
                      onChange={(v) => updateRow(index, field, v)}
                    />
                  </td>
                )
              }
              return (
                <tr key={index}>
                  <td className={TD_CLASS}>
                    <SizedInput
                      value={row.workType}
                      minWidthClass="min-w-20"
                      onChange={(v) => updateRow(index, 'workType', v)}
                      onFocus={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setQuickInput({ index, top: rect.top, left: rect.right + 6 })
                      }}
                      onBlur={() => setQuickInput(null)}
                    />
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
                    <SizedInput value={row.yearlyPlan} minWidthClass="min-w-20" alignRight onChange={(v) => updateRow(index, 'yearlyPlan', v)} />
                  </td>
                  <td className={TD_CLASS}>
                    <SizedInput value={row.yearlyPlanCount} minWidthClass="min-w-16" alignRight onChange={(v) => updateRow(index, 'yearlyPlanCount', v)} />
                  </td>
                  <td className={`${TD_CLASS} bg-amber-50/50`}>
                    <SizedInput value={row.monthVolume} minWidthClass="min-w-20" alignRight onChange={(v) => updateRow(index, 'monthVolume', v)} />
                  </td>
                  <td className={CALC_TD_CLASS}>{d.monthTotal !== null ? formatNum(d.monthTotal) + countUnit : '-'}</td>
                  {/* 월 실적 3칸 — 실시대장 자동 집계값이 기본, 칸을 직접 고치면 그 값이 우선하고 비우면 자동값으로 복귀 */}
                  {overrideCell('monthQualityTestOverride', parseNum(row.monthQualityTest), countUnit, 'min-w-16', 'month')}
                  <td className={CALC_TD_CLASS}>{d.monthConfirmSubtotal !== null ? formatNum(d.monthConfirmSubtotal) + countUnit : '-'}</td>
                  {overrideCell('monthExpertConfirmOverride', parseNum(row.monthExpertConfirm), countUnit, 'min-w-16', 'month')}
                  {overrideCell('monthOtherConfirmOverride', parseNum(row.monthOtherConfirm), countUnit, 'min-w-16', 'month')}
                  {/* 금월까지 누계 — 직전 보고서 이월 누계 + 금월 실적 자동 합산, 필요하면 칸을 직접 고쳐 덮어쓸 수 있음 */}
                  {overrideCell('cumulVolumeOverride', d.cumulVolume, volumeUnit, 'min-w-20', 'cumul')}
                  {overrideCell('cumulTotalOverride', d.cumulTotal, countUnit, 'min-w-16', 'cumul')}
                  {overrideCell('cumulQualityTestOverride', d.cumulQualityTest, countUnit, 'min-w-16', 'cumul')}
                  {overrideCell('cumulConfirmSubtotalOverride', d.cumulConfirmSubtotal, countUnit, 'min-w-16', 'cumul')}
                  {overrideCell('cumulExpertConfirmOverride', d.cumulExpertConfirm, countUnit, 'min-w-16', 'cumul')}
                  {overrideCell('cumulOtherConfirmOverride', d.cumulOtherConfirm, countUnit, 'min-w-16', 'cumul')}
                  <td className={TD_CLASS}>
                    <SizedInput value={row.nextMonthPlan} minWidthClass="min-w-20" alignRight onChange={(v) => updateRow(index, 'nextMonthPlan', v)} />
                  </td>
                  <td className={TD_CLASS}>
                    <SizedInput value={row.nextMonthPlanCount} minWidthClass="min-w-16" alignRight onChange={(v) => updateRow(index, 'nextMonthPlanCount', v)} />
                  </td>
                  <td className={CALC_TD_CLASS}>{d.remaining !== null ? formatNum(d.remaining) + volumeUnit : '-'}</td>
                  <td className={CALC_TD_CLASS}>{d.remainingCount !== null ? formatNum(d.remainingCount) + countUnit : '-'}</td>
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
          ※ 시험실적은 실시대장의 일련번호 기준으로 자동 반영되며(실시대장에 없는 항목은 월 실적 칸에 직접 입력), 확인시험 소계·계(①+②)·누계·시공잔량도 자동 계산되어 PDF 양식에 반영됩니다.
          <br />
          ※ 월 실적 3칸과 금월까지 누계 6칸은 자동값이 그대로 보이지만 직접 고쳐 쓸 수 있습니다(흰 배경·굵은 글씨 = 수정한 칸). 칸을 비우면 다시 자동값으로 돌아갑니다.
          <br />
          ※ 수정한 값은 시공잔량·PDF에 그대로 반영되고, 다음 달 보고서를 추가할 때 전월까지 누계로 이월됩니다(실시대장 집계가 이월값을 덮어쓰지 않습니다).
        </p>
      </div>
    </div>
  )
}
