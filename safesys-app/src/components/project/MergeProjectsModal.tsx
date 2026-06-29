'use client'
// 두 프로젝트를 병합(대상→합산처 이전 후 대상 삭제)하는 모달. 발주청 전용, 확인 단계 필수.

import React, { useEffect, useMemo, useState } from 'react'
import { X, GitMerge, Loader2, AlertTriangle, Search, Trash2, Save } from 'lucide-react'
import type { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'

interface MergeProjectsModalProps {
  isOpen: boolean
  projects: Project[]
  onClose: () => void
  onMerged: () => void | Promise<void>
}

// 단일 프로젝트 선택용 검색 리스트
interface ProjectPickerProps {
  label: string
  accent: 'red' | 'blue'
  projects: Project[]
  selectedId: string | null
  disabledId: string | null
  onSelect: (id: string) => void
}

function ProjectPicker({ label, accent, projects, selectedId, disabledId, onSelect }: ProjectPickerProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) =>
      `${p.project_name} ${p.managing_hq} ${p.managing_branch}`.toLowerCase().includes(q)
    )
  }, [projects, query])

  const selectedRing = accent === 'red' ? 'ring-red-500 bg-red-50' : 'ring-blue-500 bg-blue-50'
  const labelColor = accent === 'red' ? 'text-red-700' : 'text-blue-700'

  return (
    <div>
      <p className={`text-sm font-semibold mb-1.5 ${labelColor}`}>{label}</p>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="사업명·지사 검색"
          className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-sm text-gray-400 text-center">검색 결과가 없습니다.</p>
        )}
        {filtered.map((p) => {
          const isSelected = p.id === selectedId
          const isDisabled = p.id === disabledId
          return (
            <button
              key={p.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(p.id)}
              className={`w-full text-left px-3 py-2 transition-colors ${
                isSelected ? `ring-2 ring-inset ${selectedRing}` : 'hover:bg-gray-50'
              } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <p className="text-sm font-medium text-gray-900 truncate">{p.project_name}</p>
              <p className="text-xs text-gray-500 truncate">{p.managing_hq} • {p.managing_branch}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const MergeProjectsModal: React.FC<MergeProjectsModalProps> = ({ isOpen, projects, onClose, onMerged }) => {
  const [step, setStep] = useState<'select' | 'confirm'>('select')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [overlapCount, setOverlapCount] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 모달이 닫히면 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setStep('select')
      setSourceId(null)
      setTargetId(null)
      setOverlapCount(null)
      setChecking(false)
      setLoading(false)
      setError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const source = projects.find((p) => p.id === sourceId) || null
  const target = projects.find((p) => p.id === targetId) || null

  const handleClose = () => {
    if (loading) return
    onClose()
  }

  // 확인 단계로 진입하며 겹치는 작업일보 날짜 수 사전 조회
  const goToConfirm = async () => {
    if (!sourceId || !targetId) return
    setError('')
    setChecking(true)
    try {
      const [{ data: src }, { data: tgt }] = await Promise.all([
        supabase.from('work_daily_reports').select('report_date').eq('project_id', sourceId),
        supabase.from('work_daily_reports').select('report_date').eq('project_id', targetId),
      ])
      const tgtSet = new Set((tgt ?? []).map((r: { report_date: string }) => r.report_date))
      const overlap = (src ?? []).filter((r: { report_date: string }) => tgtSet.has(r.report_date)).length
      setOverlapCount(overlap)
    } catch (e) {
      console.error('겹치는 작업일보 조회 실패:', e)
      setOverlapCount(null) // 조회 실패해도 병합은 진행 가능 (RPC가 안전 처리)
    } finally {
      setChecking(false)
      setStep('confirm')
    }
  }

  const handleMerge = async () => {
    if (!sourceId || !targetId) return
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
        body: JSON.stringify({ sourceId, targetId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || '프로젝트 병합에 실패했습니다.')
      }
      const dropped = json.dropped as { dropped_work_daily_reports?: number; dropped_project_shares?: number } | null
      const droppedReports = dropped?.dropped_work_daily_reports ?? 0
      await onMerged()
      const extra = droppedReports > 0 ? `\n(겹치는 작업일보 ${droppedReports}건은 대상 것만 남기고 폐기됨)` : ''
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center">
            <GitMerge className="h-6 w-6 text-indigo-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">프로젝트 합치기</h3>
          </div>
          <button onClick={handleClose} disabled={loading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'select' && (
            <>
              <p className="text-sm text-gray-600">
                대상(삭제될 프로젝트)의 모든 등록 내용이 합산처(유지될 프로젝트)로 옮겨진 뒤, 대상 프로젝트는 삭제됩니다.
              </p>
              <ProjectPicker
                label="① 대상 — 삭제될 프로젝트 (내용이 빠져나감)"
                accent="red"
                projects={projects}
                selectedId={sourceId}
                disabledId={targetId}
                onSelect={setSourceId}
              />
              <ProjectPicker
                label="② 합산처 — 유지될 프로젝트 (내용을 받음)"
                accent="blue"
                projects={projects}
                selectedId={targetId}
                disabledId={sourceId}
                onSelect={setTargetId}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}

          {step === 'confirm' && source && target && (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-semibold">되돌릴 수 없는 작업입니다.</p>
                  <p className="mt-0.5">아래 내용을 확인하세요. 대상·합산처를 거꾸로 고르면 남기려던 프로젝트가 삭제됩니다.</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-md border border-red-200 p-3">
                  <Trash2 className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-700">삭제될 프로젝트</p>
                    <p className="text-sm font-medium text-gray-900">{source.project_name}</p>
                    <p className="text-xs text-gray-500">{source.managing_hq} • {source.managing_branch}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-md border border-blue-200 p-3">
                  <Save className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-700">유지될 프로젝트 (내용 누적)</p>
                    <p className="text-sm font-medium text-gray-900">{target.project_name}</p>
                    <p className="text-xs text-gray-500">{target.managing_hq} • {target.managing_branch}</p>
                  </div>
                </div>
              </div>

              {overlapCount !== null && overlapCount > 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                  겹치는 작업일보 {overlapCount}건은 합쳐지지 않고 합산처(유지될 프로젝트) 것만 남으며, 대상 것은 삭제됩니다.
                </p>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
          {step === 'select' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={goToConfirm}
                disabled={!sourceId || !targetId || checking}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {checking && <Loader2 className="h-4 w-4 animate-spin" />}
                다음
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button
                type="button"
                onClick={() => setStep('select')}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                뒤로
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? '합치는 중...' : '합산'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default MergeProjectsModal
