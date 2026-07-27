'use client'

// 최근 TBM 일지에서 작업내용·투입 인원·사용 장비를 가져오는 선택 패널 (레거시 project_id NULL 행 포함 조회)

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardList, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface TbmSubmissionRow {
  id: string
  meeting_date: string | null
  education_date: string | null
  today_work: string | null
  personnel_count: string | null
  personnel_total_count: number | null
  equipment_input: string | null
  address: string | null
  detail_address: string | null
}

export interface TbmImportValues {
  workDescription: string
  personnel: string
  equipment: string
  workLocation: string
}

interface TbmImportPanelProps {
  projectId: string
  projectName: string
  managingHq: string | null
  managingBranch: string | null
  disabled: boolean
  onImport: (values: TbmImportValues) => void
}

const TBM_SELECT = 'id, meeting_date, education_date, today_work, personnel_count, personnel_total_count, equipment_input, address, detail_address'
const LIMIT = 10

/** 줄 앞 목록 기호를 떼고 한 줄로 잇는다. TBM 입력은 여러 줄로 적힌 경우가 많다. */
function joinLines(value: string | null): string {
  return (value || '')
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .join(', ')
}

/** 인원 합성 — 합계와 직종별 내역이 모두 있으면 "총 8명(관리자 2명, 작업자 6명)" 형태로 만든다. */
function buildPersonnelText(personnelCount: string | null, totalCount: number | null): string {
  const breakdown = joinLines(personnelCount)
  if (totalCount && totalCount > 0) return breakdown ? `총 ${totalCount}명(${breakdown})` : `총 ${totalCount}명`
  return breakdown
}

/** 작업위치 — 주소와 상세주소를 한 줄로 잇는다. */
function buildWorkLocationText(address: string | null, detailAddress: string | null): string {
  return [address, detailAddress].map((part) => (part || '').trim()).filter(Boolean).join(' ')
}

/** 장비 입력에 "0"만 적힌 행이 있어 의미 없는 값은 비운다. */
function buildEquipmentText(equipmentInput: string | null): string {
  const text = joinLines(equipmentInput)
  return text === '0' ? '' : text
}

const rowDate = (row: TbmSubmissionRow) => row.meeting_date || row.education_date || ''

const formatDate = (value: string) => value ? value.slice(0, 10).replace(/-/g, '.') : '날짜 미상'

const preview = (value: string | null, length = 40) => {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  return text.length > length ? `${text.slice(0, length)}…` : text
}

export default function TbmImportPanel({
  projectId,
  projectName,
  managingHq,
  managingBranch,
  disabled,
  onImport,
}: TbmImportPanelProps) {
  const [rows, setRows] = useState<TbmSubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 레거시 TBM은 project_id가 비어 있고 프로젝트명으로만 연결되므로 두 갈래로 조회해 합친다.
      const baseSelect = () => supabase
        .from('tbm_submissions')
        .select(TBM_SELECT)
        .eq('status', 'submitted')
        .not('today_work', 'is', null)
        .neq('today_work', '작업없음')
        .order('meeting_date', { ascending: false })
        .limit(LIMIT)

      let legacyQuery = baseSelect().is('project_id', null).eq('project_name', projectName)
      // 같은 이름의 다른 지사 사업이 섞이지 않도록 관할이 있으면 함께 건다.
      if (managingHq) legacyQuery = legacyQuery.eq('headquarters', managingHq)
      if (managingBranch) legacyQuery = legacyQuery.eq('branch', managingBranch)

      const [linked, legacy] = await Promise.all([
        baseSelect().eq('project_id', projectId),
        legacyQuery,
      ])

      if (linked.error) throw new Error(linked.error.message)
      if (legacy.error) throw new Error(legacy.error.message)

      const merged = new Map<string, TbmSubmissionRow>()
      for (const row of [...(linked.data || []), ...(legacy.data || [])] as unknown as TbmSubmissionRow[]) {
        merged.set(row.id, row)
      }
      setRows([...merged.values()]
        .sort((a, b) => rowDate(b).localeCompare(rowDate(a)))
        .slice(0, LIMIT))
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'TBM 일지를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId, projectName, managingHq, managingBranch])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const handleSelect = (row: TbmSubmissionRow) => {
    onImport({
      workDescription: (row.today_work || '').trim(),
      personnel: buildPersonnelText(row.personnel_count, row.personnel_total_count),
      equipment: buildEquipmentText(row.equipment_input),
      workLocation: buildWorkLocationText(row.address, row.detail_address),
    })
    setOpen(false)
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />TBM 일지 확인 중
      </span>
    )
  }

  if (error) {
    return (
      <button type="button" onClick={loadRows} className="text-xs font-semibold text-red-600 underline">
        TBM 조회 실패 — 다시 시도
      </button>
    )
  }

  if (rows.length === 0) {
    return <span className="text-xs text-gray-400">가져올 TBM이 없습니다.</span>
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ClipboardList className="h-3.5 w-3.5" />TBM에서 가져오기
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <>
        {/* 목록 밖을 눌러도 닫히도록 투명 배경을 깐다 */}
        <button type="button" aria-label="TBM 목록 닫기" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
        <div className="absolute right-0 z-20 mt-1 w-[min(28rem,calc(100vw-3rem))] rounded-lg border border-gray-200 bg-white shadow-lg">
          <p className="border-b border-gray-100 px-3 py-2 text-xs text-amber-700">
            선택하면 작업내용·투입 인원·사용 장비에 이미 입력한 값을 덮어씁니다.
          </p>
          <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
            {rows.map((row) => {
              const personnel = buildPersonnelText(row.personnel_count, row.personnel_total_count)
              const equipment = buildEquipmentText(row.equipment_input)
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(row)}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="shrink-0 text-xs font-semibold text-gray-500">{formatDate(rowDate(row))}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{preview(row.today_work) || '(작업내용 없음)'}</span>
                    </span>
                    {(personnel || equipment) && (
                      <span className="mt-0.5 block truncate text-xs text-gray-500">
                        {[personnel && `인원 ${preview(personnel, 24)}`, equipment && `장비 ${preview(equipment, 24)}`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        </>
      )}
    </div>
  )
}
