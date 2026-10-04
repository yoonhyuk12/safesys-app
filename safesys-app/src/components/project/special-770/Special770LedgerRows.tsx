// 안전점검 관리대장의 굴삭기 특별점검 행 — 지적 1건=1행, 조치 후 사진 압축 업로드·편집·삭제, 결과 HWPX 다운로드
'use client'

import React, { useRef, useState } from 'react'
import { Download, Edit2, Trash2 } from 'lucide-react'
import { inspectionLedgerRowProps } from '@/lib/inspection-ledger-row'
import { supabase } from '@/lib/supabase'
import { shortInspectionTypeLabel } from '@/lib/safety-inspection-types'
import type { Special770InspectionData } from '@/lib/special-inspection-770/types'
import { inspectionFindings } from '@/lib/special-inspection-770/summary'
import { downloadSpecial770ResultHwpx } from '@/lib/hwpx/special-770-result-hwpx-export'
import Special770PhotoSlot from './Special770PhotoSlot'
import { normalize770Data, updateItem } from './state'

export interface Special770LedgerInspection {
  id: string
  inspection_type: string
  inspection_date: string
  inspection_team: string | null
  excavator_inspection?: Special770InspectionData | null
}

interface Special770LedgerRowsProps {
  projectId: string
  project: Record<string, unknown> | null
  ins: Special770LedgerInspection
  deleteConfirming: boolean
  onView: () => void
  onEdit: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onChanged: () => Promise<void> | void
}

export default function Special770LedgerRows({
  projectId, project, ins, deleteConfirming, onView, onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onChanged,
}: Special770LedgerRowsProps) {
  const [downloading, setDownloading] = useState(false)
  const [actionDraft, setActionDraft] = useState<{ excavatorId: string; code: string; action: string; dueDate: string } | null>(null)
  const [savingAction, setSavingAction] = useState(false)
  const [actionError, setActionError] = useState('')
  const savingActionRef = useRef(false)
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const actionTriggerKeyRef = useRef('')
  const data = ins.excavator_inspection ?? null
  const findings = inspectionFindings(data)
  const rowCount = Math.max(1, findings.length)
  const overviewPhoto = data?.site_photo_urls?.[0] ?? null
  const team = data?.inspection_team || ins.inspection_team || '-'

  const closeActionEditor = () => {
    setActionDraft(null)
    setActionError('')
    requestAnimationFrame(() => actionTriggerRef.current?.focus())
  }

  const saveAction = async () => {
    if (!actionDraft || savingActionRef.current) return
    savingActionRef.current = true
    setSavingAction(true)
    setActionError('')
    try {
      const { data: row, error: readError } = await (supabase.from('safety_inspections') as any)
        .select('excavator_inspection')
        .eq('id', ins.id)
        .single()
      if (readError) throw readError
      const raw = row?.excavator_inspection as Special770InspectionData | null
      const item = raw?.excavators?.find(exc => exc.id === actionDraft.excavatorId)?.items?.[actionDraft.code]
      if (!item) throw new Error('편집할 지적사항이 없어졌습니다. 목록을 새로고침해 주세요.')
      const next = updateItem(normalize770Data(raw), actionDraft.excavatorId, actionDraft.code, {
        action: actionDraft.action,
        action_due_date: actionDraft.dueDate || null,
      })
      const { data: saved, error } = await (supabase.from('safety_inspections') as any)
        .update({ excavator_inspection: { ...raw, ...next } })
        .eq('id', ins.id)
        .select('id')
        .single()
      if (error) throw error
      if (!saved) throw new Error('저장할 점검을 찾을 수 없거나 수정 권한이 없습니다.')
      await onChanged()
      closeActionEditor()
    } catch (err) {
      console.error('조치 내용 저장 실패:', err)
      setActionError(err instanceof Error ? err.message : '조치 내용 저장에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      savingActionRef.current = false
      setSavingAction(false)
    }
  }

  /** 저장된 최신 값을 다시 읽어 조치 후 사진만 바꿔 넣는다(동시 수정 덮어쓰기 방지). */
  const saveAfterPhoto = async (excavatorId: string, code: string, url: string | null) => {
    try {
      const { data: row, error: readError } = await (supabase.from('safety_inspections') as any)
        .select('excavator_inspection')
        .eq('id', ins.id)
        .single()
      if (readError) throw readError
      const current = normalize770Data(row?.excavator_inspection)
      const next = updateItem(current, excavatorId, code, { after_photo_url: url })
      const { error } = await (supabase.from('safety_inspections') as any)
        .update({ excavator_inspection: next })
        .eq('id', ins.id)
      if (error) throw error
      await onChanged()
    } catch (err) {
      console.error('조치 후 사진 저장 실패:', err)
      alert('조치 후 사진 저장에 실패했습니다.')
    }
  }

  const handleDownload = async () => {
    if (!data || !project || downloading) return
    setDownloading(true)
    try {
      await downloadSpecial770ResultHwpx({ inspectionId: ins.id, inspectionDate: ins.inspection_date, data, project })
    } catch (err) {
      console.error('점검 결과 HWPX 생성 실패:', err)
      alert(err instanceof Error ? err.message : '점검 결과 다운로드에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  const typeCell = (
    <td rowSpan={rowCount} className="px-2 py-3 text-center align-middle border-r border-gray-100">
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 break-keep">
        {shortInspectionTypeLabel(ins.inspection_type)}
      </span>
    </td>
  )

  const overviewCell = (
    <td rowSpan={rowCount} className="px-2 py-3 text-center align-middle border-r border-gray-100">
      <div className="flex flex-col items-center gap-2">
        {overviewPhoto ? (
          <img src={overviewPhoto} alt="현장점검 사진" className="w-24 h-16 object-cover rounded border cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(overviewPhoto, '_blank') }} />
        ) : (
          <div className="w-24 h-16 bg-gray-50 border border-dashed border-gray-200 rounded flex items-center justify-center text-gray-500 text-[10px]">사진 없음</div>
        )}
        <div className="text-gray-900 font-medium text-xs whitespace-nowrap">{ins.inspection_date ? ins.inspection_date.substring(2) : ''}</div>
        <div className="text-xs text-gray-600 line-clamp-2 leading-snug" title={team}>{team}</div>
        <div className="text-[11px] text-gray-500">굴착기 {data?.excavators?.length ?? 0}대</div>
      </div>
    </td>
  )

  const actionsCell = (
    <td rowSpan={rowCount} className="px-2 py-3 text-center align-middle border-l border-gray-100">
      <div className="flex flex-row flex-wrap gap-1 items-center justify-center">
        <button onClick={handleDownload} disabled={!data || !project || downloading} title="점검 결과(HWPX)" aria-label="점검 결과 다운로드" className="p-1.5 text-blue-700 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {downloading ? <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
        <button onClick={onEdit} title="수정" aria-label="수정" className="p-1.5 text-orange-600 hover:bg-orange-50 rounded border border-transparent hover:border-orange-100 transition-colors">
          <Edit2 className="h-4 w-4" />
        </button>
        {deleteConfirming ? (
          <div className="flex items-center gap-1">
            <button onClick={onDeleteConfirm} className="px-1.5 py-1 text-[10px] bg-red-600 hover:bg-red-700 text-white rounded">확인</button>
            <button onClick={onDeleteCancel} className="px-1.5 py-1 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">취소</button>
          </div>
        ) : (
          <button onClick={onDeleteRequest} title="삭제" aria-label="삭제" className="p-1.5 text-red-500 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </td>
  )

  if (findings.length === 0) {
    return (
      <tr className="hover:bg-gray-50 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500" {...inspectionLedgerRowProps(onView)}>
        {typeCell}
        {overviewCell}
        <td className="px-3 py-3 text-center align-middle text-xs text-gray-500 border-l border-gray-100">지적사항 없음</td>
        <td className="px-3 py-3 text-center align-middle text-gray-300 border-l border-gray-100">-</td>
        {actionsCell}
      </tr>
    )
  }

  return (
    <>
      {findings.map((f, i) => (
        <tr key={`${ins.id}-${f.excavatorId}-${f.code}`} className="hover:bg-gray-50 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500" {...inspectionLedgerRowProps(onView)}>
          {i === 0 && typeCell}
          {i === 0 && overviewCell}
          <td className="px-3 py-3 text-xs border-l border-gray-100 align-top w-[30%]">
            <div className="flex flex-col gap-2 items-center">
              {f.result.before_photo_url ? (
                <img src={f.result.before_photo_url} alt="조치 전" className="w-32 h-24 object-cover rounded border cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(f.result.before_photo_url!, '_blank') }} />
              ) : (
                <div className="w-32 h-24 bg-gray-50 border border-dashed border-gray-200 rounded flex items-center justify-center text-gray-500 text-xs">사진 없음</div>
              )}
              <div className="w-full text-left bg-gray-50 p-2 rounded space-y-1">
                <div className="text-gray-500">
                  <span className="font-medium text-gray-900">{f.vehicleNo || '차량번호 미입력'}</span> · [{f.code}] {f.itemText}
                </div>
                <div>
                  <strong className="text-red-600 break-keep mr-1">[지적]</strong>
                  <span className="text-gray-700 break-words leading-relaxed whitespace-pre-wrap">{f.result.finding || '-'}</span>
                </div>
              </div>
            </div>
          </td>
          <td className="px-3 py-3 text-xs border-l border-gray-100 align-top w-[30%]">
            <div className="flex flex-col gap-2 items-center">
              <div data-ledger-row-control className="w-32" onClick={e => e.stopPropagation()}>
                <Special770PhotoSlot
                  projectId={projectId}
                  url={f.result.after_photo_url === 'N/A' ? null : f.result.after_photo_url}
                  label="조치 후 사진"
                  tag={`after_${f.code}`}
                  onChange={url => saveAfterPhoto(f.excavatorId, f.code, url)}
                />
              </div>
              <div data-ledger-row-control className="w-full" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                {actionDraft?.excavatorId === f.excavatorId && actionDraft.code === f.code ? (
                  <form className="w-full text-left bg-blue-50 p-2 rounded space-y-2" aria-label="조치 내용 및 예정일 편집" onSubmit={e => { e.preventDefault(); void saveAction() }}>
                    <label className="block text-xs font-medium text-gray-700">
                      조치 내용
                      <textarea autoFocus rows={3} value={actionDraft.action} disabled={savingAction} onChange={e => setActionDraft({ ...actionDraft, action: e.target.value })} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                    </label>
                    <label className="block text-xs font-medium text-gray-700">
                      조치예정일
                      <input type="date" value={actionDraft.dueDate} disabled={savingAction} onChange={e => setActionDraft({ ...actionDraft, dueDate: e.target.value })} className="block w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                    </label>
                    {actionError && <p role="alert" className="text-xs text-red-600">{actionError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={savingAction} className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{savingAction ? '저장 중...' : '저장'}</button>
                      <button type="button" disabled={savingAction} onClick={closeActionEditor} className="min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">취소</button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    ref={element => { if (element && actionTriggerKeyRef.current === `${f.excavatorId}-${f.code}`) actionTriggerRef.current = element }}
                    disabled={actionDraft !== null}
                    aria-label={`${f.vehicleNo || '차량번호 미입력'} ${f.code} 조치 내용 및 예정일 편집`}
                    onClick={e => {
                      actionTriggerRef.current = e.currentTarget
                      actionTriggerKeyRef.current = `${f.excavatorId}-${f.code}`
                      setActionError('')
                      setActionDraft({ excavatorId: f.excavatorId, code: f.code, action: f.result.action || '', dueDate: f.result.action_due_date || '' })
                    }}
                    className="w-full min-h-[44px] text-left bg-blue-50 p-2 rounded space-y-1 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
                  >
                    <span className="block">
                      <strong className="text-blue-600 break-keep mr-1">[조치]</strong>
                      <span className="text-gray-700 break-words leading-relaxed whitespace-pre-wrap">{f.result.action || '-'}</span>
                    </span>
                    {!f.completed && <span className="block text-gray-500">조치예정일 {f.result.action_due_date || '-'}</span>}
                  </button>
                )}
              </div>
            </div>
          </td>
          {i === 0 && actionsCell}
        </tr>
      ))}
    </>
  )
}
