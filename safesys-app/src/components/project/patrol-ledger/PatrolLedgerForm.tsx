// TBM 작업내용·AI 점검항목·사진·개인 서명을 순회점검 초안에 입력한다.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Upload } from 'lucide-react'
import ImageEditor from '@/components/ui/ImageEditor'
import SignaturePad from '@/components/ui/SignaturePad'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/projects'
import { PATROL_LEDGER_PHOTO_KIND_LABELS, PATROL_LEDGER_PHOTO_KINDS, PATROL_LEDGER_THEME_MAX, type PatrolLedgerAiRequest, type PatrolLedgerAiResponse } from '@/lib/patrol-ledger/types'
import { loadTbmWorkForDate } from '@/lib/patrol-ledger/tbm-work'
import { getPatrolLedgerWeeklyTheme, patrolLedgerWeekStart } from '@/lib/patrol-ledger/themes'
import {
  buildPatrolLedgerItems, isBlankPatrolLedgerSignature, setAllPatrolLedgerResults,
  removePatrolLedgerPhoto, setPatrolLedgerItemResult, setPatrolLedgerItemText, uploadPatrolLedgerPhoto,
  validatePatrolLedgerDraft, type PatrolLedgerDraft,
} from '@/lib/patrol-ledger/records'

/** 페이지 헤더가 스크롤된 뒤에도 폼 툴바는 화면 상단에 유지한다. */
const TOOLBAR_TOP = 'top-0'
const INPUT = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm'
const SECONDARY = 'min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50'

export default function PatrolLedgerForm({ project, initialDraft, editing, saving, onSave, onCancel }: {
  project: Project
  initialDraft: PatrolLedgerDraft
  editing: boolean
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
  const [editingPhoto, setEditingPhoto] = useState(false)
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

  useEffect(() => {
    let active = true
    const loadTheme = async () => {
      try {
        const weeklyTheme = await getPatrolLedgerWeeklyTheme(patrolLedgerWeekStart(draft.inspection_date))
        if (!active || !weeklyTheme) return
        setDraft(current => current.theme.trim() ? current : { ...current, theme: weeklyTheme.theme, signature: '' })
      } catch (cause) {
        console.error('금주 점검 테마를 불러오지 못했습니다.', cause)
      }
    }
    void loadTheme()
    return () => { active = false }
  }, [draft.inspection_date])

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
      const body: PatrolLedgerAiRequest = { projectId: project.id, inspectionDate: draft.inspection_date, ...(manual ? { workDescription: manualText.trim() } : {}), ...(draft.theme.trim() ? { theme: draft.theme.trim() } : {}) }
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

  // 공용 ImageEditor의 크롭·회전 결과를 새 파일로 올리고 옛 파일은 지운다.
  const saveEditedPhoto = async (blob: Blob) => {
    const previous = draft.finding_photo_url
    setEditingPhoto(false)
    if (!previous || busy) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadPatrolLedgerPhoto(project.id, blob)
      await removePatrolLedgerPhoto(previous).catch(() => undefined)
      if (alive.current) edit({ finding_photo_url: url })
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : '편집한 사진 저장에 실패했습니다.')
    } finally { if (alive.current) setUploading(false) }
  }

  // 저장·수정 모두 서명 모달을 거친다. 서명 외 입력을 먼저 검사해 모달에서 서명한 뒤 다시 돌아오는 일을 막는다.
  const requestSave = () => {
    if (busy || loadingTbm) return
    const invalid = validatePatrolLedgerDraft(draft, { skipSignature: true })
    if (invalid) { setError(invalid); return }
    setError(null)
    setShowSignature(true)
  }
  const saveWithSignature = async (signature: string) => {
    const next = { ...draft, signature }
    setDraft(next)
    setShowSignature(false)
    const invalid = validatePatrolLedgerDraft(next)
    if (invalid) { setError(invalid); return }
    await onSave(next)
  }

  return <form className="min-w-0 bg-white rounded-lg shadow-sm border border-gray-200" onSubmit={event => { event.preventDefault(); requestSave() }}>
    <div className={`sticky ${TOOLBAR_TOP} z-20 bg-blue-600 text-white rounded-t-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2`}>
      <h2 className="font-semibold text-sm sm:text-base truncate min-w-0 flex-1">{editing ? '점검 수정' : '새 점검 작성'}</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-[44px] px-4 py-2 text-sm font-medium text-white border border-white rounded-lg hover:bg-blue-700 disabled:opacity-50">취소</button>
        <button type="submit" disabled={busy || loadingTbm} className="min-h-[44px] px-4 py-2 bg-white text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{saving ? '저장 중' : '저장'}</button>
      </div>
    </div>
    {error && <p role="alert" className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 text-sm text-red-800">{error}</p>}
    <fieldset disabled={busy} className="min-w-0 p-3 sm:p-4 space-y-4 disabled:opacity-75">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 space-y-3">
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
          {tbmError && <div className="text-sm text-red-800 break-words" role="alert">{tbmError}<button type="button" className={SECONDARY} onClick={() => setReload(value => value + 1)}>다시 조회</button></div>}
          {!work.summary && !tbmError && <p className="text-xs text-gray-500">해당 일자에 제출된 TBM 작업내용이 없습니다. 작업내용을 직접 입력해주세요.</p>}
          {manual ? <label className="block text-sm font-medium text-gray-700">작업내용 직접 입력<textarea value={manualText} maxLength={2000} rows={4} className={INPUT} onChange={event => { setManualText(event.target.value); edit({}) }} /></label>
            : <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{work.summary}</p>}
        </>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-0 flex-1 basis-64 text-sm font-medium text-gray-700">주요 테마
            <input value={draft.theme} maxLength={PATROL_LEDGER_THEME_MAX} placeholder="금주 점검 테마가 자동으로 채워집니다" className={INPUT} onChange={event => edit({ theme: event.target.value })} />
          </label>
          <button type="button" disabled={loadingTbm || (manual ? !manualText.trim() : !work.summary)} onClick={generate} className={SECONDARY}>AI 점검항목 생성</button>
        </div>
        <p className="text-xs text-gray-500">테마 항목 5건은 주요 테마와 당일 작업내용을 결합해 만듭니다.</p>
        {generating && <LoadingSpinner />}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium text-gray-700">점검사항</h2><button type="button" disabled={!draft.items.length} className={SECONDARY} onClick={() => edit({ items: setAllPatrolLedgerResults(draft.items, '양호') })}>전체 양호</button></div>
        {!draft.items.length ? <p className="px-4 py-8 text-center text-sm text-gray-500">작업내용을 확인한 뒤 AI 점검항목을 생성해주세요.</p> : <ul className="divide-y divide-gray-200">{draft.items.map((item, index) => <li key={item.no} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-end gap-2">
          <label className="block min-w-0 flex-1 text-sm font-medium text-gray-700">{item.no}. ({item.category})<input aria-label={`${item.no}번 점검사항`} value={item.text} className={INPUT} onChange={event => edit({ items: setPatrolLedgerItemText(draft.items, index, event.target.value) })} /></label>
          <div className="flex flex-wrap gap-2 shrink-0">{(['양호', '미흡'] as const).map(result => <button type="button" key={result} aria-pressed={item.result === result} aria-label={`${item.no}번 ${result}`} onClick={() => edit({ items: setPatrolLedgerItemResult(draft.items, index, item.result === result ? '' : result) })} className={`min-h-[44px] flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${item.result === result ? result === '양호' ? 'border-green-600 bg-green-50 text-green-800' : 'border-red-600 bg-red-50 text-red-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>{result}</button>)}</div>
        </li>)}</ul>}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-700">사진 구분</p>
            <div className="inline-flex flex-wrap rounded-lg border border-gray-300 overflow-hidden" role="radiogroup" aria-label="사진 구분">
              {PATROL_LEDGER_PHOTO_KINDS.map(kind => <button type="button" key={kind} role="radio" aria-checked={draft.finding_photo_kind === kind}
                onClick={() => edit(kind === 'overview' ? { finding_photo_kind: kind, finding_text: '' } : { finding_photo_kind: kind })}
                className={`min-h-[44px] px-4 py-2 text-sm font-medium transition-colors ${draft.finding_photo_kind === kind ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{PATROL_LEDGER_PHOTO_KIND_LABELS[kind]}</button>)}
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">{draft.finding_photo_kind === 'overview' ? '전경사진은 지적사항 없이 점검 현황만 남깁니다.' : '지적사진은 아래 지적사항과 함께 출력됩니다.'}</p>
          <label className="mt-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg h-24 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
            {uploading ? <span className="text-xs text-gray-500">업로드중...</span> : <>
              <Upload className="h-5 w-5 text-gray-400 mb-1" />
              <span className="text-xs font-medium text-gray-500">{draft.finding_photo_url ? '사진 바꾸기' : '사진 업로드'}</span>
            </>}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
          </label>
          {draft.finding_photo_url && <div className="mt-2 relative inline-block max-w-full rounded-lg overflow-hidden border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.finding_photo_url} alt="점검사진 미리보기" className="max-h-48 max-w-full object-contain" />
            <div className="absolute top-1 right-1 flex flex-wrap gap-1">
              <button type="button" aria-label="사진 크롭·회전" title="크롭/회전" onClick={() => setEditingPhoto(true)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"><Pencil className="h-4 w-4" /></button>
              <button type="button" aria-label="사진 삭제" title="사진 삭제" onClick={() => edit({ finding_photo_url: null })} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-1.5 rounded-md bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>}
        </div>
        <label className={`block text-sm font-medium ${draft.finding_photo_kind === 'overview' ? 'text-gray-400' : 'text-gray-700'}`}>지적사항{draft.finding_photo_kind === 'overview' && <span className="ml-1 text-xs font-normal">(전경사진에서는 입력하지 않습니다)</span>}
          <textarea value={draft.finding_text} rows={5} disabled={draft.finding_photo_kind === 'overview'} className={`${INPUT} disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`} onChange={event => edit({ finding_text: event.target.value })} /></label>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          ['contractor_name', '시공사명'], ['district_name', '지구명'], ['inspector_affiliation', '점검자 소속'],
          ['inspector_position', '직급'], ['inspector_name', '성명'],
        ] as const).map(([key, label]) => <label key={key} className="block text-sm font-medium text-gray-700">{label}<input value={draft[key]} maxLength={key === 'inspector_name' ? 100 : undefined} className={INPUT} onChange={event => edit({ [key]: event.target.value })} /></label>)}
        <div><p className="text-sm font-medium text-gray-700">점검자 서명</p>
          {!isBlankPatrolLedgerSignature(draft.signature)
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={draft.signature} alt="점검자 서명" className="h-16 max-w-full object-contain border border-gray-200 rounded-md bg-white" />
            : <p className="text-xs text-gray-500">저장 버튼을 누르면 서명 창이 열립니다.</p>}
        </div>
        <p className="sm:col-span-2 text-xs text-gray-500">점검자 본인이 직접 서명합니다. 저장·수정할 때마다 새로 서명하며, 서명이 끝나면 바로 저장됩니다.</p>
      </div>
    </fieldset>
    {editingPhoto && draft.finding_photo_url && <ImageEditor imageUrl={draft.finding_photo_url} onSave={saveEditedPhoto} onClose={() => setEditingPhoto(false)} />}
    {showSignature && <SignaturePad title="점검자 서명 후 저장" onSave={signature => { void saveWithSignature(signature) }} onCancel={() => setShowSignature(false)} />}
  </form>
}
