'use client'
// 목록에서 선택한 두 프로젝트의 병합 방향을 최종 확인하고 병합을 실행하는 모달.

import React, { useEffect, useState } from 'react'
import { X, GitMerge, Loader2, AlertTriangle, Trash2, Save } from 'lucide-react'
import type { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'

interface MergeProjectsModalProps {
  isOpen: boolean
  source: Project | null
  target: Project | null
  onClose: () => void
  onMerged: () => void | Promise<void>
}

interface MergeParticipant {
  id: string
  full_name: string | null
  email: string | null
  company_name: string | null
  role: string | null
  sourceOwner: boolean
  alreadyShared: boolean
}

interface MergePreview {
  sourceId: string
  targetId: string
  targetProjectName: string
  participants: MergeParticipant[]
}

interface MergePreviewResponse {
  success?: boolean
  error?: string
  targetProjectName?: string
  participants?: MergeParticipant[]
}

const MergeProjectsModal: React.FC<MergeProjectsModalProps> = ({ isOpen, source, target, onClose, onMerged }) => {
  const [overlapCount, setOverlapCount] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 확인 모달이 열리면 겹치는 작업일보와 공유자로 유지·전환될 계정을 함께 조회한다.
  useEffect(() => {
    if (!isOpen || !source || !target) {
      setOverlapCount(null)
      setChecking(false)
      setPreview(null)
      setPreviewLoading(false)
      setPreviewError('')
      setLoading(false)
      setError('')
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setOverlapCount(null)
    setChecking(true)
    setPreview(null)
    setPreviewLoading(true)
    setPreviewError('')
    setError('')

    const checkOverlap = async () => {
      try {
        const [{ data: src }, { data: tgt }] = await Promise.all([
          supabase.from('work_daily_reports').select('report_date').eq('project_id', source.id),
          supabase.from('work_daily_reports').select('report_date').eq('project_id', target.id),
        ])
        if (cancelled) return

        const targetDates = new Set((tgt ?? []).map((report: { report_date: string }) => report.report_date))
        const overlap = (src ?? []).filter((report: { report_date: string }) => targetDates.has(report.report_date)).length
        setOverlapCount(overlap)
      } catch (err) {
        console.error('겹치는 작업일보 조회 실패:', err)
        if (!cancelled) setOverlapCount(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    const loadPreview = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session?.access_token) {
          throw new Error('로그인이 필요합니다.')
        }

        const params = new URLSearchParams({ sourceId: source.id, targetId: target.id })
        const response = await fetch(`/api/projects/merge?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        })
        const json = await response.json() as MergePreviewResponse
        if (!response.ok || !json.success) {
          throw new Error(json.error || '공유자 안내를 불러오지 못했습니다.')
        }
        if (typeof json.targetProjectName !== 'string' || !Array.isArray(json.participants)) {
          throw new Error('공유자 안내 응답이 올바르지 않습니다.')
        }
        if (cancelled) return

        setPreview({
          sourceId: source.id,
          targetId: target.id,
          targetProjectName: json.targetProjectName,
          participants: json.participants,
        })
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return
        console.error('병합 공유자 미리보기 조회 실패', err)
        setPreview(null)
        setPreviewError(err instanceof Error ? err.message : '공유자 안내를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    void checkOverlap()
    void loadPreview()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isOpen, source, target])

  const previewReady = Boolean(
    source && target && preview && preview.sourceId === source.id && preview.targetId === target.id,
  )

  if (!isOpen || !source || !target) return null

  const handleClose = () => {
    if (loading) return
    onClose()
  }

  const handleMerge = async () => {
    if (source.id === target.id) {
      setError('같은 프로젝트끼리는 합칠 수 없습니다.')
      return
    }
    if (!previewReady || previewLoading || previewError) {
      setError('공유자 안내를 확인하지 못해 합칠 수 없습니다.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('로그인이 필요합니다.')
      }
      const res = await fetch('/api/projects/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ sourceId: source.id, targetId: target.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || '프로젝트 병합에 실패했습니다.')
      }
      const dropped = json.dropped as { dropped_work_daily_reports?: number; dropped_project_shares?: number } | null
      const droppedReports = dropped?.dropped_work_daily_reports ?? 0
      await onMerged()
      const extra = droppedReports > 0 ? `\n(겹치는 작업일보 ${droppedReports}건은 유지될 현장 것만 남기고 폐기됨)` : ''
      alert(`프로젝트를 병합했습니다.${extra}`)
      onClose()
    } catch (err) {
      console.error('병합 처리 오류:', err)
      setError(err instanceof Error ? err.message : '프로젝트 병합 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" role="presentation">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="merge-projects-title">
        <div className="flex items-center justify-between border-b border-gray-200 p-5">
          <div className="flex items-center">
            <GitMerge className="mr-2 h-6 w-6 text-indigo-600" />
            <h3 id="merge-projects-title" className="text-lg font-semibold text-gray-900">프로젝트 합치기</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            aria-label="프로젝트 합치기 닫기"
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="text-sm text-red-800">
              <p className="font-semibold">되돌릴 수 없는 작업입니다.</p>
              <p className="mt-0.5">아래 방향을 확인하세요. 삭제될 현장의 데이터가 유지될 현장으로 옮겨진 뒤 삭제될 현장은 사라집니다.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-md border border-red-200 p-3">
              <Trash2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
              <div>
                <p className="text-xs font-semibold text-red-700">삭제될 현장</p>
                <p className="text-sm font-medium text-gray-900">{source.project_name}</p>
                <p className="text-xs text-gray-500">{source.managing_hq} • {source.managing_branch}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-blue-200 p-3">
              <Save className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
              <div>
                <p className="text-xs font-semibold text-blue-700">유지될 현장</p>
                <p className="text-sm font-medium text-gray-900">{target.project_name}</p>
                <p className="text-xs text-gray-500">{target.managing_hq} • {target.managing_branch}</p>
              </div>
            </div>
          </div>

          <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            유지될 현장의 선택사항이 비어 있으면 삭제될 현장 값으로 채우며, 이미 입력된 값은 그대로 유지합니다.
          </p>

          <section className="rounded-md border border-gray-200 bg-gray-50 p-3" aria-labelledby="merge-share-preview-title">
            <h4 id="merge-share-preview-title" className="text-sm font-semibold text-gray-900">
              공유자로 유지 또는 전환되는 계정
            </h4>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              발주청 계정은 관할 권한으로 접근하므로 공유자 전환 대상에서 제외됩니다.
            </p>

            {previewLoading && (
              <p className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                계정 정보를 확인하는 중입니다.
              </p>
            )}

            {previewError && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700" role="alert">
                {previewError} 이 상태에서는 합칠 수 없습니다.
              </p>
            )}

            {preview && preview.participants.length === 0 && (
              <p className="mt-2 text-sm text-gray-600">공유자로 전환되는 별도 계정이 없습니다.</p>
            )}

            {preview && preview.participants.length > 0 && (
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {preview.participants.map((participant) => {
                  const accountName = participant.full_name?.trim() || '이름 미등록'
                  const accountDetails = [participant.company_name, participant.email]
                    .filter((value): value is string => Boolean(value))
                  const accountLabel = accountDetails.length > 0
                    ? `${accountName} (${accountDetails.join(', ')})`
                    : accountName

                  return (
                    <li key={participant.id} className="min-w-0 rounded-md border border-gray-200 bg-white p-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="break-words text-sm font-medium text-gray-900">{accountName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          participant.sourceOwner
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-200 text-gray-700'
                        }`}>
                          {participant.sourceOwner ? '삭제될 현장 소유자' : '기존 공유자'}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-gray-600">
                        {accountLabel} 계정은 병합 후 “{preview.targetProjectName}”의 공유자{participant.alreadyShared ? '로 유지됩니다.' : '가 됩니다.'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {checking && (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              겹치는 작업일보를 확인하는 중입니다.
            </p>
          )}
          {overlapCount !== null && overlapCount > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              겹치는 작업일보 {overlapCount}건은 합쳐지지 않고 유지될 현장 것만 남으며, 삭제될 현장 것은 삭제됩니다.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 p-5">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={loading || checking || previewLoading || !previewReady}
            className="flex items-center gap-2 rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? '합치는 중...' : '합치기'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MergeProjectsModal
