'use client'

// 감독(공사감독원)·시공사(현장소장 및 기타 확인자)가 프로젝트의 미서명 문서를 전체/부분 선택해 일괄 서명하는 모달
// 대상 서류 목록은 src/lib/bulk-sign/bulk-sign-targets.ts 단일 레지스트리를 따른다 — 새 서류는 그 파일에만 추가하면 된다.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, PenTool, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignaturePad from '@/components/ui/SignaturePad'
import { BULK_SIGN_SIGNERS, BulkSignSigner, BulkSignTarget, isJsonbUnsigned } from '@/lib/bulk-sign/bulk-sign-targets'

export type { BulkSignSigner }

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
  date: string
  label: string
}

interface UnsignedGroup {
  type: string
  title: string
  items: UnsignedItem[]
}

// 서명 주체별 UI 테마 (레지스트리는 데이터만, 색상은 UI 관심사라 여기서 관리)
const SIGNER_THEMES: Record<BulkSignSigner, { headerClass: string; accentClass: string; buttonClass: string }> = {
  supervisor: { headerClass: 'bg-purple-700', accentClass: 'accent-purple-600', buttonClass: 'bg-purple-600 hover:bg-purple-700' },
  contractor: { headerClass: 'bg-blue-700', accentClass: 'accent-blue-600', buttonClass: 'bg-blue-600 hover:bg-blue-700' },
}

// 조회 전용 서명 주체 — 목록만 보여주고 닫기 외 조작(선택·새로고침·서명)은 막는다
const VIEW_ONLY_SIGNERS: BulkSignSigner[] = ['supervisor']

// 레지스트리 항목 하나의 미서명 목록 조회 — TEXT 서명 base64 컬럼은 용량 문제로 select하지 않는다
const loadTargetItems = async (projectId: string, target: BulkSignTarget): Promise<UnsignedItem[]> => {
  let query = supabase.from(target.table).select(target.selectColumns)

  if (target.projectScope) {
    query = query.eq(`${target.projectScope.joinTable}.project_id`, projectId)
  } else {
    query = query.eq('project_id', projectId)
  }

  if (target.jsonb?.kind === 'keyedObject') {
    // JSON 경로 필터 — 해당 역할 슬롯이 있고 서명이 빈 행만
    const path = `${target.signColumn}->${target.jsonb.key}`
    query = query
      .not(path, 'is', null)
      .or(`${path}->>${target.jsonb.field}.is.null,${path}->>${target.jsonb.field}.eq.`)
  } else if (target.jsonb?.kind === 'roleArray') {
    // 배열 내부 조건은 서버 필터 불가 — 아래에서 클라이언트 필터 (프로젝트 단위라 소량)
  } else if (target.unsignedBoolColumn) {
    query = query.eq(target.unsignedBoolColumn, false)
  } else {
    query = query.or(`${target.signColumn}.is.null,${target.signColumn}.eq.`)
  }

  const { data, error } = await query.order(target.orderColumn, { ascending: false })
  if (error) throw error

  let rows = (data || []) as unknown as Array<Record<string, unknown>>
  if (target.jsonb?.kind === 'roleArray') {
    const spec = target.jsonb
    rows = rows.filter((row) => isJsonbUnsigned(row[target.signColumn], spec))
  }

  return rows.map((row) => {
    const { date, label } = target.toItem(row)
    return { type: target.type, id: String(row.id), date, label }
  })
}

const itemKey = (item: UnsignedItem) => `${item.type}:${item.id}`

export default function BulkSignModal({ isOpen, onClose, projectId, projectName, signer }: BulkSignModalProps) {
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<UnsignedGroup[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [signing, setSigning] = useState(false)
  const [viewOnlyNotice, setViewOnlyNotice] = useState(false)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const config = BULK_SIGN_SIGNERS[signer]
  const theme = SIGNER_THEMES[signer]
  const viewOnly = VIEW_ONLY_SIGNERS.includes(signer)

  // 조회 전용일 때 조작을 막고 가운데 안내 메시지를 잠시 표시
  const blockIfViewOnly = () => {
    if (!viewOnly) return false
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setViewOnlyNotice(true)
    noticeTimerRef.current = setTimeout(() => setViewOnlyNotice(false), 1800)
    return true
  }

  const loadUnsigned = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const results = await Promise.all(
        BULK_SIGN_SIGNERS[signer].targets.map(async (target) => {
          try {
            return { type: target.type, title: target.title, items: await loadTargetItems(projectId, target) }
          } catch (e) {
            // 일부 테이블 조회 실패(미적용 마이그레이션 등)해도 나머지 그룹은 표시
            console.error(`미서명 조회 실패 (${target.type}):`, e)
            return { type: target.type, title: target.title, items: [] }
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
    if (blockIfViewOnly()) return
    const key = itemKey(item)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    if (blockIfViewOnly()) return
    setSelected(allSelected ? new Set() : new Set(allItems.map(itemKey)))
  }

  const toggleGroup = (group: UnsignedGroup) => {
    if (blockIfViewOnly()) return
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
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 조회 전용 안내 메시지 */}
        {viewOnlyNotice && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-gray-900/80 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
              현재는 조회만 가능합니다
            </div>
          </div>
        )}
        {/* 헤더 */}
        <div className={`${theme.headerClass} text-white px-4 py-3 rounded-t-lg flex items-center justify-between`}>
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
                        className={`h-4 w-4 ${theme.accentClass}`}
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
                            className={`h-4 w-4 shrink-0 ${theme.accentClass}`}
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
                className={`h-4 w-4 ${theme.accentClass}`}
              />
              전체선택
            </label>
            <button
              onClick={() => { if (blockIfViewOnly()) return; loadUnsigned() }}
              disabled={loading}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              title="목록 새로고침"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
          </div>
          <button
            onClick={() => { if (blockIfViewOnly()) return; setShowSignaturePad(true) }}
            disabled={viewOnly || selectedCount === 0}
            className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${theme.buttonClass}`}
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
