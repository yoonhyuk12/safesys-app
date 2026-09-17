// 순회점검대장의 세션·현장 조회와 목록·작성·상세·삭제·HWPX 다운로드를 연결한다.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/projects'
import type { PatrolLedgerInspection } from '@/lib/patrol-ledger/types'
import {
  createPatrolLedgerDraft, createPatrolLedgerInspection, deletePatrolLedgerInspection,
  getPatrolLedgerInspections, patrolLedgerToDraft, updatePatrolLedgerInspection,
  validatePatrolLedgerDraft, type PatrolLedgerDraft,
} from '@/lib/patrol-ledger/records'
import { downloadPatrolLedgerHwpx } from '@/lib/hwpx/patrol-ledger-hwpx-export'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PatrolLedgerList from '@/components/project/patrol-ledger/PatrolLedgerList'
import PatrolLedgerDetail from '@/components/project/patrol-ledger/PatrolLedgerDetail'
import PatrolLedgerForm from '@/components/project/patrol-ledger/PatrolLedgerForm'

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const SECONDARY = 'min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50'

export default function PatrolLedgerPage() {
  const router = useRouter()
  const projectId = useParams().id as string
  const { userProfile } = useAuth()
  const [sessionChecked, setSessionChecked] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [records, setRecords] = useState<PatrolLedgerInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<PatrolLedgerInspection | null>(null)
  const [draft, setDraft] = useState<PatrolLedgerDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const busy = saving || downloading || deleting

  useEffect(() => {
    let active = true
    const apply = (id: string | null) => {
      if (!active) return
      setUserId(id)
      setSessionChecked(true)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null)).catch(() => apply(null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user.id ?? null))
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (sessionChecked && !userId) router.replace('/login')
  }, [sessionChecked, userId, router])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [{ data, error: projectError }, nextRecords] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        getPatrolLedgerInspections(projectId),
      ])
      if (projectError || !data) throw new Error('현장 정보를 불러오지 못했습니다.')
      setProject(data as Project)
      setRecords(nextRecords)
    } catch (cause) {
      setLoadError(message(cause, '순회점검대장을 불러오지 못했습니다.'))
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { if (userId) void load() }, [userId, load])

  const start = () => {
    if (!project || busy) return
    setError(null)
    setSelected(null)
    setEditingId(null)
    setDraft(createPatrolLedgerDraft({
      districtName: project.project_name,
      contractorName: project.g2b_corp_nm ?? '',
      inspectorName: userProfile?.full_name ?? '',
      inspectorAffiliation: userProfile?.branch_division || userProfile?.hq_division || userProfile?.company_name || '',
    }))
  }
  const save = async (value: PatrolLedgerDraft) => {
    if (busy || !userId) return
    const invalid = validatePatrolLedgerDraft(value)
    if (invalid) { setError(invalid); return }
    setSaving(true)
    setError(null)
    try {
      const saved = editingId
        ? await updatePatrolLedgerInspection(editingId, value)
        : await createPatrolLedgerInspection(projectId, userId, value)
      setDraft(null)
      setEditingId(null)
      setSelected(saved)
      await load()
    } catch (cause) { setError(message(cause, '점검 저장에 실패했습니다.')) }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!selected || busy) return
    setDeleting(true)
    setError(null)
    try {
      await deletePatrolLedgerInspection(selected.id)
      setSelected(null)
      setConfirmDelete(false)
      await load()
    } catch (cause) { setError(message(cause, '점검 삭제에 실패했습니다.')); setConfirmDelete(false) }
    finally { setDeleting(false) }
  }
  const download = async () => {
    if (!selected || !project || busy) return
    setDownloading(true)
    setError(null)
    try { await downloadPatrolLedgerHwpx(selected, { projectName: project.project_name }) }
    catch (cause) { setError(message(cause, 'HWPX 다운로드에 실패했습니다.')) }
    finally { setDownloading(false) }
  }

  if (!sessionChecked || !userId) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><LoadingSpinner /></div>
  return <div className="min-h-screen bg-gray-50">
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        <button disabled={busy} aria-label="프로젝트로 돌아가기" className={SECONDARY} onClick={() => {
          sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
          router.push(`/project/${projectId}`)
        }}><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1"><h1 className="text-xl font-bold text-gray-900">(AI) 순회점검대장</h1><p className="text-sm text-gray-500 truncate">{project?.project_name}</p></div>
        {!draft && !selected && <button disabled={!project || loading || busy} onClick={start} className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"><Plus className="h-4 w-4" />새 점검</button>}
      </div>
    </header>
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {loadError && <div role="alert" className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-sm text-red-800"><p>{loadError}</p><button onClick={load} className={SECONDARY}>다시 불러오기</button></div>}
      {draft && project ? <PatrolLedgerForm key={editingId ?? 'new'} project={project} initialDraft={draft} saving={saving} onSave={save} onCancel={() => { setDraft(null); setEditingId(null); setError(null) }} />
        : selected && project ? <>
          <button disabled={busy} className={SECONDARY} onClick={() => { setSelected(null); setError(null) }}>목록으로</button>
          <PatrolLedgerDetail record={selected} busy={busy} downloading={downloading} canEdit={selected.created_by === userId}
            canDelete={selected.created_by === userId || project.created_by === userId || userProfile?.role === '발주청'}
            onDownload={download} onDelete={() => setConfirmDelete(true)} onEdit={() => {
              if (selected.created_by !== userId) return
              setEditingId(selected.id)
              setDraft(patrolLedgerToDraft(selected))
              setError(null)
            }} />
        </> : loading ? <LoadingSpinner /> : !loadError && <PatrolLedgerList records={records} onSelect={setSelected} />}
    </main>
    {confirmDelete && selected && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="patrol-delete-title" onKeyDown={event => {
      if (event.key === 'Escape' && !deleting) setConfirmDelete(false)
      if (event.key !== 'Tab') return
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 id="patrol-delete-title" className="text-lg font-semibold text-gray-900">점검 삭제</h2>
        <p className="mt-3 text-sm text-gray-600">{selected.inspection_date} {selected.inspector_name}님의 점검을 삭제하시겠습니까?</p>
        <div className="flex justify-end gap-2 mt-4">
          <button autoFocus disabled={deleting} className={SECONDARY} onClick={() => setConfirmDelete(false)}>취소</button>
          <button disabled={deleting} onClick={remove} className="min-h-[44px] px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">{deleting ? '삭제 중' : '삭제'}</button>
        </div>
      </div>
    </div>}
  </div>
}
