'use client'
// 조달청 일괄 조회 2단계 — 미연계 수기 자재의 검수 실적 행을 납품요구 품목에 드래그앤드랍으로 배정하는 매핑 화면

import React, { useState, useRef } from 'react'
import { Loader2 } from 'lucide-react'

// 좌측 — 미연계 수기 자재의 실적 행 (page.tsx에서 매핑해 내려줌)
interface AssignLeftRow {
  rowId: string
  materialId: string
  materialName: string
  unit: string
  spec: string
  orderQty: string
  receiveDate: string
  receiveQty: string
  passQty: string
  releaseQty: string
}

// 우측 — 선택한 납품요구 건의 품목 (qty 0 품목은 page.tsx에서 제외해 전달)
interface AssignRightItem {
  dlvrReqNo: string
  title: string
  deadline: string
  sno: number
  name: string
  spec: string
  unit: string
  qty: number
  unitPrice: number
}

interface Assignment {
  rowId: string
  dlvrReqNo: string
  sno: number
}

interface BulkInspectionAssignProps {
  leftRows: AssignLeftRow[]
  rightItems: AssignRightItem[]
  applying: boolean
  onBack: () => void
  onApply: (assignments: Assignment[], deleteEmptied: boolean) => void
}

// 1000단위 콤마 (숫자 아니면 원문 유지)
const fmtNum = (v: string | number): string => {
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (isNaN(n)) return typeof v === 'string' ? v : ''
  return n.toLocaleString()
}

// 2025-01-20 → 25-01-20
const fmtDate = (v: string): string => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[1].slice(2)}-${m[2]}-${m[3]}` : v
}

export default function BulkInspectionAssign({ leftRows, rightItems, applying, onBack, onApply }: BulkInspectionAssignProps) {
  // rowId → 배정된 납품요구 품목. 배정된 행은 좌측에서 사라지고 우측 드롭 존에 나타난다.
  const [assignMap, setAssignMap] = useState<Record<string, { dlvrReqNo: string; sno: number }>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null)
  const [deleteEmptied, setDeleteEmptied] = useState(true)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const draggedIds = useRef<string[]>([])

  const zoneKey = (dlvrReqNo: string, sno: number) => `${dlvrReqNo}::${sno}`

  // 미배정 행 (좌측 표시 대상). shift 범위 선택의 평면 순서 기준이 된다.
  const visibleRows = leftRows.filter(r => !assignMap[r.rowId])

  // 좌측 자재별 그룹 (미배정 행만)
  const leftGroups: { materialId: string; materialName: string; unit: string; rows: AssignLeftRow[] }[] = []
  for (const r of visibleRows) {
    let g = leftGroups.find(x => x.materialId === r.materialId)
    if (!g) { g = { materialId: r.materialId, materialName: r.materialName, unit: r.unit, rows: [] }; leftGroups.push(g) }
    g.rows.push(r)
  }

  // 우측 납품요구별 그룹
  const reqGroups: { dlvrReqNo: string; title: string; deadline: string; items: AssignRightItem[] }[] = []
  for (const it of rightItems) {
    let g = reqGroups.find(x => x.dlvrReqNo === it.dlvrReqNo)
    if (!g) { g = { dlvrReqNo: it.dlvrReqNo, title: it.title, deadline: it.deadline, items: [] }; reqGroups.push(g) }
    g.items.push(it)
  }

  const handleRowClick = (e: React.MouseEvent, rowId: string) => {
    const idx = visibleRows.findIndex(r => r.rowId === rowId)
    if (idx < 0) return
    if (e.shiftKey && anchorIdx != null) {
      const [a, b] = anchorIdx <= idx ? [anchorIdx, idx] : [idx, anchorIdx]
      setSelected(new Set(visibleRows.slice(a, b + 1).map(r => r.rowId)))
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => { const next = new Set(prev); if (next.has(rowId)) next.delete(rowId); else next.add(rowId); return next })
      setAnchorIdx(idx)
    } else {
      setSelected(new Set([rowId]))
      setAnchorIdx(idx)
    }
  }

  const handleDragStart = (e: React.DragEvent, rowId: string) => {
    // 선택된 행을 드래그하면 선택 전체가, 미선택 행 드래그는 그 행만 이동
    const ids = selected.has(rowId) ? [...selected] : [rowId]
    if (!selected.has(rowId)) {
      setSelected(new Set([rowId]))
      setAnchorIdx(visibleRows.findIndex(r => r.rowId === rowId))
    }
    draggedIds.current = ids
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ids.join(','))
  }

  const assignRows = (ids: string[], dlvrReqNo: string, sno: number) => {
    if (ids.length === 0) return
    setAssignMap(prev => {
      const next = { ...prev }
      for (const id of ids) next[id] = { dlvrReqNo, sno }
      return next
    })
    setSelected(new Set())
    setAnchorIdx(null)
  }

  const handleDrop = (e: React.DragEvent, dlvrReqNo: string, sno: number) => {
    e.preventDefault()
    setDragOverKey(null)
    let ids = draggedIds.current
    if (ids.length === 0) {
      const raw = e.dataTransfer.getData('text/plain')
      ids = raw ? raw.split(',').filter(Boolean) : []
    }
    assignRows(ids.filter(id => !assignMap[id]), dlvrReqNo, sno)
    draggedIds.current = []
  }

  const unassign = (rowId: string) => {
    setAssignMap(prev => { const next = { ...prev }; delete next[rowId]; return next })
  }

  // 이관으로 실적 행이 전부 빠져나갈 자재 이름 (원래 실적 행이 있던 자재만 대상)
  const matStat = new Map<string, { name: string; total: number; assigned: number }>()
  for (const r of leftRows) {
    const e = matStat.get(r.materialId) || { name: r.materialName, total: 0, assigned: 0 }
    e.total += 1
    if (assignMap[r.rowId]) e.assigned += 1
    matStat.set(r.materialId, e)
  }
  const emptiedNames = [...matStat.values()].filter(e => e.total > 0 && e.assigned === e.total).map(e => e.name)

  const assignments: Assignment[] = Object.entries(assignMap).map(([rowId, t]) => ({ rowId, dlvrReqNo: t.dlvrReqNo, sno: t.sno }))
  const assignmentCount = assignments.length

  const panelStyle = {
    background: 'linear-gradient(180deg, #1a1a22 0%, #252530 100%)',
    border: '2px solid #4a4a55',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
  } as const

  return (
    <>
      {/* 본문 — 좌: 미배정 검수 행 / 우: 납품요구 품목 드롭 존 */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col md:flex-row gap-3 px-4 py-3">
        {/* 좌측 패널 */}
        <div className="flex-1 min-h-0 flex flex-col rounded p-2" style={panelStyle}>
          <p className="text-xs text-amber-100 mb-2 shrink-0" style={{ fontFamily: 'serif' }}>
            미배정 검수 행 <span className="text-amber-200/50">({visibleRows.length})</span>
            <span className="text-amber-200/40 ml-1">· 클릭/Ctrl/Shift 선택 후 드래그</span>
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {leftGroups.length === 0 ? (
              <p className="text-[11px] text-amber-200/50 p-2">모든 검수 행이 배정되었습니다.</p>
            ) : leftGroups.map(g => (
              <div key={g.materialId}>
                <p className="text-[11px] text-amber-300/80 px-1 pb-1" style={{ fontFamily: 'serif' }}>
                  {g.materialName}{g.unit ? ` · ${g.unit}` : ''}
                </p>
                <div className="space-y-1">
                  {g.rows.map(r => {
                    const isSel = selected.has(r.rowId)
                    return (
                      <div
                        key={r.rowId}
                        draggable
                        onDragStart={e => handleDragStart(e, r.rowId)}
                        onClick={e => handleRowClick(e, r.rowId)}
                        className="p-2 rounded cursor-grab active:cursor-grabbing select-none transition-colors"
                        style={{
                          background: isSel ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)' : 'linear-gradient(180deg, #2a2a33 0%, #1f1f27 100%)',
                          border: isSel ? '2px solid #c79a45' : '1px solid #3a3a45',
                        }}
                      >
                        <p className="text-[11px] text-amber-100 whitespace-pre-line leading-tight">{r.spec || '-'}</p>
                        <p className="text-[10px] text-amber-200/60 mt-0.5">
                          {r.receiveDate ? `반입 ${fmtDate(r.receiveDate)}` : ''}
                          {r.receiveQty ? ` · 반입량 ${fmtNum(r.receiveQty)}` : ''}
                          {r.passQty ? ` · 합격 ${fmtNum(r.passQty)}` : ''}
                          {r.releaseQty ? ` · 불출 ${fmtNum(r.releaseQty)}` : ''}
                        </p>
                        {r.orderQty && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            발주 <s>{fmtNum(r.orderQty)}</s> <span className="text-gray-600">(건너뜀)</span>
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 우측 패널 */}
        <div className="flex-1 min-h-0 flex flex-col rounded p-2" style={panelStyle}>
          <p className="text-xs text-amber-100 mb-2 shrink-0" style={{ fontFamily: 'serif' }}>
            납품요구 품목 <span className="text-amber-200/50">(드롭 존)</span>
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {reqGroups.map(req => (
              <div key={req.dlvrReqNo} className="rounded p-2" style={{ background: 'linear-gradient(180deg, #22222b 0%, #191921 100%)', border: '1px solid #3a3a45' }}>
                <p className="text-[11px] text-amber-100 break-all" style={{ fontFamily: 'serif' }}>{req.title || req.dlvrReqNo}</p>
                <p className="text-[10px] text-amber-200/50 break-all mb-1.5">
                  {req.dlvrReqNo}{req.deadline ? ` · 납품기한 ${req.deadline}` : ''}
                </p>
                <div className="space-y-1.5">
                  {req.items.map(item => {
                    const key = zoneKey(item.dlvrReqNo, item.sno)
                    const over = dragOverKey === key
                    const assigned = leftRows.filter(r => {
                      const a = assignMap[r.rowId]
                      return a && a.dlvrReqNo === item.dlvrReqNo && a.sno === item.sno
                    })
                    const [specHead, ...specTail] = (item.spec || item.name).split('\n')
                    return (
                      <div
                        key={key}
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key) }}
                        onDragLeave={() => setDragOverKey(k => (k === key ? null : k))}
                        onDrop={e => handleDrop(e, item.dlvrReqNo, item.sno)}
                        className="rounded p-2 transition-colors"
                        style={{
                          background: over ? 'linear-gradient(180deg, #3a3018 0%, #2a2410 100%)' : 'rgba(255,255,255,0.02)',
                          border: over ? '2px dashed #c79a45' : '1px dashed #4a4a55',
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-amber-100 break-all">{specHead || item.name}</p>
                            {specTail.length > 0 && (
                              <p className="text-[10px] text-amber-200/50 break-all">{specTail.join(' ').replace(/^\(/, '').replace(/\)$/, '')}</p>
                            )}
                            <p className="text-[10px] text-amber-200/60 mt-0.5">
                              {item.unit ? `${item.unit} · ` : ''}발주 {fmtNum(item.qty)}
                              {item.unitPrice ? ` · 단가 ${fmtNum(item.unitPrice)}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => assignRows([...selected].filter(id => !assignMap[id]), item.dlvrReqNo, item.sno)}
                            disabled={selected.size === 0}
                            className="shrink-0 px-2 py-1 text-[10px] rounded transition-all disabled:opacity-40"
                            style={{
                              background: selected.size > 0 ? 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)' : 'linear-gradient(180deg, #3a3a40 0%, #25252a 100%)',
                              border: '1px solid #6a5a40',
                              color: '#f5d78e',
                              fontFamily: 'serif',
                            }}
                            title="선택한 검수 행을 이 품목에 배정"
                          >
                            선택 행 배정
                          </button>
                        </div>
                        {assigned.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {assigned.map(r => {
                              const unitMismatch = !!r.unit && !!item.unit && r.unit !== item.unit
                              return (
                                <div key={r.rowId} className="flex items-center gap-1.5 px-1.5 py-1 rounded" style={{ background: 'rgba(199,154,69,0.12)', border: '1px solid rgba(199,154,69,0.3)' }}>
                                  {unitMismatch && (
                                    <span className="text-yellow-400 text-xs shrink-0" title={`단위 불일치 — 자재 '${r.unit}' vs 품목 '${item.unit}' (배정은 가능)`}>⚠</span>
                                  )}
                                  <span className="text-[10px] text-amber-100/90 min-w-0 flex-1 truncate">
                                    {r.materialName} · {(r.spec || '').split('\n')[0]}
                                    {r.receiveQty ? ` · 반입 ${fmtNum(r.receiveQty)}` : ''}
                                    {r.passQty ? ` · 합격 ${fmtNum(r.passQty)}` : ''}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => unassign(r.rowId)}
                                    className="shrink-0 text-amber-200/50 hover:text-red-400 transition-colors text-xs leading-none"
                                    title="배정 해제"
                                  >
                                    ×
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 옵션·버튼 */}
      <div className="px-5 py-3 flex-shrink-0 space-y-2" style={{ background: 'linear-gradient(180deg, #2a2520 0%, #1a1510 100%)', borderTop: '2px solid #5a4a35' }}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={deleteEmptied} onChange={e => setDeleteEmptied(e.target.checked)} className="accent-amber-600 shrink-0" />
          <span className="text-[11px] text-amber-200/70">이관 후 빈 수기 자재 삭제</span>
          {emptiedNames.length > 0 && (
            <span className="text-[11px] text-amber-300/60 break-all">— {emptiedNames.join(', ')}</span>
          )}
        </label>
        {assignmentCount === 0 && (
          <p className="text-[11px] text-amber-200/40">배정된 행이 없습니다 — 적용 시 선택한 납품요구 건의 신규 등록만 수행됩니다.</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={applying}
            className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: 'linear-gradient(180deg, #3a3a45 0%, #25252d 100%)',
              border: '2px solid #4a4a55',
              borderRadius: '6px',
              color: '#a8a8b0',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            뒤로
          </button>
          <button
            type="button"
            onClick={() => onApply(assignments, deleteEmptied)}
            disabled={applying}
            className="flex-1 px-4 py-2.5 text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: 'linear-gradient(180deg, #5a4a30 0%, #3a2a18 100%)',
              border: '2px solid #6a5a40',
              borderRadius: '6px',
              color: '#f5d78e',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
              fontFamily: 'serif',
            }}
          >
            {applying
              ? <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" />이관 적용 중…</span>
              : `⚔ 이관 적용 (${assignmentCount}행)`}
          </button>
        </div>
      </div>
    </>
  )
}
