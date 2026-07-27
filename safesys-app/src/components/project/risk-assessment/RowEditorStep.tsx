'use client'

// 수시 위험성평가 4단계 — 양식 2행 1조 구조 그대로 표 행을 편집하고 위험성 점수·등급을 실시간 표시한다

import { useState } from 'react'
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { RiskAssessmentRow } from '@/lib/risk-assessment/types'
import { riskGrade } from '@/lib/risk-assessment/types'
import { requestAiRow } from './api'
import { createEmptyRow, createRowFromDraft } from './record'

interface RowEditorStepProps {
  rows: RiskAssessmentRow[]
  detailWork: string
  trigger: string
  siteContext: string
  onChange: (rows: RiskAssessmentRow[]) => void
}

const LEVELS = [1, 2, 3]

const GRADE_STYLE: Record<'상' | '중' | '하', string> = {
  상: 'bg-red-100 text-red-700',
  중: 'bg-amber-100 text-amber-800',
  하: 'bg-emerald-100 text-emerald-800',
}

const CELL = 'border border-gray-200 px-1.5 py-1 align-top'
const INPUT = 'w-full rounded border border-gray-200 px-1.5 py-1 text-xs text-gray-900 focus:border-blue-400 focus:outline-none'

/** 행 출처 표기 — 웹 화면 전용이고 엑셀 출력에는 나가지 않는다. 판별 불가·수기 행은 표시하지 않는다. */
function sourceLabel(row: RiskAssessmentRow): string {
  if (row.source === 'ai') return '출처: AI 전체 작성'
  if (row.hazardId != null) return `출처: DB ${row.hazardId}행`
  if (row.source === 'db') return '출처: DB'
  return ''
}

export default function RowEditorStep({ rows, detailWork, trigger, siteContext, onChange }: RowEditorStepProps) {
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const updateRow = (index: number, patch: Partial<RiskAssessmentRow>) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index: number) => {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index))
  }

  // 새 행의 세부작업·작업위치는 마지막 행의 값을 따른다
  const lastRow = rows[rows.length - 1]
  const nextDetailWork = lastRow?.detailWork || detailWork
  const nextWorkLocation = lastRow?.workLocation || ''

  const addRow = () => {
    onChange([...rows, createEmptyRow(nextDetailWork)])
  }

  const addAiRow = async () => {
    if (aiLoading) return
    setAiLoading(true)
    setAiError('')
    try {
      const draft = await requestAiRow({
        trigger,
        siteContext: siteContext || undefined,
        detailWork: nextDetailWork,
        existingHazards: rows.map((row) => row.hazard).filter(Boolean),
      })
      onChange([...rows, createRowFromDraft(draft, nextDetailWork, nextWorkLocation)])
    } catch (error: unknown) {
      setAiError(error instanceof Error ? error.message : 'AI 행 작성에 실패했습니다.')
    } finally {
      setAiLoading(false)
    }
  }

  const highRiskCount = rows.filter((row) => riskGrade(row.frequency, row.intensity).grade === '상').length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          총 {rows.length}행
          {highRiskCount > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">위험등급 상 {highRiskCount}건</span>}
          <span className="ml-2 text-xs text-gray-500">위험성 = 빈도 × 강도, 개선 후 3 이하로 관리합니다.</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addAiRow}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? '작성 중' : 'AI 행 추가'}
          </button>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Plus className="h-4 w-4" />빈 행 추가
          </button>
        </div>
      </div>

      {aiError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{aiError}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[1400px] border-collapse text-xs">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className={`${CELL} w-[9%] font-semibold`}>세부작업<br /><span className="font-normal text-gray-500">/ 작업위치</span></th>
              <th className={`${CELL} w-[10%] font-semibold`}>사용장비·설비·인원</th>
              <th className={`${CELL} w-[16%] font-semibold`}>유해·위험요인</th>
              <th className={`${CELL} w-[7%] font-semibold`}>재해형태</th>
              <th className={`${CELL} w-[5%] font-semibold`}>빈도</th>
              <th className={`${CELL} w-[5%] font-semibold`}>강도</th>
              <th className={`${CELL} w-[6%] font-semibold`}>위험등급</th>
              <th className={`${CELL} w-[20%] font-semibold`}>예방대책</th>
              <th className={`${CELL} w-[6%] font-semibold`}>개선후<br />위험성</th>
              <th className={`${CELL} w-[8%] font-semibold`}>이행담당</th>
              <th className={`${CELL} w-[4%] font-semibold`}>관리</th>
            </tr>
          </thead>

          {rows.map((row, index) => {
            const { score, grade } = riskGrade(row.frequency, row.intensity)
            const source = sourceLabel(row)
            return (
              <tbody key={`${row.hazardId ?? 'manual'}-${index}`} className="border-t-2 border-gray-300">
                <tr>
                  <td className={CELL}>
                    <input
                      value={row.detailWork}
                      onChange={(event) => updateRow(index, { detailWork: event.target.value })}
                      className={INPUT}
                      aria-label={`${index + 1}행 세부작업`}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      value={row.equipment}
                      onChange={(event) => updateRow(index, { equipment: event.target.value })}
                      placeholder="장비·설비·인원"
                      className={INPUT}
                      aria-label={`${index + 1}행 사용장비`}
                    />
                  </td>
                  <td className={CELL}>
                    <textarea
                      value={row.hazard}
                      onChange={(event) => updateRow(index, { hazard: event.target.value })}
                      rows={2}
                      className={INPUT}
                      aria-label={`${index + 1}행 위험요인`}
                    />
                    {source && <span className="mt-0.5 block text-right text-[10px] text-gray-400">{source}</span>}
                  </td>
                  <td className={CELL}>
                    <input
                      value={row.disasterType}
                      onChange={(event) => updateRow(index, { disasterType: event.target.value })}
                      className={INPUT}
                      aria-label={`${index + 1}행 재해형태`}
                    />
                  </td>
                  <td className={CELL}>
                    <select
                      value={row.frequency}
                      onChange={(event) => updateRow(index, { frequency: Number(event.target.value) })}
                      className={INPUT}
                      aria-label={`${index + 1}행 빈도`}
                    >
                      {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  </td>
                  <td className={CELL}>
                    <select
                      value={row.intensity}
                      onChange={(event) => updateRow(index, { intensity: Number(event.target.value) })}
                      className={INPUT}
                      aria-label={`${index + 1}행 강도`}
                    >
                      {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  </td>
                  <td className={`${CELL} text-center`}>
                    <span className={`inline-block rounded px-2 py-0.5 font-semibold ${GRADE_STYLE[grade]}`}>{score} · {grade}</span>
                  </td>
                  <td className={CELL}>
                    <textarea
                      value={row.measures.map((measure) => `o ${measure}`).join('\n')}
                      onChange={(event) => updateRow(index, {
                        // 표시용 글머리표(o)는 저장 데이터에서 걷어낸다
                        measures: event.target.value.split('\n').map((line) => line.replace(/^o\s?/, '')),
                      })}
                      rows={Math.min(6, Math.max(2, row.measures.length))}
                      placeholder="한 줄에 대책 하나"
                      className={INPUT}
                      aria-label={`${index + 1}행 예방대책`}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      type="number"
                      min={1}
                      max={9}
                      value={row.improvedRisk}
                      onChange={(event) => updateRow(index, { improvedRisk: Math.min(9, Math.max(1, Number(event.target.value) || 1)) })}
                      className={`${INPUT} text-center`}
                      aria-label={`${index + 1}행 개선후 위험성`}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      value={row.managerSub}
                      onChange={(event) => updateRow(index, { managerSub: event.target.value })}
                      placeholder="하도급사"
                      className={INPUT}
                      aria-label={`${index + 1}행 이행담당`}
                    />
                  </td>
                  <td className={`${CELL} text-center`} rowSpan={2}>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      aria-label={`${index + 1}행 삭제`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                <tr className="bg-gray-50/60">
                  <td className={CELL}>
                    <input
                      value={row.workLocation}
                      onChange={(event) => updateRow(index, { workLocation: event.target.value })}
                      placeholder="작업위치"
                      className={INPUT}
                      aria-label={`${index + 1}행 작업위치`}
                    />
                  </td>
                  <td className={CELL} colSpan={5}>
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-gray-500">검토·추록</span>
                      <input
                        value={row.reviewNote}
                        onChange={(event) => updateRow(index, { reviewNote: event.target.value })}
                        className={INPUT}
                        aria-label={`${index + 1}행 검토·추록`}
                      />
                    </div>
                  </td>
                  <td className={CELL} colSpan={2}>
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-gray-500">개선예정일</span>
                      <input
                        type="date"
                        value={row.improveDate}
                        onChange={(event) => updateRow(index, { improveDate: event.target.value })}
                        className={INPUT}
                        aria-label={`${index + 1}행 개선예정일`}
                      />
                    </div>
                  </td>
                  <td className={CELL} colSpan={2}>
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-gray-500">확인담당</span>
                      <input
                        value={row.managerMain}
                        onChange={(event) => updateRow(index, { managerMain: event.target.value })}
                        placeholder="원도급사"
                        className={INPUT}
                        aria-label={`${index + 1}행 확인담당`}
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            )
          })}
        </table>
      </div>

      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          표 행이 없습니다. 이전 단계에서 위험요인을 담거나 행 추가를 눌러 직접 작성해주세요.
        </p>
      )}
    </div>
  )
}
