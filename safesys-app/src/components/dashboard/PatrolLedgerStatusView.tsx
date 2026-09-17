// 공사감독 순회점검의 주간 테마와 본부·지사·현장별 실적을 표시한다.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { BRANCH_OPTIONS } from '@/lib/constants'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'
import { supabase, type UserProfile } from '@/lib/supabase'
import { seoulToday } from '@/lib/patrol-inspection-utils'
import { canEditPatrolLedgerTheme, getPatrolLedgerWeeklyTheme, patrolLedgerWeekStart, savePatrolLedgerWeeklyTheme } from '@/lib/patrol-ledger/themes'
import { PATROL_LEDGER_TABLE, PATROL_LEDGER_THEME_MAX } from '@/lib/patrol-ledger/types'
import {
  aggregatePatrolStatus, groupPatrolStatus, patrolStatusQuarter, patrolStatusRemark,
  patrolStatusWeekRange, sumPatrolStatus,
  type PatrolStatusInspection, type PatrolStatusRow, type PatrolStatusTotals,
} from '@/lib/patrol-ledger/status-aggregate'

interface Props {
  initialHq: string | null
  initialBranch: string | null
  onBack: () => void
}
type Level = 'hq' | 'branch' | 'project'
const ORG_ORDER = { hqs: Object.keys(BRANCH_OPTIONS), branches: BRANCH_OPTIONS }
const BUTTON = 'min-h-[44px] px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
const TH = 'px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider'
const TD = 'px-3 py-3 text-sm text-center'
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
/** 표의 건수 칸. 0건은 숫자 대신 '-'로 보여 비어 있음을 한눈에 알게 한다. */
const count = (value: number) => (value === 0 ? '-' : value)

/** 본부·지사 표의 숫자 열 — 등록 프로젝트 수 / 분기 점검 대상 / TBM 금주 / 순회점검 건수 / 비고 */
function TotalCells({ totals }: { totals: PatrolStatusTotals }) {
  return <>
    <td className={TD}>{count(totals.registeredCount)}</td>
    <td className={TD}>{count(totals.targetCount)}</td>
    <td className={TD}>{count(totals.tbmCount)}</td>
    <td className={TD}>{count(totals.inspectionCount)}</td>
    <td className={`${TD} whitespace-nowrap`}>{patrolStatusRemark(totals)}</td>
  </>
}

/** 현장 id 목록을 100개씩 나눠 조회하고 1000행씩 끝까지 받는다. 기본 응답 제한으로 실적이 잘리지 않게 한다. */
async function fetchAllByProjects<T>(ids: string[], query: (batch: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, isCancelled: () => boolean): Promise<T[]> {
  const rows: T[] = []
  for (let batch = 0; batch < ids.length; batch += 100) {
    const chunk = ids.slice(batch, batch + 100)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await query(chunk, from, from + 999)
      if (isCancelled()) return rows
      if (error) throw error
      const page = data ?? []
      rows.push(...page)
      if (page.length < 1000) break
    }
  }
  return rows
}

function StatusContent({ initialHq, initialBranch, onBack, profile, userId }: Props & { profile: UserProfile; userId: string }) {
  // 조회 함수와 같은 대표 지사 판정으로 시작 단계를 정한다. 현장 수로 단계를 생략하지 않는다.
  const allHq = !profile.hq_division || (profile.hq_division === '본사' && profile.branch_division === '본사')
  const hqLevel = !profile.branch_division || BRANCH_OPTIONS[profile.hq_division ?? '']?.[0] === profile.branch_division
  const rootLevel: Level = allHq ? 'hq' : hqLevel ? 'branch' : 'project'
  const rootHq = allHq ? null : profile.hq_division
  const rootBranch = rootLevel === 'project' ? profile.branch_division : null
  const [selectedHq, setSelectedHq] = useState<string | null>(initialHq ?? rootHq ?? null)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(initialBranch ?? rootBranch ?? null)
  const [level, setLevel] = useState<Level>(rootLevel === 'project' || initialBranch ? 'project' : initialHq ? 'branch' : rootLevel)
  const currentWeek = patrolLedgerWeekStart(seoulToday())
  const [weekStart, setWeekStart] = useState(currentWeek)
  const range = useMemo(() => patrolStatusWeekRange(weekStart), [weekStart])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectError, setProjectError] = useState('')
  const [result, setResult] = useState<{ key: string; rows: PatrolStatusRow[]; error: string } | null>(null)
  const [themeState, setThemeState] = useState({ week: '', value: '', error: '' })
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)
    setProjectError('')
    getProjectsByUserBranch(profile, { fetchAll: true }).then(response => {
      if (cancelled) return
      if (!response.success || !response.projects) throw new Error(response.error || '관할 현장을 불러오지 못했습니다.')
      setProjects(response.projects)
    }).catch(() => {
      if (!cancelled) { setProjects([]); setProjectError('관할 현장을 불러오지 못했습니다.') }
    }).finally(() => { if (!cancelled) setProjectsLoading(false) })
    return () => { cancelled = true }
  }, [profile])

  // 등록 프로젝트 수는 관할 전체가 기준이라 활성 여부와 무관하게 모든 현장을 조회 대상으로 삼는다.
  const projectIds = useMemo(() => projects.map(project => project.id), [projects])
  const resultKey = JSON.stringify([weekStart, projectIds])
  useEffect(() => {
    if (projectsLoading || projectError) return
    let cancelled = false
    setResult(null)
    const load = async () => {
      try {
        const isCancelled = () => cancelled
        const inspections = await fetchAllByProjects<PatrolStatusInspection>(projectIds, (ids, from, to) =>
          supabase.from(PATROL_LEDGER_TABLE)
            .select('id, project_id, inspection_date, inspector_name, items, finding_photo_kind, finding_photo_url, theme')
            .in('project_id', ids).gte('inspection_date', range.start).lte('inspection_date', range.end)
            .order('id', { ascending: true }).range(from, to), isCancelled)
        if (cancelled) return
        // TBM(등록건수) 금주 — 최종 제출된 TBM만 센다(다른 TBM 통계와 같은 기준). 구형 project_id 없는 제출은 제외된다.
        const tbmRows = await fetchAllByProjects<{ id: string; project_id: string }>(projectIds, (ids, from, to) =>
          supabase.from('tbm_submissions').select('id, project_id')
            .in('project_id', ids).eq('status', 'submitted')
            .gte('meeting_date', range.start).lte('meeting_date', `${range.end}T23:59:59`)
            .order('id', { ascending: true }).range(from, to), isCancelled)
        if (cancelled) return
        const tbmCounts = new Map<string, number>()
        for (const row of tbmRows) tbmCounts.set(row.project_id, (tbmCounts.get(row.project_id) ?? 0) + 1)
        setResult({ key: resultKey, rows: aggregatePatrolStatus(projects, inspections, range, tbmCounts), error: '' })
      } catch {
        if (!cancelled) setResult({ key: resultKey, rows: [], error: '순회점검 현황을 불러오지 못했습니다.' })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [projects, projectIds, range, resultKey, projectsLoading, projectError])

  useEffect(() => {
    let cancelled = false
    setSaveMessage('')
    setSaveError('')
    getPatrolLedgerWeeklyTheme(weekStart).then(theme => {
      if (!cancelled) setThemeState({ week: weekStart, value: theme?.theme ?? '', error: '' })
    }).catch(() => {
      if (!cancelled) setThemeState({ week: weekStart, value: '', error: '점검 테마를 불러오지 못했습니다.' })
    })
    return () => { cancelled = true }
  }, [weekStart])

  const themeLoading = themeState.week !== weekStart
  const canEdit = canEditPatrolLedgerTheme(profile) && weekStart === currentWeek
  const saveTheme = async () => {
    if (!canEdit || saving || themeLoading || themeState.error) return
    setSaving(true)
    setSaveMessage('')
    setSaveError('')
    try {
      const saved = await savePatrolLedgerWeeklyTheme(weekStart, themeState.value, userId)
      if (!mounted.current) return
      setThemeState({ week: weekStart, value: saved.theme, error: '' })
      setSaveMessage('점검 테마를 저장했습니다.')
    } catch (error) {
      if (mounted.current) setSaveError(error instanceof Error ? error.message : '점검 테마를 저장하지 못했습니다.')
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const dataError = projectError || (result?.key === resultKey ? result.error : '')
  const loading = projectsLoading || (!dataError && result?.key !== resultKey)
  const rows = (result?.key === resultKey ? result.rows : []).filter(row =>
    (selectedHq === null || row.hq === selectedHq) && (selectedBranch === null || row.branch === selectedBranch))
  // 본부·지사 표는 직제 순서(BRANCH_OPTIONS의 본부 순서와 본부별 지사 순서)로 나열한다.
  const groups = groupPatrolStatus(rows, level === 'hq' ? 'hq' : 'branch', ORG_ORDER)
  // 프로젝트별 표는 분기 점검 대상(공사중) 현장만 보여 준다. 등록 수·합계는 관할 전체 기준이다.
  const projectRows = rows.filter(row => row.isTarget)
  const totals = sumPatrolStatus(rows)
  const quarter = patrolStatusQuarter(range)
  const canGoUp = rootLevel === 'hq' ? level !== 'hq' : rootLevel === 'branch' && level === 'project'
  const goUp = () => {
    if (level === 'project') {
      setSelectedBranch(null)
      setLevel('branch')
    } else {
      setSelectedHq(null)
      setLevel('hq')
    }
  }
  const weekLabel = `${shortDate(range.start)} ~ ${shortDate(range.end)}`

  return <div className="space-y-4">
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-blue-600" />공사감독 순회점검 현황</h3>
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-600 transition-colors hover:text-gray-900"><ArrowLeft className="h-4 w-4" />뒤로가기</button>
      </div>
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">{weekStart === currentWeek ? '금주' : '선택 주'} 점검 테마 ({weekLabel})</h4>
        {themeLoading ? <LoadingSpinner /> : themeState.error ? <p role="alert" className="text-sm text-red-800">{themeState.error}</p> : canEdit ?
          <form onSubmit={event => { event.preventDefault(); void saveTheme() }} className="flex items-center gap-2">
            <input aria-label="금주 점검 테마" value={themeState.value} maxLength={PATROL_LEDGER_THEME_MAX} disabled={saving}
              onChange={event => { setThemeState({ ...themeState, value: event.target.value }); setSaveMessage(''); setSaveError('') }}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            <button type="submit" disabled={saving || !themeState.value.trim()} className="min-h-[44px] shrink-0 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{saving ? '저장 중' : '저장'}</button>
          </form> : <p className={`text-sm ${themeState.value ? 'text-gray-900' : 'text-gray-500'}`}>{themeState.value || '아직 등록되지 않았습니다.'}</p>}
        {saveMessage && <p role="status" className="mt-2 text-sm text-green-800">{saveMessage}</p>}
        {saveError && <p role="alert" className="mt-2 text-sm text-red-800">{saveError}</p>}
      </div>
    </div>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{[selectedHq, selectedBranch].filter(Boolean).join(' / ') || '전체 본부'} · {level === 'hq' ? '본부별' : level === 'branch' ? '지사별' : '프로젝트별'} 현황</h4>
          {canGoUp && <button onClick={goUp} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-blue-600 hover:text-blue-800"><ArrowLeft className="h-4 w-4" />{level === 'project' ? '지사별' : '본부별'} 통계로 돌아가기</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={saving} onClick={() => setWeekStart(patrolStatusWeekRange(weekStart, -1).start)} className={BUTTON}>◀ 이전 주</button>
          <span className="text-sm text-gray-900">{range.start.slice(0, 4)}년 {weekLabel}</span>
          <button disabled={saving} onClick={() => setWeekStart(patrolStatusWeekRange(weekStart, 1).start)} className={BUTTON}>다음 주 ▶</button>
        </div>
      </div>
      <p className="px-4 pt-3 text-xs text-gray-500">{level === 'project' ? `선택 주의 ${quarter}분기 점검 대상(공사중) 현장 · 사진은 지적사진 건수입니다.` : `등록 프로젝트 수는 관할 전체, 점검 대상은 ${quarter}분기 공사중 현장, TBM·순회점검은 선택 주 건수입니다.`}</p>
      {loading ? <div className="flex justify-center py-12"><LoadingSpinner /></div> : dataError ? <p role="alert" className="p-4 text-sm text-red-800">{dataError}</p> :
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200"><tr>
              {(level === 'project' ? ['사업명', 'TBM 금주', '점검 건수', '미흡 항목 수', '사진', '마지막 점검일', '점검자', '주요 테마'] : [level === 'hq' ? '본부' : '지사', '등록 프로젝트 수', `${quarter}분기 점검 대상`, 'TBM(등록건수) 금주', '순회점검 건수', '비고']).map(label => <th key={label} scope="col" className={TH}>{label}</th>)}
            </tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(level === 'project' ? projectRows : rows).length === 0 ? <tr><td colSpan={level === 'project' ? 8 : 6} className="px-4 py-8 text-center text-sm text-gray-500">{level === 'project' ? '선택 주에 공사중인 현장이 없습니다.' : '관할에 등록된 현장이 없습니다.'}</td></tr> : level === 'project' ? projectRows.map(row =>
                <tr key={row.id}>
                  <td className="px-3 py-3 text-sm text-left font-medium text-gray-900">{row.name}</td>
                  <td className={TD}>{count(row.tbmCount)}</td><td className={TD}>{count(row.inspectionCount)}</td><td className={TD}>{count(row.poorCount)}</td><td className={TD}>{count(row.photoCount)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{row.lastInspectionDate || '-'}</td><td className={TD}>{row.inspectorName || '-'}</td><td className={TD}>{row.themes || '-'}</td>
                </tr>) : groups.map(group => {
                  const selectGroup = () => {
                    setSelectedHq(group.hq)
                    if (level === 'hq') { setSelectedBranch(null); setLevel('branch') }
                    else { setSelectedBranch(group.branch); setLevel('project') }
                  }
                  return <tr key={group.id} onClick={selectGroup} className="hover:bg-gray-50 cursor-pointer">
                    <td className={TD}><button onClick={event => { event.stopPropagation(); selectGroup() }} className="min-h-[44px] text-blue-600 hover:text-blue-800 font-medium">{group.name}</button></td>
                    <TotalCells totals={group} />
                  </tr>
                })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold"><tr>
              <td className={TD}>합계{level === 'project' ? ` (${totals.targetCount}개 현장)` : ''}</td>
              {level === 'project' ? <><td className={TD}>{count(totals.tbmCount)}</td><td className={TD}>{count(totals.inspectionCount)}</td><td className={TD}>{count(totals.poorCount)}</td><td className={TD}>{count(totals.photoCount)}</td><td colSpan={3} className={TD}>{totals.uninspectedCount === 0 ? '-' : `미점검 ${totals.uninspectedCount}개 현장`}</td></> : <TotalCells totals={totals} />}
            </tr></tfoot>
          </table>
        </div>}
    </div>
  </div>
}

export default function PatrolLedgerStatusView(props: Props) {
  const { user, userProfile } = useAuth()
  if (!user || !userProfile) return <LoadingSpinner />
  if (userProfile.role !== '발주청') return <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-sm text-red-800">발주청 사용자만 조회할 수 있습니다.</div>
  // 계정·소속·라우트가 바뀌면 선택 상태와 진행 중 조회를 함께 초기화한다.
  const scopeKey = JSON.stringify([user.id, userProfile.hq_division, userProfile.branch_division, props.initialHq, props.initialBranch])
  return <StatusContent key={scopeKey} {...props} profile={userProfile} userId={user.id} />
}
