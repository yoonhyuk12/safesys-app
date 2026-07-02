'use client'

// 시공 예정공정표 편집기 — 공종 표 + 旬별 일정(드래그 막대)·기여% 조정 + S커브 + 저장/Excel
// 산출 곡선은 combineScheduleAnchors→computeProgressRate로 작업일보·캐비넷·목록 공정률과 동일하게 연동된다.

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, Download, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { computeProgressRate, type ProgressAnchor } from '@/lib/work-daily-report/work-daily-report-types'
import { invalidateProgressAnchors } from '@/lib/work-daily-report/progress-anchors'
import {
  WorkSchedule,
  WorkScheduleItem,
  buildPeriodGrid,
  computeSchedule,
  combineScheduleAnchors,
  validateSchedule,
  createScheduleItem,
} from '@/lib/work-schedule/work-schedule-types'
import { downloadWorkScheduleExcel } from '@/lib/excel/work-schedule-export'
import ProgressRateModal from '@/components/project/ProgressRateModal'

interface WorkScheduleEditorProps {
  projectId: string
  projectName: string
  userId: string
  constructionStart: string | null | undefined
  constructionEnd: string | null | undefined
  initialSchedule: WorkSchedule | null | undefined
  onSaved?: (schedule: WorkSchedule) => void
}

const todayStr = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtPct = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)
const getErrorMessage = (err: unknown): string => (err instanceof Error ? err.message : '알 수 없는 오류')

export default function WorkScheduleEditor({
  projectId,
  projectName,
  userId,
  constructionStart,
  constructionEnd,
  initialSchedule,
  onSaved,
}: WorkScheduleEditorProps) {
  const [items, setItems] = useState<WorkScheduleItem[]>(initialSchedule?.items ?? [])
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [selected, setSelected] = useState<{ itemId: string; p: number } | null>(null)
  const [paintPreview, setPaintPreview] = useState<{ itemId: string; min: number; max: number } | null>(null)
  // 작업일보와 연동되는 수동 입력 공정률 기준점(일자 조정 공정률) — 직선보간 곡선·표시점·표·모달에 사용
  const [manualAnchors, setManualAnchors] = useState<ProgressAnchor[]>([])
  const [progressModalOpen, setProgressModalOpen] = useState(false)

  const grid = useMemo(() => buildPeriodGrid(constructionStart, constructionEnd), [constructionStart, constructionEnd])
  const n = grid.length

  const schedule: WorkSchedule = useMemo(() => ({ items }), [items])
  const comp = useMemo(() => computeSchedule(schedule, grid), [schedule, grid])
  const validation = useMemo(() => validateSchedule(schedule, comp), [schedule, comp])
  // 결합 곡선 앵커: 수동 점을 정확히 통과하고 사이는 공정표(S커브) 형태. 공정표·캐비넷·목록·작업일보 동일 출처.
  const combinedAnchors = useMemo(
    () => combineScheduleAnchors(schedule, constructionStart, constructionEnd, manualAnchors),
    [schedule, constructionStart, constructionEnd, manualAnchors],
  )
  // 旬별 결합 누계(그래프 곡선과 동일) — 하단 누계 행이 그래프와 일치하도록 사용
  const combinedCum = useMemo(
    () => grid.map(p => {
      const v = computeProgressRate(constructionStart, constructionEnd, p.endDate, combinedAnchors)
      return v === '' ? 0 : parseFloat(v)
    }),
    [grid, combinedAnchors, constructionStart, constructionEnd],
  )

  // 수동 입력 공정률 기준점 조회 (작업일보 progress_rate_manual 행) — 모달 저장 후에도 재호출
  const loadManualAnchors = useCallback(async () => {
    const { data } = await supabase
      .from('work_daily_reports')
      .select('report_date, progress_rate')
      .eq('project_id', projectId)
      .eq('progress_rate_manual', true)
    setManualAnchors((data || [])
      .map((row: { report_date: string; progress_rate: string }) => ({ date: row.report_date, rate: parseFloat(row.progress_rate) }))
      .filter((a: ProgressAnchor) => a.date && !isNaN(a.rate)))
  }, [projectId])

  useEffect(() => { loadManualAnchors() }, [loadManualAnchors])

  // 오늘 공정률 — 공종이 있으면 공정표 곡선, 없으면 수동 기준점(직선보간). 저장 후 캐비넷/목록/작업일보와 동일.
  const todayRate = useMemo(() => {
    const r = computeProgressRate(constructionStart, constructionEnd, todayStr(), combinedAnchors)
    return r === '' ? null : parseFloat(r)
  }, [combinedAnchors, constructionStart, constructionEnd])

  // ── 드래그 막대 페인팅 (보이는 영역 밖으로 드래그 시 자동 가로 스크롤 + 그 구간도 선택)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickyColRef = useRef<HTMLTableCellElement>(null)
  const paintRef = useRef<{ itemId: string; startP: number; startX: number; startY: number; moved: boolean } | null>(null)
  const pointerXRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastPreviewRef = useRef<{ itemId: string; min: number; max: number } | null>(null)

  const commitRange = useCallback((itemId: string, min: number, max: number) => {
    setItems(prev => prev.map(it => (it.id === itemId ? { ...it, startIndex: min, endIndex: max, dist: undefined } : it)))
  }, [])

  // 드래그 중 매 프레임: 가장자리 근처면 자동 스크롤하고, 포인터 X(Y=시작 행 고정) 아래 旬 칸으로 선택 구간 확장
  const updatePaint = useCallback(() => {
    const cur = paintRef.current
    if (!cur) return
    const sc = scrollRef.current
    let x = pointerXRef.current
    if (sc) {
      const rect = sc.getBoundingClientRect()
      // 드래그 중일 때만 가장자리 자동 스크롤 (단순 클릭은 스크롤/구간확장 안 함)
      if (cur.moved) {
        const EDGE = 44
        const SPEED = 22
        if (x < rect.left + EDGE) sc.scrollLeft -= SPEED
        else if (x > rect.right - EDGE) sc.scrollLeft += SPEED
      }
      // 좌측 고정열(공사종류)에 가려지지 않도록 X를 고정열 오른쪽~컨테이너 안쪽으로 클램프
      const stickyRight = stickyColRef.current?.getBoundingClientRect().right ?? rect.left
      x = Math.min(rect.right - 2, Math.max(stickyRight + 2, x))
    }
    const cell = (document.elementFromPoint(x, cur.startY) as HTMLElement | null)?.closest('[data-p]') as HTMLElement | null
    if (cell) {
      const p = parseInt(cell.dataset.p ?? '', 10)
      if (!isNaN(p)) {
        if (p !== cur.startP) cur.moved = true
        const min = Math.min(cur.startP, p)
        const max = Math.max(cur.startP, p)
        const last = lastPreviewRef.current
        if (!last || last.itemId !== cur.itemId || last.min !== min || last.max !== max) {
          lastPreviewRef.current = { itemId: cur.itemId, min, max }
          setPaintPreview({ itemId: cur.itemId, min, max })
        }
      }
    }
  }, [])

  const paintLoop = useCallback(() => {
    if (!paintRef.current) { rafRef.current = null; return }
    updatePaint()
    rafRef.current = requestAnimationFrame(paintLoop)
  }, [updatePaint])

  // 드래그 중 포인터 X 추적 (가장자리에 멈춰 있어도 자동 스크롤 계속되도록 rAF 루프와 분리)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const cur = paintRef.current
      if (!cur) return
      pointerXRef.current = e.clientX
      if (Math.abs(e.clientX - cur.startX) > 5) cur.moved = true // 드래그 의도 감지 → 자동 스크롤/구간 선택 활성
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    const onUp = () => {
      const cur = paintRef.current
      const preview = paintPreview
      if (cur && preview && cur.moved) {
        commitRange(preview.itemId, preview.min, preview.max)
        setSelected(null)
      } else if (cur && !cur.moved) {
        // 클릭(이동 없음): 막대 내부면 그 旬 선택(기여% 조정), 외부면 무시
        const it = items.find(i => i.id === cur.itemId)
        if (it && cur.startP >= it.startIndex && cur.startP <= it.endIndex) {
          setSelected({ itemId: cur.itemId, p: cur.startP })
        }
      }
      paintRef.current = null
      lastPreviewRef.current = null
      setPaintPreview(null)
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [paintPreview, items, commitRange])

  const onCellPointerDown = (e: React.PointerEvent, itemId: string, p: number) => {
    paintRef.current = { itemId, startP: p, startX: e.clientX, startY: e.clientY, moved: false }
    pointerXRef.current = e.clientX
    lastPreviewRef.current = { itemId, min: p, max: p }
    setPaintPreview({ itemId, min: p, max: p })
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(paintLoop)
  }

  // ── 공종 조작
  const addItem = () => setItems(prev => [...prev, createScheduleItem(n)])
  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id))
    if (selected?.itemId === id) setSelected(null)
  }
  const updateItem = (id: string, patch: Partial<WorkScheduleItem>) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))

  const setRange = (id: string, start: number, end: number) => {
    const s = Math.max(0, Math.min(n - 1, start))
    const e = Math.max(s, Math.min(n - 1, end))
    updateItem(id, { startIndex: s, endIndex: e, dist: undefined })
  }

  // 선택 旬의 기여%(전체 대비) 직접 입력 → dist[p] = 기여%/가중치 로 저장
  const setSelectedContribution = (value: string) => {
    if (!selected) return
    const it = items.find(i => i.id === selected.itemId)
    if (!it) return
    const weight = comp.weights.get(it.id) ?? 0
    const pct = parseFloat(value)
    if (weight <= 0 || isNaN(pct)) return
    const f = Math.max(0, pct / weight)
    updateItem(it.id, { dist: { ...(it.dist ?? {}), [selected.p]: f } })
  }
  const resetSelectedToEven = () => {
    if (!selected) return
    const it = items.find(i => i.id === selected.itemId)
    if (!it || !it.dist) return
    const next = { ...it.dist }
    delete next[selected.p]
    updateItem(it.id, { dist: Object.keys(next).length ? next : undefined })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const payload: WorkSchedule = {
        items,
        updatedAt: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('projects')
        .update({ construction_schedule: payload })
        .eq('id', projectId)
      if (error) throw new Error(error.message)
      invalidateProgressAnchors(projectId)
      alert('공정표가 저장되었습니다. 공정률이 작업일보·목록에 연동됩니다.')
      onSaved?.(payload)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      if (msg.includes('construction_schedule') || msg.includes('column')) {
        alert('공정표 컬럼이 아직 DB에 없습니다.\nSupabase에서 database/20260618-0507_add_project_construction_schedule.sql을 먼저 실행해주세요.')
      } else {
        alert(`저장 중 오류가 발생했습니다: ${msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = async () => {
    try {
      setDownloading(true)
      await downloadWorkScheduleExcel(schedule, projectName, constructionStart, constructionEnd, manualAnchors)
    } catch (err: unknown) {
      alert(`Excel 출력 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
    } finally {
      setDownloading(false)
    }
  }

  // ── S커브 SVG (X=시간: 착공~준공, Y=0~100%)
  const CW = 900
  const CH = 210
  const CML = 36
  const CMB = 26
  const CRP = 12
  const startT = constructionStart ? new Date(constructionStart).getTime() : 0
  const endT = constructionEnd ? new Date(constructionEnd).getTime() : 1
  const xByDate = (dateStr: string) => {
    const t = new Date(dateStr).getTime()
    if (endT <= startT || isNaN(t)) return CML
    return CML + ((Math.min(endT, Math.max(startT, t)) - startT) / (endT - startT)) * (CW - CML - CRP)
  }
  const yAt = (v: number) => CH - CMB - (Math.min(100, Math.max(0, v)) / 100) * (CH - CMB - 8)

  // 결합 곡선 (수동 점 통과 + 사이는 공정표 형태) — start 0%, end 100% 고정
  const curvePts: { date: string; r: number }[] = [
    { date: constructionStart!, r: 0 },
    ...combinedAnchors.map(a => ({ date: a.date, r: a.rate })),
    { date: constructionEnd!, r: 100 },
  ]
  const curvePoints = curvePts.map(p => `${xByDate(p.date).toFixed(1)},${yAt(p.r).toFixed(1)}`).join(' ')
  // 사용자가 직접 수정한 공정률 점 (기간 내) — 날짜·공정율 표시
  const manualMarkers = manualAnchors
    .filter(a => a.date >= constructionStart! && a.date <= constructionEnd!)
    .sort((x, y) => x.date.localeCompare(y.date))

  const selectedItem = selected ? items.find(i => i.id === selected.itemId) : null
  const selectedContribNow = selected && selectedItem ? (comp.contrib.get(selectedItem.id)?.[selected.p] ?? 0) : 0

  const isInBar = (it: WorkScheduleItem, p: number) => p >= it.startIndex && p <= it.endIndex
  const isPreview = (itemId: string, p: number) =>
    paintPreview != null && paintPreview.itemId === itemId && p >= paintPreview.min && p <= paintPreview.max

  if (n === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
        착공일·준공일이 설정되어 있지 않습니다. 작업일보 1단계에서 공사기간을 먼저 입력해주세요.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 카드 1: 공정표 본체 */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-5 space-y-4">
      {/* 상단 컨트롤 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs text-gray-500">
          공사기간 <span className="font-medium text-gray-700">{constructionStart} ~ {constructionEnd}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> 공종 추가
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || items.length === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </button>
        </div>
      </div>

      {/* 요약 / 검증 */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-gray-600">총 공사금액 <b className="text-gray-900">{comp.totalAmount.toLocaleString()}백만원</b></span>
        <span className="text-gray-600">가중치 합 <b className={Math.abs(validation.totalWeight - 100) < 0.5 ? 'text-gray-900' : 'text-red-600'}>{fmtPct(validation.totalWeight)}%</b></span>
        <span className="text-gray-600">최종 누계 <b className={Math.abs(validation.finalCum - 100) < 0.5 ? 'text-gray-900' : 'text-red-600'}>{fmtPct(validation.finalCum)}%</b></span>
        {todayRate != null && (
          <span className="text-blue-700">오늘 공정률(연동) <b>{todayRate.toFixed(1)}%</b></span>
        )}
        {validation.itemsNot100.length > 0 && (
          <span className="text-amber-600">분포 합 비정상 공종 {validation.itemsNot100.length}개 (균등 복원 권장)</span>
        )}
      </div>

      {/* S커브 (X=착공~준공 시간축) */}
      <div className="border border-gray-200 rounded-lg p-2 bg-white">
        <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full select-none" style={{ minHeight: 130 }}>
          {[0, 25, 50, 75, 100].map(rr => (
            <g key={rr}>
              <line x1={CML} y1={yAt(rr)} x2={CW - CRP} y2={yAt(rr)} stroke="#e5e7eb" strokeWidth="1" />
              <text x={CML - 4} y={yAt(rr) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{rr}%</text>
            </g>
          ))}
          {/* 착공→준공 기준 직선(점선) */}
          <line x1={xByDate(constructionStart!)} y1={yAt(0)} x2={xByDate(constructionEnd!)} y2={yAt(100)} stroke="#d1d5db" strokeWidth="1" strokeDasharray="4 3" />
          {/* 결합 공정 곡선 (수동 점 통과 + 사이는 공정표 형태) */}
          <polyline points={curvePoints} fill="none" stroke="#dc2626" strokeWidth="2" />
          {/* 사용자가 직접 수정한 공정률 점 — 곡선이 정확히 통과(준수). 날짜·% 표시 */}
          {manualMarkers.map(a => (
            <g key={a.date}>
              <circle cx={xByDate(a.date)} cy={yAt(a.rate)} r="3.5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
              <text x={xByDate(a.date)} y={yAt(a.rate) - 6} textAnchor="middle" fontSize="8" fill="#1d4ed8" fontWeight="bold">
                {a.date.slice(5)} · {a.rate.toFixed(0)}%
              </text>
            </g>
          ))}
          {/* 착공/준공 라벨 (좌하단/우하단) */}
          <text x={CML} y={CH - 7} textAnchor="start" fontSize="9" fill="#374151" fontWeight="bold">착공 {constructionStart}</text>
          <text x={CW - CRP} y={CH - 7} textAnchor="end" fontSize="9" fill="#374151" fontWeight="bold">준공 {constructionEnd}</text>
        </svg>
      </div>

      {/* 선택 旬 편집 툴바 */}
      {selected && selectedItem && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
          <span className="text-amber-800">
            선택: <b>{selectedItem.name || '(공종)'}</b> · {grid[selected.p].year}.{String(grid[selected.p].month).padStart(2, '0')} {grid[selected.p].dayLabel}일
          </span>
          <label className="text-amber-800">기여(전체 대비)</label>
          <input
            type="number"
            step="0.01"
            defaultValue={fmtPct(selectedContribNow)}
            key={`${selected.itemId}-${selected.p}`}
            onBlur={e => setSelectedContribution(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-20 border border-amber-300 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <span className="text-amber-700">%</span>
          <button onClick={resetSelectedToEven} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-amber-300 text-amber-700 hover:bg-amber-100">
            <RotateCcw className="h-3 w-3" /> 균등 복원
          </button>
          <button onClick={() => setSelected(null)} className="ml-auto text-amber-600 hover:text-amber-800">닫기</button>
        </div>
      )}

      {/* 공정표 표 */}
      <div ref={scrollRef} className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="border-collapse text-center" style={{ touchAction: 'none' }}>
          <thead className="bg-gray-50">
            {/* 년 */}
            <tr>
              <th ref={stickyColRef} rowSpan={3} className="sticky left-0 z-10 bg-gray-50 border border-gray-300 px-2 text-xs font-semibold text-gray-700 min-w-[120px]">공사종류</th>
              <th rowSpan={3} className="border border-gray-300 px-1 text-[11px] font-semibold text-gray-700 min-w-[84px]">공사금액<br />(백만원)</th>
              <th rowSpan={3} className="border border-gray-300 px-1 text-[11px] font-semibold text-gray-700 min-w-[56px]">가중치</th>
              <th rowSpan={3} className="border border-gray-300 px-1 text-[11px] font-semibold text-gray-700 min-w-[64px]">시작·종료</th>
              {(() => {
                const cells: React.ReactNode[] = []
                let seg = 0
                for (let i = 1; i <= n; i++) {
                  if (i === n || grid[i].year !== grid[seg].year) {
                    cells.push(<th key={`y${seg}`} colSpan={i - seg} className="border border-gray-300 text-[10px] font-semibold text-gray-600">{grid[seg].year}년</th>)
                    seg = i
                  }
                }
                return cells
              })()}
              <th rowSpan={3} className="border border-gray-300 px-1 text-[11px] font-semibold text-gray-700 min-w-[56px]">공정률</th>
            </tr>
            {/* 월 */}
            <tr>
              {(() => {
                const cells: React.ReactNode[] = []
                let seg = 0
                for (let i = 1; i <= n; i++) {
                  if (i === n || grid[i].monthKey !== grid[seg].monthKey) {
                    cells.push(<th key={`m${seg}`} colSpan={i - seg} className="border border-gray-300 text-[10px] font-semibold text-gray-600">{grid[seg].month}월</th>)
                    seg = i
                  }
                }
                return cells
              })()}
            </tr>
            {/* 旬 */}
            <tr>
              {grid.map((p, i) => (
                <th key={`s${i}`} className="border border-gray-300 text-[9px] font-medium text-gray-500 w-7 min-w-[28px]">{p.dayLabel}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const weight = comp.weights.get(it.id) ?? 0
              const arr = comp.contrib.get(it.id) ?? []
              return (
                <tr key={it.id} className="hover:bg-blue-50/30">
                  <td className="sticky left-0 z-10 bg-white border border-gray-300 p-0">
                    <div className="flex items-center gap-1 px-1">
                      <input
                        value={it.name}
                        onChange={e => updateItem(it.id, { name: e.target.value })}
                        placeholder="공종명"
                        className="flex-1 min-w-0 px-1 py-1 text-xs bg-transparent focus:outline-none focus:bg-blue-50"
                      />
                      <button onClick={() => removeItem(it.id)} className="p-0.5 text-gray-300 hover:text-red-500" title="공종 삭제">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="border border-gray-300 p-0">
                    <input
                      type="number"
                      value={it.amount || ''}
                      onChange={e => updateItem(it.id, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-1 py-1 text-xs text-right bg-transparent focus:outline-none focus:bg-blue-50"
                    />
                  </td>
                  <td className="border border-gray-300 text-[11px] text-gray-700">{fmtPct(weight)}%</td>
                  <td className="border border-gray-300 p-0">
                    <div className="flex items-center justify-center gap-0.5">
                      <input
                        type="number" min={1} max={n}
                        value={it.startIndex + 1}
                        onChange={e => setRange(it.id, (parseInt(e.target.value) || 1) - 1, it.endIndex)}
                        className="w-8 px-0.5 py-1 text-[11px] text-center bg-transparent focus:outline-none focus:bg-blue-50"
                      />
                      <span className="text-gray-300">~</span>
                      <input
                        type="number" min={1} max={n}
                        value={it.endIndex + 1}
                        onChange={e => setRange(it.id, it.startIndex, (parseInt(e.target.value) || 1) - 1)}
                        className="w-8 px-0.5 py-1 text-[11px] text-center bg-transparent focus:outline-none focus:bg-blue-50"
                      />
                    </div>
                  </td>
                  {grid.map((_, p) => {
                    const inBar = isInBar(it, p)
                    const preview = isPreview(it.id, p)
                    const isSel = selected?.itemId === it.id && selected.p === p
                    const c = arr[p] || 0
                    return (
                      <td
                        key={p}
                        data-p={p}
                        onPointerDown={(e) => onCellPointerDown(e, it.id, p)}
                        className={`border border-gray-200 w-7 min-w-[28px] h-7 text-[8px] leading-none cursor-pointer select-none
                          ${preview ? 'bg-blue-300' : inBar ? 'bg-blue-100' : 'hover:bg-gray-100'}
                          ${isSel ? 'ring-2 ring-amber-500 ring-inset' : ''}`}
                        title={inBar ? `${grid[p].year}.${grid[p].month} · 기여 ${fmtPct(c)}%` : '드래그하여 일정 막대 지정'}
                      >
                        {inBar && c > 0 ? fmtPct(c) : ''}
                      </td>
                    )
                  })}
                  <td className="border border-gray-300 text-[11px] font-semibold text-blue-700">{fmtPct(comp.itemCumAtEnd.get(it.id) ?? 0)}%</td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={4 + n + 1} className="border border-gray-200 py-8 text-sm text-gray-400">
                  &ldquo;공종 추가&rdquo;로 공사종류를 추가하고, 셀을 드래그해 일정 막대를 그리세요.
                </td>
              </tr>
            )}
            {/* 요약행 */}
            {items.length > 0 && (
              <>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="sticky left-0 z-10 bg-gray-50 border border-gray-300 text-[11px] font-semibold text-gray-700">주간공정율</td>
                  {grid.map((_, p) => (
                    <td key={p} className="border border-gray-200 text-[8px] text-gray-600">{fmtPct(comp.colRate[p])}</td>
                  ))}
                  <td className="border border-gray-300" />
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="sticky left-0 z-10 bg-gray-50 border border-gray-300 text-[11px] font-semibold text-gray-700">주간공정 누계</td>
                  {grid.map((_, p) => (
                    <td key={p} className="border border-gray-200 text-[8px] text-gray-600">{fmtPct(combinedCum[p] ?? 0)}</td>
                  ))}
                  <td className="border border-gray-300 text-[11px] font-semibold text-gray-700">{fmtPct(combinedCum[n - 1] ?? 100)}%</td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="sticky left-0 z-10 bg-gray-50 border border-gray-300 text-[11px] font-semibold text-gray-700">월간공정율</td>
                  {comp.monthly.map(mo => (
                    <td key={mo.monthKey} colSpan={mo.span} className="border border-gray-200 text-[9px] text-gray-600">{fmtPct(mo.rate)}</td>
                  ))}
                  <td className="border border-gray-300" />
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="sticky left-0 z-10 bg-gray-50 border border-gray-300 text-[11px] font-semibold text-gray-700">월간공정율 누계</td>
                  {comp.monthly.map(mo => (
                    <td key={mo.monthKey} colSpan={mo.span} className="border border-gray-200 text-[9px] text-gray-600">{fmtPct(combinedCum[mo.firstIndex + mo.span - 1] ?? 0)}</td>
                  ))}
                  <td className="border border-gray-300 text-[11px] font-semibold text-gray-700">{fmtPct(combinedCum[n - 1] ?? 100)}%</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        셀을 좌우로 드래그하면 일정 막대가 그려지고 가중치가 균등 분배됩니다. 막대 안 칸을 클릭하면 그 旬의 기여%를 직접 조정(수직 조정)할 수 있습니다.
        가중치는 공사금액 비율로 자동 계산되고, 우측 공정률·하단 누계·S커브·오늘 공정률이 모두 실시간 연동됩니다.
      </p>
      </div>

      {/* 카드 2: 일자 조정 공정률 — 공정표 본체와 분리된 별도 컨테이너 */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4 mb-0.5">
          <h4 className="text-sm font-semibold text-gray-800">일자 조정 공정률</h4>
          <button
            onClick={() => setProgressModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> 직접 조정
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mb-2">
          작업일보와 연동되는 공정률입니다. &ldquo;직접 조정&rdquo;에서 그래프 핸들을 위아래로 드래그하거나 표로 수정할 수 있습니다.
        </p>
        {manualMarkers.length > 0 ? (
          <table className="border-collapse text-center text-xs">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">일자</th>
                <th className="border border-gray-300 bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">공정률(%)</th>
              </tr>
            </thead>
            <tbody>
              {manualMarkers.map(a => (
                <tr key={a.date}>
                  <td className="border border-gray-300 px-3 py-1 text-gray-700">{a.date}</td>
                  <td className="border border-gray-300 px-3 py-1 font-medium text-blue-700">{a.rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-gray-400">아직 조정한 공정률이 없습니다. &ldquo;직접 조정&rdquo;으로 추가하세요.</p>
        )}
      </div>

      <ProgressRateModal
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        projectId={projectId}
        userId={userId}
        reportDate={todayStr()}
        constructionStart={constructionStart}
        constructionEnd={constructionEnd}
        anchors={manualAnchors}
        currentManual=""
        onSaved={async (result) => {
          // 모달은 '오늘'(선택일) 값을 해당일 일보가 없으면 저장하지 않음(폼이 저장하는 구조) → 공정표에서는 직접 보강
          const rate = result.currentRate
          if (rate != null && !isNaN(parseFloat(rate))) {
            const today = todayStr()
            const { data: row } = await supabase
              .from('work_daily_reports')
              .select('id')
              .eq('project_id', projectId)
              .eq('report_date', today)
              .maybeSingle()
            if (!row) {
              await supabase.from('work_daily_reports').insert({
                project_id: projectId, report_date: today, progress_rate: rate,
                progress_rate_manual: true, created_by: userId,
              })
              invalidateProgressAnchors(projectId)
            }
          }
          loadManualAnchors()
        }}
      />
    </div>
  )
}
