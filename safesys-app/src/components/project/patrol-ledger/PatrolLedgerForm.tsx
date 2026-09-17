// TBM 작업내용·AI 점검항목·사진·개인 서명을 순회점검 초안에 입력한다.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import SignaturePad from '@/components/ui/SignaturePad'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/projects'
import type { PatrolLedgerAiRequest, PatrolLedgerAiResponse } from '@/lib/patrol-ledger/types'
import { loadTbmWorkForDate } from '@/lib/patrol-ledger/tbm-work'
import {
  buildPatrolLedgerItems, isBlankPatrolLedgerSignature, setAllPatrolLedgerResults,
  setPatrolLedgerItemResult, setPatrolLedgerItemText, uploadPatrolLedgerPhoto,
  validatePatrolLedgerDraft, type PatrolLedgerDraft,
} from '@/lib/patrol-ledger/records'

const INPUT = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm'
const SECONDARY = 'min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50'

export default function PatrolLedgerForm({ project, initialDraft, saving, onSave, onCancel }: {
  project: Project
  initialDraft: PatrolLedgerDraft
  saving: boolean
  onSave: (draft: PatrolLedgerDraft) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [work, setWork] = useState({ summary: '', count: 0 })
  const [manual, setManual] = useState(Boolean(initialDraft.tbm_work_summary))
  const [manualText, setManualText] = useState(initialDraft.tbm_work_summary)
  const [loadingTbm, setLoadingTbm] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showSignature, setShowSignature] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tbmError, setTbmError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const alive = useRef(true)
  const busy = saving || generating || uploading

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let active = true
    setLoadingTbm(true)
    setTbmError(null)
    setWork({ summary: '', count: 0 })
    loadTbmWorkForDate(supabase, project, draft.inspection_date).then(result => {
      if (!active) return
      setWork(result)
      if (!result.summary) setManual(true)
    }).catch((cause: unknown) => {
      if (!active) return
      setTbmError(cause instanceof Error ? cause.message : 'TBM 작업내용을 불러오지 못했습니다.')
      setManual(true)
    }).finally(() => { if (active) setLoadingTbm(false) })
    return () => { active = false }
  }, [project, draft.inspection_date, reload])

  const edit = (patch: Partial<PatrolLedgerDraft>) => {
    setDraft(current => ({ ...current, ...patch, signature: '' }))
    setError(null)
  }

  const generate = async () => {
    if (busy || loadingTbm) return
    if (manual && !manualText.trim()) { setError('작업내용을 직접 입력해주세요.'); return }
    setGenerating(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session?.access_token) throw new Error('로그인이 필요합니다.')
      const body: PatrolLedgerAiRequest = { projectId: project.id, inspectionDate: draft.inspection_date, ...(manual ? { workDescription: manualText.trim() } : {}) }
      const response = await fetch('/api/ai/patrol-ledger', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body),
      })
      const result: PatrolLedgerAiResponse = await response.json()
      if (!response.ok || !result.success || !result.items) throw new Error(result.error || '점검항목 생성에 실패했습니다.')
      if (!alive.current) return
      setDraft(current => ({ ...current, items: buildPatrolLedgerItems(result.items!), tbm_work_summary: result.workSummary ?? '', signature: '' }))
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : '점검항목 생성에 실패했습니다.')
    } finally { if (alive.current) setGenerating(false) }
  }

  const upload = async (file: File | undefined) => {
    if (!file || busy) return
    if (!file.type.startsWith('image/')) { setError('사진 파일을 선택해주세요.'); return }
    setUploading(true)
    setError(null)
    try {
      const url = await uploadPatrolLedgerPhoto(project.id, file)
      if (alive.current) edit({ finding_photo_url: url })
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : '사진 업로드에 실패했습니다.')
    } finally { if (alive.current) setUploading(false) }
  }

  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault()
    if (busy || loadingTbm) return
    const invalid = validatePatrolLedgerDraft(draft)
    if (invalid) { setError(invalid); return }
    await onSave(draft)
  }}>
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-75">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700">점검일자
          <input type="date" required value={draft.inspection_date} className={INPUT} onChange={event => {
            edit({ inspection_date: event.target.value })
            setManual(false)
            setManualText('')
          }} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-700">작업내용 · {work.count}건의 TBM</h2>
          {work.summary && <label className="min-h-[44px] inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={manual} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" onChange={event => {
            setManual(event.target.checked)
            if (event.target.checked) setManualText(work.summary)
            edit({})
          }} />직접 수정</label>}
        </div>
        {loadingTbm ? <LoadingSpinner /> : <>
          {tbmError && <div className="text-sm text-red-800" role="alert">{tbmError}<button type="button" className={SECONDARY} onClick={() => setReload(value => value + 1)}>다시 조회</button></div>}
          {!work.summary && !tbmError && <p className="text-sm text-gray-500">해당 일자에 제출된 TBM 작업내용이 없습니다. 작업내용을 직접 입력해주세요.</p>}
          {manual ? <label className="block text-sm text-gray-700">작업내용 직접 입력<textarea value={manualText} maxLength={2000} rows={4} className={INPUT} onChange={event => { setManualText(event.target.value); edit({}) }} /></label>
            : <p className="text-sm text-gray-600 whitespace-pre-wrap">{work.summary}</p>}
        </>}
        <button type="button" disabled={loadingTbm || (manual ? !manualText.trim() : !work.summary)} onClick={generate} className={SECONDARY}>AI 점검항목 생성</button>
        {generating && <LoadingSpinner />}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-3"><h2 className="text-lg font-semibold text-gray-900">점검사항</h2><button type="button" disabled={!draft.items.length} className={SECONDARY} onClick={() => edit({ items: setAllPatrolLedgerResults(draft.items, '양호') })}>전체 양호</button></div>
        {!draft.items.length ? <p className="px-4 py-8 text-center text-sm text-gray-500">작업내용을 확인한 뒤 AI 점검항목을 생성해주세요.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px]">
          <thead className="bg-gray-50 border-b border-gray-200"><tr>{['No.', '점검사항', '결과'].map(label => <th key={label} className="px-3 py-3 text-center text-xs font-medium text-gray-500">{label}</th>)}</tr></thead>
          <tbody className="bg-white divide-y divide-gray-200">{draft.items.map((item, index) => <tr key={item.no}>
            <td className="px-3 py-3 text-sm text-center">{item.no}</td>
            <td className="px-3 py-3 text-sm"><label className="block text-xs text-gray-500">({item.category})<input aria-label={`${item.no}번 점검사항`} value={item.text} className={INPUT} onChange={event => edit({ items: setPatrolLedgerItemText(draft.items, index, event.target.value) })} /></label></td>
            <td className="px-3 py-3 text-sm text-center"><div className="flex gap-1">{(['양호', '미흡'] as const).map(result => <button type="button" key={result} aria-pressed={item.result === result} aria-label={`${item.no}번 ${result}`} onClick={() => edit({ items: setPatrolLedgerItemResult(draft.items, index, item.result === result ? '' : result) })} className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium border whitespace-nowrap ${item.result === result ? result === '양호' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200' : 'bg-white text-gray-700 border-gray-300'}`}>{result}</button>)}</div></td>
          </tr>)}</tbody>
        </table></div>}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 grid sm:grid-cols-2 gap-4">
        <div><p className="block text-sm font-medium text-gray-700">지적사진 (없는 경우 점검사진)</p>
          <label className="mt-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg h-24 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
            {uploading ? <span className="text-xs text-gray-500">업로드중...</span> : <>
              <Upload className="h-5 w-5 text-gray-400 mb-1" />
              <span className="text-xs font-medium text-gray-500">{draft.finding_photo_url ? '사진 바꾸기' : '사진 업로드'}</span>
            </>}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
          </label>
          {draft.finding_photo_url && <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.finding_photo_url} alt="점검사진 미리보기" className="max-h-48 max-w-full object-contain" />
            <button type="button" className={SECONDARY} onClick={() => edit({ finding_photo_url: null })}>사진 삭제</button>
          </div>}
        </div>
        <label className="block text-sm font-medium text-gray-700">지적사항<textarea value={draft.finding_text} rows={5} className={INPUT} onChange={event => edit({ finding_text: event.target.value })} /></label>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 grid sm:grid-cols-2 gap-3">
        {([
          ['contractor_name', '시공사명'], ['district_name', '지구명'], ['inspector_affiliation', '점검자 소속'],
          ['inspector_position', '직급'], ['inspector_name', '성명'],
        ] as const).map(([key, label]) => <label key={key} className="block text-sm font-medium text-gray-700">{label}<input value={draft[key]} maxLength={key === 'inspector_name' ? 100 : undefined} className={INPUT} onChange={event => edit({ [key]: event.target.value })} /></label>)}
        <div><p className="text-sm font-medium text-gray-700">점검자 서명</p>
          {!isBlankPatrolLedgerSignature(draft.signature) && <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.signature} alt="점검자 서명" className="h-16 max-w-full object-contain" />
          </>}
          <button type="button" className={SECONDARY} onClick={() => setShowSignature(true)}>{draft.signature ? '다시 서명' : '서명하기'}</button>
        </div>
        <p className="sm:col-span-2 text-xs text-gray-500">점검자 본인이 직접 서명합니다. 내용을 고치면 서명이 지워지므로 모든 입력을 마친 뒤 서명해주세요.</p>
      </div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex justify-end gap-2">
      <button type="button" disabled={busy} onClick={onCancel} className={SECONDARY}>취소</button>
      <button type="submit" disabled={busy || loadingTbm} className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{saving ? '저장 중' : '저장'}</button>
    </div>
    {showSignature && <SignaturePad title="점검자 서명" onSave={signature => { setDraft(current => ({ ...current, signature })); setShowSignature(false) }} onCancel={() => setShowSignature(false)} />}
  </form>
}
