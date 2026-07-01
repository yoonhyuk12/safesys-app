'use client'

// 감독(공사감독원)·현장소장(시공사)이 프로젝트의 미서명 문서를 전체/부분 선택해 일괄 서명하는 모달

import React, { useState, useEffect, useCallback } from 'react'
import { X, PenTool, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignaturePad from '@/components/ui/SignaturePad'

export type BulkSignSigner = 'supervisor' | 'site_manager'

interface BulkSignModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName?: string
  signer: BulkSignSigner
}

// 미서명 항목 1건 — key = `${type}:${id}`
interface UnsignedItem {
  type: string
  id: string
  date: string // 표시용 날짜 (없으면 '')
  label: string // 표시용 설명
}

interface UnsignedGroup {
  type: string
  title: string
  items: UnsignedItem[]
}

interface GroupDef {
  type: string
  title: string
  load: (projectId: string) => Promise<UnsignedItem[]>
}

// 공용 로더 — 서명 base64 컬럼은 용량 문제로 select하지 않는다
const loadUnsignedRows = async (
  projectId: string,
  table: string,
  selectCols: string,
  unsignedFilter: { boolColumn: string } | { signColumn: string },
  orderColumn: string
): Promise<Array<Record<string, unknown>>> => {
  let query = supabase
    .from(table)
    .select(selectCols)
    .eq('project_id', projectId)

  if ('boolColumn' in unsignedFilter) {
    query = query.eq(unsignedFilter.boolColumn, false)
  } else {
    query = query.or(`${unsignedFilter.signColumn}.is.null,${unsignedFilter.signColumn}.eq.`)
  }

  const { data, error } = await query.order(orderColumn, { ascending: false })
  if (error) throw error
  return (data || []) as unknown as Array<Record<string, unknown>>
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// 감독(공사감독원) 서명 대상 5종
const SUPERVISOR_GROUPS: GroupDef[] = [
  {
    type: 'manager_inspection',
    title: '관리자 일상점검',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'manager_inspections', 'id, inspection_date, inspector_name', { boolColumn: 'has_signature' }, 'inspection_date')
      return rows.map((r) => ({
        type: 'manager_inspection',
        id: str(r.id),
        date: str(r.inspection_date),
        label: r.inspector_name ? `점검자 ${str(r.inspector_name)}` : '',
      }))
    },
  },
  {
    type: 'tbm_safety_inspection',
    title: 'TBM 안전활동 점검표',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'tbm_safety_inspections', 'id, tbm_date, work_content', { signColumn: 'signature' }, 'tbm_date')
      return rows.map((r) => ({
        type: 'tbm_safety_inspection',
        id: str(r.id),
        date: str(r.tbm_date),
        label: str(r.work_content),
      }))
    },
  },
  {
    type: 'inspection_request',
    title: '검사/검측 요청서 (공사감독원 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'inspection_requests', 'id, request_no, request_date, location_and_type', { signColumn: 'supervisor_signature' }, 'request_date')
      return rows.map((r) => ({
        type: 'inspection_request',
        id: str(r.id),
        date: str(r.request_date),
        label: [str(r.request_no), str(r.location_and_type)].filter(Boolean).join(' · '),
      }))
    },
  },
  {
    type: 'quality_test_record',
    title: '품질검사 실시대장 (건설사업관리기술인 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'quality_test_records', 'id, test_date, test_item, target_material', { signColumn: 'supervision_engineer_signature' }, 'test_date')
      return rows.map((r) => ({
        type: 'quality_test_record',
        id: str(r.id),
        date: str(r.test_date),
        label: [str(r.target_material), str(r.test_item)].filter(Boolean).join(' · '),
      }))
    },
  },
  {
    type: 'quality_summary_report',
    title: '품질검사 성과총괄표 (확인자 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'quality_summary_reports', 'id, report_date', { signColumn: 'confirmer_signature' }, 'report_date')
      return rows.map((r) => ({
        type: 'quality_summary_report',
        id: str(r.id),
        date: str(r.report_date),
        label: '성과총괄표',
      }))
    },
  },
]

// 현장소장(시공사) 서명 대상 5종
const SITE_MANAGER_GROUPS: GroupDef[] = [
  {
    type: 'inspection_request_field_agent',
    title: '검사/검측 요청서 (현장대리인 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'inspection_requests', 'id, request_no, request_date, location_and_type', { signColumn: 'field_agent_signature' }, 'request_date')
      return rows.map((r) => ({
        type: 'inspection_request_field_agent',
        id: str(r.id),
        date: str(r.request_date),
        label: [str(r.request_no), str(r.location_and_type)].filter(Boolean).join(' · '),
      }))
    },
  },
  {
    type: 'new_worker_orientation',
    title: '신규근로자 둘러보기 일지 (확인자 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'new_worker_orientations', 'id, orientation_date, workers', { signColumn: 'manager_signature' }, 'orientation_date')
      return rows.map((r) => ({
        type: 'new_worker_orientation',
        id: str(r.id),
        date: str(r.orientation_date),
        label: Array.isArray(r.workers) && r.workers.length > 0 ? `신규근로자 ${r.workers.length}명` : '',
      }))
    },
  },
  {
    type: 'quality_test_record_engineer',
    title: '품질검사 실시대장 (품질관리기술인 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'quality_test_records', 'id, test_date, test_item, target_material', { signColumn: 'quality_engineer_signature' }, 'test_date')
      return rows.map((r) => ({
        type: 'quality_test_record_engineer',
        id: str(r.id),
        date: str(r.test_date),
        label: [str(r.target_material), str(r.test_item)].filter(Boolean).join(' · '),
      }))
    },
  },
  {
    type: 'quality_verification_request',
    title: '확인시험 의뢰서 (보냄 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'quality_verification_requests', 'id, request_no, request_date, test_items', { signColumn: 'sender_signature' }, 'request_date')
      return rows.map((r) => ({
        type: 'quality_verification_request',
        id: str(r.id),
        date: str(r.request_date),
        label: [str(r.request_no), str(r.test_items)].filter(Boolean).join(' · '),
      }))
    },
  },
  {
    type: 'quality_summary_report_writer',
    title: '품질검사 성과총괄표 (작성자 서명)',
    load: async (projectId) => {
      const rows = await loadUnsignedRows(projectId, 'quality_summary_reports', 'id, report_date', { signColumn: 'writer_signature' }, 'report_date')
      return rows.map((r) => ({
        type: 'quality_summary_report_writer',
        id: str(r.id),
        date: str(r.report_date),
        label: '성과총괄표',
      }))
    },
  },
]

const SIGNER_CONFIG: Record<BulkSignSigner, { title: string; note: string; groups: GroupDef[]; headerClass: string; accentClass: string }> = {
  supervisor: {
    title: '감독 일괄서명',
    note: '※ 정기안전점검·PTW 작업허가서·폭염점검 서명은 서명자 지정·허가 행위가 필요해 각 문서에서 개별 서명해야 합니다.',
    groups: SUPERVISOR_GROUPS,
    headerClass: 'bg-purple-700',
    accentClass: 'accent-purple-600',
  },
  site_manager: {
    title: '현장소장 일괄서명',
    note: '※ PTW 작업허가서·정기안전점검·작업자 서명은 서명자 지정이 필요해 각 문서에서 개별 서명해야 합니다.',
    groups: SITE_MANAGER_GROUPS,
    headerClass: 'bg-blue-700',
    accentClass: 'accent-blue-600',
  },
}

const itemKey = (item: UnsignedItem) => `${item.type}:${item.id}`

export default function BulkSignModal({ isOpen, onClose, projectId, projectName, signer }: BulkSignModalProps) {
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<UnsignedGroup[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [signing, setSigning] = useState(false)

  const config = SIGNER_CONFIG[signer]

  const loadUnsigned = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const results = await Promise.all(
        SIGNER_CONFIG[signer].groups.map(async (def) => {
          try {
            return { type: def.type, title: def.title, items: await def.load(projectId) }
          } catch (e) {
            // 일부 테이블 조회 실패(미적용 마이그레이션 등)해도 나머지 그룹은 표시
            console.error(`미서명 조회 실패 (${def.type}):`, e)
            return { type: def.type, title: def.title, items: [] }
          }
        })
      )
      setGroups(results)
    } finally {
      setLoading(false)
    }
  }, [projectId, signer])

  useEffect(() => {
    if (isOpen && projectId) loadUnsigned()
  }, [isOpen, projectId, loadUnsigned])

  if (!isOpen) return null

  const allItems = groups.flatMap((g) => g.items)
  const totalCount = allItems.length
  const selectedCount = selected.size
  const allSelected = totalCount > 0 && selectedCount === totalCount

  const toggleItem = (item: UnsignedItem) => {
    const key = itemKey(item)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allItems.map(itemKey)))
  }

  const toggleGroup = (group: UnsignedGroup) => {
    const keys = group.items.map(itemKey)
    const groupAllSelected = keys.length > 0 && keys.every((k) => selected.has(k))
    setSelected((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => (groupAllSelected ? next.delete(k) : next.add(k)))
      return next
    })
  }

  // 서명 완료 → API 호출
  const handleSign = async (signatureData: string) => {
    setSigning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('로그인이 필요합니다.')
      }

      const items: Record<string, string[]> = {}
      allItems.forEach((item) => {
        if (!selected.has(itemKey(item))) return
        if (!items[item.type]) items[item.type] = []
        items[item.type].push(item.id)
      })

      const res = await fetch('/api/bulk-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ project_id: projectId, signature_data: signatureData, signer, items }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || '일괄 서명에 실패했습니다.')
      }

      alert(json.message || `${json.updated_total}건 서명이 완료되었습니다.`)
      setShowSignaturePad(false)
      loadUnsigned()
    } catch (err) {
      console.error('일괄 서명 오류:', err)
      alert(err instanceof Error ? err.message : '일괄 서명 중 오류가 발생했습니다.')
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className={`${config.headerClass} text-white px-4 py-3 rounded-t-lg flex items-center justify-between`}>
          <div className="flex items-center gap-2 min-w-0">
            <PenTool className="h-5 w-5 shrink-0" />
            <h2 className="font-semibold text-sm sm:text-base truncate">
              {config.title}{projectName ? ` — ${projectName}` : ''}
            </h2>
          </div>
          <button onClick={onClose} className="text-white hover:opacity-70 shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-700 font-medium mb-1">서명할 문서가 없습니다.</p>
              <p className="text-sm text-gray-400">이 프로젝트의 서명 대상 문서가 모두 서명 완료 상태입니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.filter((g) => g.items.length > 0).map((group) => {
                const keys = group.items.map(itemKey)
                const groupAllSelected = keys.every((k) => selected.has(k))
                return (
                  <div key={group.type} className="border border-gray-200 rounded-lg overflow-hidden">
                    <label className="flex items-center gap-2 bg-gray-50 px-3 py-2 border-b border-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupAllSelected}
                        onChange={() => toggleGroup(group)}
                        className={`h-4 w-4 ${config.accentClass}`}
                      />
                      <span className="text-sm font-semibold text-gray-800">{group.title}</span>
                      <span className="text-xs text-red-600 font-medium">미서명 {group.items.length}건</span>
                    </label>
                    <div className="divide-y divide-gray-100">
                      {group.items.map((item) => (
                        <label
                          key={itemKey(item)}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(itemKey(item))}
                            onChange={() => toggleItem(item)}
                            className={`h-4 w-4 shrink-0 ${config.accentClass}`}
                          />
                          <span className="text-sm text-gray-700 whitespace-nowrap shrink-0">{item.date}</span>
                          <span className="text-sm text-gray-500 truncate">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-gray-400">{config.note}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={totalCount === 0}
                className={`h-4 w-4 ${config.accentClass}`}
              />
              전체선택
            </label>
            <button
              onClick={loadUnsigned}
              disabled={loading}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              title="목록 새로고침"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
          </div>
          <button
            onClick={() => setShowSignaturePad(true)}
            disabled={selectedCount === 0}
            className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${signer === 'supervisor' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            <PenTool className="h-4 w-4" />
            서명하기 ({selectedCount}건)
          </button>
        </div>
      </div>

      {/* 서명 입력 */}
      {showSignaturePad && (
        <div onClick={(e) => e.stopPropagation()}>
          <SignaturePad
            onSave={handleSign}
            onCancel={() => setShowSignaturePad(false)}
            selectedCount={selectedCount}
            isSaving={signing}
          />
        </div>
      )}
    </div>
  )
}
