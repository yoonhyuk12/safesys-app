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

const MergeProjectsModal: React.FC<MergeProjectsModalProps> = ({ isOpen, source, target, onClose, onMerged }) => {
  const [overlapCount, setOverlapCount] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 확인 모달이 열리면 겹치는 작업일보 날짜 수를 미리 조회한다.
  useEffect(() => {
    if (!isOpen || !source || !target) {
      setOverlapCount(null)
      setChecking(false)
      setLoading(false)
      setError('')
      return
    }

    let cancelled = false
    setOverlapCount(null)
    setChecking(true)
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

    void checkOverlap()
    return () => {
      cancelled = true
    }
  }, [isOpen, source, target])

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
            disabled={loading || checking}
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
