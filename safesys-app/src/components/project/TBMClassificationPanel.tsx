'use client'

// TBM 전체 일보 생성 패널 (2단계)
// 1) [TBM 전체 일보 생성(AI)] → 모든 대상 날짜의 장비/인력을 AI 분류하고 누적 합계 목록 표시
// 2) 사용자가 드래그로 같은 의미의 항목을 병합한 뒤 [생성 등록] → 일보 일괄 저장 + 누계 재계산

import React, { useState } from 'react'
import { CalendarPlus, GripVertical, RotateCcw, Save, Users, Wrench, X } from 'lucide-react'
import {
  classifyTbmForGeneration,
  saveGeneratedReports,
  ClassifyResult,
  GeneratedDay,
  GeneratedItem,
  GenerateProgress,
} from '@/lib/work-daily-report/generate-from-tbm'

interface TBMClassificationPanelProps {
  projectId: string
  projectName: string
  managingHq?: string
  managingBranch?: string
  userId: string
  ownerName?: string
  latitude?: number | null
  longitude?: number | null
  onRecalculated?: () => void  // 생성 등록 완료 후 화면 갱신용
}

type Phase = 'idle' | 'classifying' | 'review' | 'saving'
type MergeMap = Record<string, string>

interface Group {
  name: string
  total: number
  specs: string[]
  merged: string[]  // 이 항목으로 병합된 원래 명칭들
}

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : '알 수 없는 오류'

// 병합 체인 추적 (A→B, B→C 면 A는 C로)
const resolve = (map: MergeMap, name: string): string => {
  let current = name
  const seen = new Set<string>()
  while (map[current] && !seen.has(current)) {
    seen.add(current)
    current = map[current]
  }
  return current
}

const toNum = (v: string): number => {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

const fmtNum = (n: number): string => String(Math.round(n * 1000) / 1000)

// 날짜별 항목에 병합 맵 적용 (같은 날짜 내 동일 명칭은 수량 합산)
const applyMergeToDays = (days: GeneratedDay[], equipMap: MergeMap, personMap: MergeMap): GeneratedDay[] =>
  days.map(day => ({
    ...day,
    equipment: combineItems(day.equipment.map(it => ({ ...it, name: resolve(equipMap, it.name) }))),
    personnel: combineItems(day.personnel.map(it => ({ ...it, name: resolve(personMap, it.name) }))),
  }))

const combineItems = (items: GeneratedItem[]): GeneratedItem[] => {
  const map = new Map<string, GeneratedItem>()
  for (const it of items) {
    const existing = map.get(it.name)
    if (!existing) {
      map.set(it.name, { ...it })
      continue
    }
    const sum = toNum(existing.count) + toNum(it.count)
    map.set(it.name, {
      name: it.name,
      spec: existing.spec || it.spec,
      count: sum > 0 ? fmtNum(sum) : (existing.count || it.count),
    })
  }
  return Array.from(map.values())
}

// 표시용 그룹(누적 합계) 계산 — 기본 정렬: 누적 많은 순
const buildGroups = (days: GeneratedDay[], key: 'equipment' | 'personnel', map: MergeMap): Group[] => {
  const groups = new Map<string, Group>()
  for (const day of days) {
    for (const it of day[key]) {
      const resolved = resolve(map, it.name)
      let g = groups.get(resolved)
      if (!g) {
        g = { name: resolved, total: 0, specs: [], merged: [] }
        groups.set(resolved, g)
      }
      g.total += toNum(it.count)
      if (it.spec && !g.specs.includes(it.spec)) g.specs.push(it.spec)
      if (it.name !== resolved && !g.merged.includes(it.name)) g.merged.push(it.name)
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.total - a.total)
}

// 사용자 지정 순서 적용 (순서 목록에 없는 항목은 뒤로)
const orderGroups = (groups: Group[], order: string[]): Group[] => {
  const idx = new Map(order.map((n, i) => [n, i]))
  return [...groups].sort((a, b) => (idx.get(a.name) ?? 9999) - (idx.get(b.name) ?? 9999))
}

const sortItemsByOrder = (items: GeneratedItem[], order: string[]): GeneratedItem[] => {
  const idx = new Map(order.map((n, i) => [n, i]))
  return [...items].sort((a, b) => (idx.get(a.name) ?? 9999) - (idx.get(b.name) ?? 9999))
}

// 순서 이동: source를 target 앞/뒤로
const moveInOrder = (order: string[], source: string, target: string, after: boolean): string[] => {
  if (source === target) return order
  const without = order.filter(n => n !== source)
  const targetIndex = without.indexOf(target)
  if (targetIndex < 0) return order
  const insertAt = after ? targetIndex + 1 : targetIndex
  return [...without.slice(0, insertAt), source, ...without.slice(insertAt)]
}

// 드롭 위치 판정: 상단 25% = 앞으로, 하단 25% = 뒤로, 가운데 = 병합
type DropZone = 'before' | 'after' | 'merge'
const zoneFromEvent = (e: React.DragEvent): DropZone => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (e.clientY - rect.top) / rect.height
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'merge'
}

export default function TBMClassificationPanel({
  projectId,
  projectName,
  managingHq,
  managingBranch,
  userId,
  ownerName,
  latitude,
  longitude,
  onRecalculated,
}: TBMClassificationPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<GenerateProgress | null>(null)
  const [result, setResult] = useState<ClassifyResult | null>(null)
  const [equipMap, setEquipMap] = useState<MergeMap>({})
  const [personMap, setPersonMap] = useState<MergeMap>({})
  const [equipOrder, setEquipOrder] = useState<string[]>([])
  const [personOrder, setPersonOrder] = useState<string[]>([])
  const [dropHint, setDropHint] = useState<{ kind: 'equip' | 'person'; name: string; zone: DropZone } | null>(null)

  const resetReview = () => {
    setPhase('idle')
    setResult(null)
    setEquipMap({})
    setPersonMap({})
    setEquipOrder([])
    setPersonOrder([])
    setDropHint(null)
    setProgress(null)
  }

  // 1단계: AI 분류
  const handleClassify = async () => {
    try {
      setPhase('classifying')
      setProgress(null)
      const classified = await classifyTbmForGeneration({
        projectId, projectName, managingHq, managingBranch, latitude, longitude,
        onProgress: setProgress,
      })

      if (classified.days.length === 0) {
        alert(classified.skippedExisting > 0
          ? `TBM이 입력된 모든 날짜(${classified.skippedExisting}일)에 이미 작업일보가 있습니다.`
          : '이 프로젝트의 TBM 제출 기록이 없습니다.')
        resetReview()
        return
      }

      setResult(classified)
      setEquipMap({})
      setPersonMap({})
      setEquipOrder(buildGroups(classified.days, 'equipment', {}).map(g => g.name))
      setPersonOrder(buildGroups(classified.days, 'personnel', {}).map(g => g.name))
      setPhase('review')
    } catch (err: unknown) {
      console.error('TBM 분류 오류:', err)
      alert(`분류 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
      resetReview()
    } finally {
      setProgress(null)
    }
  }

  // 2단계: 생성 등록
  const handleSaveAll = async () => {
    if (!result) return
    if (!confirm(`${result.days.length}일의 작업일보를 생성 등록합니다.\n저장 후 전체 누계가 자동 재계산됩니다. 진행할까요?`)) return

    try {
      setPhase('saving')
      setProgress(null)
      // 병합 적용 + 검토 화면의 순서를 일보 행 순서에 반영
      const mergedDays = applyMergeToDays(result.days, equipMap, personMap).map(day => ({
        ...day,
        equipment: sortItemsByOrder(day.equipment, equipOrder),
        personnel: sortItemsByOrder(day.personnel, personOrder),
      }))
      const saved = await saveGeneratedReports({
        projectId, userId, ownerName,
        days: mergedDays,
        onProgress: setProgress,
      })

      const failMsg = saved.failedDates.length > 0
        ? `\n실패 ${saved.failedDates.length}건: ${saved.failedDates.join(', ')}`
        : ''
      alert(`일보 생성 등록 완료: ${saved.created}건${failMsg}`)
      resetReview()
      onRecalculated?.()
    } catch (err: unknown) {
      console.error('일보 생성 등록 오류:', err)
      alert(`생성 등록 중 오류가 발생했습니다: ${getErrorMessage(err)}`)
      setPhase('review')
    } finally {
      setProgress(null)
    }
  }

  // 드래그: 가운데에 놓으면 병합, 위/아래 가장자리에 놓으면 순서 이동
  const handleDragStart = (e: React.DragEvent, kind: 'equip' | 'person', name: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind, name }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, kind: 'equip' | 'person', name: string) => {
    e.preventDefault()
    const zone = zoneFromEvent(e)
    if (!dropHint || dropHint.kind !== kind || dropHint.name !== name || dropHint.zone !== zone) {
      setDropHint({ kind, name, zone })
    }
  }

  const handleDrop = (e: React.DragEvent, kind: 'equip' | 'person', targetName: string) => {
    e.preventDefault()
    setDropHint(null)
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (payload.kind !== kind) return
      const source = String(payload.name || '')
      if (!source || source === targetName) return

      const zone = zoneFromEvent(e)
      if (zone === 'merge') {
        const currentMap = kind === 'equip' ? equipMap : personMap
        if (resolve(currentMap, targetName) === source) return // 순환 방지
        if (kind === 'equip') {
          setEquipMap(prev => ({ ...prev, [source]: targetName }))
          setEquipOrder(prev => prev.filter(n => n !== source))
        } else {
          setPersonMap(prev => ({ ...prev, [source]: targetName }))
          setPersonOrder(prev => prev.filter(n => n !== source))
        }
      } else {
        // 순서 이동
        const after = zone === 'after'
        if (kind === 'equip') setEquipOrder(prev => moveInOrder(prev, source, targetName, after))
        else setPersonOrder(prev => moveInOrder(prev, source, targetName, after))
      }
    } catch {
      // 드롭 데이터 형식 오류 무시
    }
  }

  // 병합 초기화 — 병합 해제 + 순서도 기본(누적 많은 순)으로 복원
  const handleResetMerge = () => {
    setEquipMap({})
    setPersonMap({})
    if (result) {
      setEquipOrder(buildGroups(result.days, 'equipment', {}).map(g => g.name))
      setPersonOrder(buildGroups(result.days, 'personnel', {}).map(g => g.name))
    }
  }

  const equipGroups = result ? orderGroups(buildGroups(result.days, 'equipment', equipMap), equipOrder) : []
  const personGroups = result ? orderGroups(buildGroups(result.days, 'personnel', personMap), personOrder) : []
  const hasMerges = Object.keys(equipMap).length > 0 || Object.keys(personMap).length > 0

  const renderGroupRow = (kind: 'equip' | 'person', g: Group, unit: string) => {
    const isHint = dropHint?.kind === kind && dropHint?.name === g.name
    const hintCls = isHint
      ? dropHint!.zone === 'merge'
        ? 'ring-2 ring-purple-500 border-purple-400'
        : dropHint!.zone === 'before'
          ? 'border-t-4 border-t-blue-600'
          : 'border-b-4 border-b-blue-600'
      : ''
    return (
    <div
      key={g.name}
      draggable
      onDragStart={e => handleDragStart(e, kind, g.name)}
      onDragOver={e => handleDragOver(e, kind, g.name)}
      onDragLeave={() => setDropHint(prev => (prev?.kind === kind && prev?.name === g.name ? null : prev))}
      onDrop={e => handleDrop(e, kind, g.name)}
      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border cursor-move transition-colors ${
        kind === 'equip'
          ? 'bg-blue-50 border-blue-200 hover:border-blue-400'
          : 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
      } ${hintCls}`}
      title="가운데에 놓으면 병합, 위/아래 가장자리에 놓으면 순서 이동"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <span className="text-xs font-medium text-gray-900">{g.name}</span>
          {g.specs.length > 0 && (
            <span className="ml-1 text-[10px] text-gray-500">({g.specs.slice(0, 2).join(', ')}{g.specs.length > 2 ? ' 외' : ''})</span>
          )}
          {g.merged.length > 0 && (
            <div className="text-[10px] text-purple-600 truncate">← {g.merged.join(', ')} 병합됨</div>
          )}
        </div>
      </div>
      <span className={`shrink-0 text-xs font-bold ${kind === 'equip' ? 'text-blue-700' : 'text-emerald-700'}`}>
        누적 {fmtNum(g.total)}{unit}
      </span>
    </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">② TBM 전체 일보 생성</h3>
          <p className="text-xs text-gray-500">
            TBM이 입력된 모든 날짜의 장비·인력을 AI로 구분한 뒤, 확인을 거쳐 일보를 한번에 생성합니다.
          </p>
        </div>
        {phase === 'idle' && (
          <button
            onClick={handleClassify}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            title="TBM이 입력된 모든 날짜의 장비/인력을 AI로 분류하여 보여줍니다 (기존 일보는 유지)"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            TBM 전체 일보 생성(AI)
          </button>
        )}
      </div>

      {/* 진행 상황 (분류/저장) */}
      {(phase === 'classifying' || phase === 'saving') && (
        <div className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span>
              {progress
                ? `${progress.date} ${phase === 'classifying' ? 'AI 분류' : '저장'} 중...`
                : phase === 'classifying' ? 'TBM 데이터 조회 중...' : '저장 준비 중...'}
            </span>
            {progress && <span className="font-semibold">{progress.current}/{progress.total}</span>}
          </div>
          <div className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-200"
              style={{ width: progress ? `${Math.round((progress.current / progress.total) * 100)}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* 분류 검토 (드래그 병합) */}
      {phase === 'review' && result && (
        <div className="mt-3 space-y-3">
          <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            대상 <span className="font-bold">{result.days.length}일</span>
            {result.skippedExisting > 0 && <> · 기존 일보 유지 {result.skippedExisting}일</>}
            {result.failedDates.length > 0 && <> · <span className="text-red-600">분류 실패 {result.failedDates.length}일 제외</span></>}
            <br />드래그하여 <span className="font-semibold">가운데에 놓으면 병합</span>, <span className="font-semibold">위/아래 가장자리에 놓으면 순서 변경</span>됩니다. 이 순서대로 일보에 기록됩니다. 확인 후 아래 [생성 등록]을 누르세요.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <Wrench className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-gray-700">장비 ({equipGroups.length}종)</span>
              </div>
              <div className="space-y-1.5">
                {equipGroups.length > 0
                  ? equipGroups.map(g => renderGroupRow('equip', g, '대'))
                  : <p className="text-xs text-gray-400">분류된 장비가 없습니다.</p>}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <Users className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-semibold text-gray-700">인력 ({personGroups.length}종)</span>
              </div>
              <div className="space-y-1.5">
                {personGroups.length > 0
                  ? personGroups.map(g => renderGroupRow('person', g, '명'))
                  : <p className="text-xs text-gray-400">분류된 인력이 없습니다.</p>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasMerges && (
              <button
                onClick={handleResetMerge}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                병합 초기화
              </button>
            )}
            <button
              onClick={resetReview}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              취소
            </button>
            <button
              onClick={handleSaveAll}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              생성 등록 ({result.days.length}일)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
