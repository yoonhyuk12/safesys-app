'use client'

// 공정률 입력 전용 모달
// X축: 월 단위 (착공년월 → 준공년월), Y축: 공정률(0~100%)
// 착공(0%) → 수동 기준점들 → 준공(100%)을 잇는 직선보간 차트를 실시간 표시
// 다른 날짜의 수동 공정률은 해당 날짜의 작업일보 행에 즉시 저장(없으면 생성),
// 선택 날짜의 공정률은 폼으로 반영되어 작업일보 저장 시 함께 저장됨

import React, { useState, useEffect, useRef } from 'react'
import { Plus, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  ProgressAnchor,
  computeProgressRate,
} from '@/lib/work-daily-report/work-daily-report-types'

interface DraftAnchor {
  date: string
  rate: string
}

interface ProgressRateModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  userId: string
  reportDate: string
  constructionStart?: string | null
  constructionEnd?: string | null
  anchors: ProgressAnchor[]       // 저장된 수동 기준점들 (선택 날짜 포함 가능)
  currentManual: string           // 폼에서 아직 저장 전인 선택 날짜의 수동 공정률
  onSaved: (result: { anchors: ProgressAnchor[]; currentRate: string | null }) => void
}

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : '알 수 없는 오류'

const isDateStr = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

// ── SVG 차트 상수
const W = 640
const H = 300
const ML = 46  // left margin (Y축 라벨)
const MR = 16
const MT = 16
const MB = 42  // bottom margin (X축 라벨)

export default function ProgressRateModal({
  isOpen,
  onClose,
  projectId,
  userId,
  reportDate,
  constructionStart,
  constructionEnd,
  anchors,
  currentManual,
  onSaved,
}: ProgressRateModalProps) {
  const [draft, setDraft] = useState<DraftAnchor[]>([])
  const [saving, setSaving] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const draggingRef = useRef(false)

  // 모달이 열릴 때 초안 구성: 저장된 기준점 + 선택 날짜의 미저장 수동값
  useEffect(() => {
    if (!isOpen) return
    const base = new Map<string, string>()
    anchors.forEach(a => base.set(a.date, String(a.rate)))
    if (currentManual.trim() !== '') {
      base.set(reportDate, currentManual.trim())
    } else if (!anchors.some(a => a.date === reportDate)) {
      // 선택 날짜 행을 기본으로 노출 (값 비움 — 입력 유도)
      base.set(reportDate, '')
    }
    const rows = Array.from(base.entries())
      .map(([date, rate]) => ({ date, rate }))
      .sort((a, b) => a.date.localeCompare(b.date))
    setDraft(rows)
  }, [isOpen, anchors, currentManual, reportDate])

  if (!isOpen) return null

  const hasPeriod = !!constructionStart && !!constructionEnd &&
    isDateStr(constructionStart) && isDateStr(constructionEnd) &&
    constructionStart < constructionEnd

  // 유효한 초안 기준점 (차트 실시간 반영)
  const validAnchors: ProgressAnchor[] = draft
    .filter(d => isDateStr(d.date) && d.rate.trim() !== '' && !isNaN(parseFloat(d.rate)))
    .map(d => ({ date: d.date, rate: Math.min(100, Math.max(0, parseFloat(d.rate))) }))

  // 선택 날짜의 공정률 미리보기 (선택 날짜 자신의 기준점 우선)
  const currentEntry = validAnchors.find(a => a.date === reportDate)
  const previewRate = currentEntry
    ? currentEntry.rate.toFixed(1)
    : computeProgressRate(constructionStart, constructionEnd, reportDate,
        validAnchors.filter(a => a.date !== reportDate))

  // ── 차트 좌표 계산
  const startT = hasPeriod ? new Date(constructionStart!).getTime() : 0
  const endT = hasPeriod ? new Date(constructionEnd!).getTime() : 1
  const xScale = (t: number) => ML + ((t - startT) / (endT - startT)) * (W - ML - MR)
  const yScale = (r: number) => MT + ((100 - r) / 100) * (H - MT - MB)

  // 보간선 포인트: 착공(0) + 기간 내 기준점 + 준공(100)
  const linePoints = hasPeriod
    ? [
        { t: startT, r: 0 },
        ...validAnchors
          .map(a => ({ t: new Date(a.date).getTime(), r: a.rate }))
          .filter(p => p.t > startT && p.t < endT)
          .sort((a, b) => a.t - b.t),
        { t: endT, r: 100 },
      ]
    : []
  const polyline = linePoints.map(p => `${xScale(p.t).toFixed(1)},${yScale(p.r).toFixed(1)}`).join(' ')

  // 월 단위 X축 눈금 (기간이 길면 간격 자동 확대)
  const monthTicks: { t: number; label: string }[] = []
  if (hasPeriod) {
    const start = new Date(constructionStart!)
    const end = new Date(constructionEnd!)
    const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    const step = Math.max(1, Math.ceil(totalMonths / 12))
    const tick = new Date(start.getFullYear(), start.getMonth(), 1)
    if (tick.getTime() < startT) tick.setMonth(tick.getMonth() + 1)
    while (tick.getTime() <= endT) {
      monthTicks.push({
        t: tick.getTime(),
        label: `${String(tick.getFullYear()).slice(2)}.${String(tick.getMonth() + 1).padStart(2, '0')}`,
      })
      tick.setMonth(tick.getMonth() + step)
    }
  }

  const reportT = new Date(reportDate).getTime()
  const reportInRange = hasPeriod && reportT >= startT && reportT <= endT

  // ── 선택 날짜 핸들 드래그 (수직 이동만) — 드래그 위치 → 공정률(0~100, 0.1 단위)
  const rateFromPointer = (clientY: number): number => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const ySvg = ((clientY - rect.top) / rect.height) * H
    const rate = 100 - ((ySvg - MT) / (H - MT - MB)) * 100
    return Math.min(100, Math.max(0, Math.round(rate * 10) / 10))
  }

  const setCurrentDateRate = (rate: number) => {
    setDraft(rows => {
      const idx = rows.findIndex(r => r.date === reportDate)
      if (idx >= 0) {
        return rows.map((r, i) => i === idx ? { ...r, rate: String(rate) } : r)
      }
      return [...rows, { date: reportDate, rate: String(rate) }]
        .sort((a, b) => a.date.localeCompare(b.date))
    })
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setCurrentDateRate(rateFromPointer(e.clientY))
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    setCurrentDateRate(rateFromPointer(e.clientY))
  }

  const handlePointerUp = () => {
    draggingRef.current = false
  }

  const updateDraft = (index: number, field: 'date' | 'rate', value: string) => {
    setDraft(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  const removeDraft = (index: number) => {
    setDraft(rows => rows.filter((_, i) => i !== index))
  }

  const addDraft = () => {
    setDraft(rows => [...rows, { date: '', rate: '' }])
  }

  // 다른 날짜 기준점 DB 반영 (해당 날짜 일보가 있으면 갱신, 없으면 생성)
  const upsertAnchor = async (date: string, rate: number) => {
    const { data: existing, error: selError } = await supabase
      .from('work_daily_reports')
      .select('id')
      .eq('project_id', projectId)
      .eq('report_date', date)
      .maybeSingle()
    if (selError) throw new Error(selError.message)

    if (existing) {
      const { error } = await supabase
        .from('work_daily_reports')
        .update({ progress_rate: String(rate), progress_rate_manual: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from('work_daily_reports')
        .insert({
          project_id: projectId,
          report_date: date,
          progress_rate: String(rate),
          progress_rate_manual: true,
          created_by: userId,
        })
      if (error) throw new Error(error.message)
    }
  }

  const clearAnchor = async (date: string) => {
    const { error } = await supabase
      .from('work_daily_reports')
      .update({ progress_rate: '', progress_rate_manual: false, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('report_date', date)
    if (error) throw new Error(error.message)
  }

  const handleSave = async () => {
    // 유효성: 날짜 형식, 숫자, 중복 날짜
    const filled = draft.filter(d => d.date.trim() !== '' || d.rate.trim() !== '')
    for (const d of filled) {
      if (!isDateStr(d.date)) {
        alert('날짜를 올바르게 입력해주세요.')
        return
      }
      if (d.rate.trim() !== '' && isNaN(parseFloat(d.rate))) {
        alert(`${d.date}의 공정률은 숫자로 입력해주세요.`)
        return
      }
    }
    const dates = filled.filter(d => d.rate.trim() !== '').map(d => d.date)
    if (new Set(dates).size !== dates.length) {
      alert('같은 날짜가 중복 입력되었습니다.')
      return
    }

    try {
      setSaving(true)

      const newOthers = validAnchors.filter(a => a.date !== reportDate)
      const originalOthers = anchors.filter(a => a.date !== reportDate)

      // 추가/변경된 기준점 반영
      for (const a of newOthers) {
        const orig = originalOthers.find(o => o.date === a.date)
        if (!orig || orig.rate !== a.rate) {
          await upsertAnchor(a.date, a.rate)
        }
      }
      // 삭제된 기준점 해제
      for (const o of originalOthers) {
        if (!newOthers.some(a => a.date === o.date)) {
          await clearAnchor(o.date)
        }
      }

      // 선택 날짜의 수동 공정률 — 일보가 이미 있으면 즉시 반영 (없으면 폼 저장 시 반영)
      if (currentEntry) {
        const { data: currentRow } = await supabase
          .from('work_daily_reports')
          .select('id')
          .eq('project_id', projectId)
          .eq('report_date', reportDate)
          .maybeSingle()
        if (currentRow) {
          const { error: curError } = await supabase
            .from('work_daily_reports')
            .update({ progress_rate: String(currentEntry.rate), progress_rate_manual: true, updated_at: new Date().toISOString() })
            .eq('id', currentRow.id)
          if (curError) throw new Error(curError.message)
        }
      }

      // 모든 작업일보의 공정률 즉시 재계산 반영 (수동 입력 일보는 그대로 유지)
      if (hasPeriod) {
        const { data: allReports, error: allError } = await supabase
          .from('work_daily_reports')
          .select('id, report_date, progress_rate, progress_rate_manual')
          .eq('project_id', projectId)
        if (allError) throw new Error(allError.message)

        const anchorList = currentEntry ? [...newOthers, currentEntry] : newOthers
        for (const row of allReports || []) {
          if (row.progress_rate_manual) continue
          const computed = computeProgressRate(
            constructionStart,
            constructionEnd,
            row.report_date,
            anchorList.filter(a => a.date !== row.report_date)
          )
          if (computed !== (row.progress_rate || '')) {
            const { error: rateError } = await supabase
              .from('work_daily_reports')
              .update({ progress_rate: computed, updated_at: new Date().toISOString() })
              .eq('id', row.id)
            if (rateError) throw new Error(rateError.message)
          }
        }
      }

      const currentRate = currentEntry ? String(currentEntry.rate) : null
      onSaved({
        anchors: currentEntry ? [...newOthers, currentEntry] : newOthers,
        currentRate,
      })
      onClose()
    } catch (err: unknown) {
      console.error('공정률 기준점 저장 오류:', err)
      alert(`공정률 저장 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-gray-900">공정률 입력</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          착공(0%) → 준공(100%) 직선보간 그래프입니다. 날짜별 공정률을 직접 입력하면 그 점을 지나도록 실시간 보정됩니다.
          그래프의 <span className="font-semibold text-amber-600">주황 핸들</span>을 위아래로 드래그하면 선택 날짜의 공정률을 조정할 수 있습니다.
        </p>

        {!hasPeriod ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            착공일·준공일이 설정되어 있지 않습니다. 좌측 공사기간 카드에서 먼저 입력해주세요.
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg p-2 mb-4 bg-white">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
              {/* Y축 그리드/라벨 (0~100%, 20% 간격) */}
              {[0, 20, 40, 60, 80, 100].map(r => (
                <g key={r}>
                  <line x1={ML} y1={yScale(r)} x2={W - MR} y2={yScale(r)} stroke="#e5e7eb" strokeWidth="1" />
                  <text x={ML - 6} y={yScale(r) + 3.5} textAnchor="end" fontSize="10" fill="#6b7280">{r}%</text>
                </g>
              ))}

              {/* X축 월 눈금 */}
              {monthTicks.map((tick, i) => (
                <g key={i}>
                  <line x1={xScale(tick.t)} y1={MT} x2={xScale(tick.t)} y2={H - MB} stroke="#f3f4f6" strokeWidth="1" />
                  <text x={xScale(tick.t)} y={H - MB + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">{tick.label}</text>
                </g>
              ))}

              {/* 축 */}
              <line x1={ML} y1={H - MB} x2={W - MR} y2={H - MB} stroke="#9ca3af" strokeWidth="1" />
              <line x1={ML} y1={MT} x2={ML} y2={H - MB} stroke="#9ca3af" strokeWidth="1" />

              {/* 착공~준공 기본 직선 (참고용 점선) */}
              <line
                x1={xScale(startT)} y1={yScale(0)} x2={xScale(endT)} y2={yScale(100)}
                stroke="#d1d5db" strokeWidth="1" strokeDasharray="4 3"
              />

              {/* 보간선 */}
              <polyline points={polyline} fill="none" stroke="#2563eb" strokeWidth="2" />

              {/* 착공/준공 고정점 */}
              <circle cx={xScale(startT)} cy={yScale(0)} r="4" fill="#1f2937" />
              <circle cx={xScale(endT)} cy={yScale(100)} r="4" fill="#1f2937" />

              {/* 수동 기준점 */}
              {validAnchors
                .map(a => ({ ...a, t: new Date(a.date).getTime() }))
                .filter(a => a.t >= startT && a.t <= endT)
                .map(a => (
                  <circle key={a.date} cx={xScale(a.t)} cy={yScale(a.rate)} r="4.5" fill="#dc2626" stroke="#fff" strokeWidth="1.5" />
                ))}

              {/* 선택 날짜 위치 + 드래그 핸들 (수직 이동만) */}
              {reportInRange && (
                <g>
                  <line
                    x1={xScale(reportT)} y1={MT} x2={xScale(reportT)} y2={H - MB}
                    stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3"
                  />
                  <text x={xScale(reportT)} y={MT - 3} textAnchor="middle" fontSize="10" fill="#b45309" fontWeight="bold">
                    {reportDate} · {previewRate || '-'}%
                  </text>
                  <g
                    className="cursor-ns-resize"
                    style={{ touchAction: 'none' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <circle
                      cx={xScale(reportT)}
                      cy={yScale(parseFloat(previewRate) || 0)}
                      r="9"
                      fill="#f59e0b"
                      stroke="#fff"
                      strokeWidth="2.5"
                    />
                    {/* 핸들 그립 표시 (상하 화살표 느낌의 가로줄) */}
                    <line
                      x1={xScale(reportT) - 3.5} y1={yScale(parseFloat(previewRate) || 0) - 2}
                      x2={xScale(reportT) + 3.5} y2={yScale(parseFloat(previewRate) || 0) - 2}
                      stroke="#fff" strokeWidth="1.2"
                    />
                    <line
                      x1={xScale(reportT) - 3.5} y1={yScale(parseFloat(previewRate) || 0) + 2}
                      x2={xScale(reportT) + 3.5} y2={yScale(parseFloat(previewRate) || 0) + 2}
                      stroke="#fff" strokeWidth="1.2"
                    />
                  </g>
                </g>
              )}

              {/* X축 양끝 라벨 (착공/준공) */}
              <text x={xScale(startT)} y={H - MB + 28} textAnchor="start" fontSize="9" fill="#374151" fontWeight="bold">착공 {constructionStart}</text>
              <text x={xScale(endT)} y={H - MB + 28} textAnchor="end" fontSize="9" fill="#374151" fontWeight="bold">준공 {constructionEnd}</text>
            </svg>
          </div>
        )}

        {/* 날짜별 수동 공정률 입력 */}
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold text-gray-800">날짜별 공정률 직접 입력</h4>
          <button
            onClick={addDraft}
            className="inline-flex items-center gap-0.5 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> 행 추가
          </button>
        </div>
        <table className="w-full border-collapse mb-2">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-100 px-1 py-1.5 text-xs font-semibold text-gray-700 text-center w-[45%]">날짜</th>
              <th className="border border-gray-300 bg-gray-100 px-1 py-1.5 text-xs font-semibold text-gray-700 text-center w-[40%]">공정률(%)</th>
              <th className="border border-gray-300 bg-gray-100 w-9" />
            </tr>
          </thead>
          <tbody>
            {draft.map((row, i) => {
              const isCurrent = row.date === reportDate
              return (
                <tr key={i} className={isCurrent ? 'bg-amber-50/60' : ''}>
                  <td className="border border-gray-300 p-0">
                    <input
                      type="date"
                      value={row.date}
                      onChange={e => updateDraft(i, 'date', e.target.value)}
                      className="w-full px-1.5 py-1.5 text-xs bg-transparent text-center focus:outline-none focus:bg-blue-50"
                    />
                  </td>
                  <td className="border border-gray-300 p-0">
                    <input
                      value={row.rate}
                      onChange={e => updateDraft(i, 'rate', e.target.value)}
                      placeholder="비우면 자동 계산"
                      className="w-full px-1.5 py-1.5 text-xs bg-transparent text-center focus:outline-none focus:bg-blue-50"
                    />
                  </td>
                  <td className="border border-gray-300 text-center">
                    <button
                      onClick={() => removeDraft(i)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="기준점 제거"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400 mb-4">
          노란 행은 현재 선택한 날짜({reportDate})입니다. 선택 날짜의 공정률은 작업일보 저장 시 함께 저장되고,
          다른 날짜는 확인 즉시 해당 날짜의 작업일보에 반영됩니다.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            확인 (반영)
          </button>
        </div>
      </div>
    </div>
  )
}
