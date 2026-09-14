'use client'
// 대표 계약 착공연도로 고른 신규지구의 안전컨설팅 실적을 본부→지사→프로젝트 3단으로 조회하는 현황 뷰

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw, Sprout } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  NewDistrictBranchTable,
  NewDistrictHqTable,
  NewDistrictProjectTable,
  formatInspectionCount,
  formatRate,
  hqDisplay,
} from '@/components/dashboard/NewDistrictConsultingTables'
import { useAuth } from '@/contexts/AuthContext'
import { seoulToday } from '@/lib/patrol-inspection-utils'
import {
  DEFAULT_CONSULTING_MONTHS,
  MIN_CONSULTING_MONTHS,
  clampConsultingMonths,
  getNewDistrictConsulting,
  type NewDistrictBranchGroup,
  type NewDistrictConsultingResult,
  type NewDistrictProjectRow,
  type NewDistrictSubtotal,
} from '@/lib/new-district-consulting'
import { getProjectsByUserBranch, type Project } from '@/lib/projects'

interface NewDistrictConsultingViewProps {
  initialHq: string | null
  initialBranch: string | null
  onBack: () => void
}

type ViewLevel = 'hq' | 'branch' | 'project'

// 업무 규칙이 아니라 입력이 터무니없이 내려가지 않게 두는 하한이다.
// 2024년 이전 시작 계약이 실제로 있어 과거 코호트도 조회할 수 있어야 한다.
const MIN_YEAR = 1900
// 착공연도 판정 기준을 서울 달력일과 맞춘다
const CURRENT_YEAR = Number(seoulToday().slice(0, 4))

/** 연도·인정 기간 증감 버튼. 장갑 낀 손으로 눌러야 하므로 44×44를 지킨다. */
const STEPPER_BUTTON_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30'

/** 뒤로가기 버튼도 탭 대상이라 44px 높이를 준다. */
const BACK_BUTTON_CLASS =
  'inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-600 transition-colors hover:text-gray-900'

/** 관할 프로젝트에서 해당 지사가 속한 본부를 모은다. 같은 지사명이 여러 본부에 있으면 2개 이상이 나온다. */
const hqsOfBranch = (projects: Project[], branch: string): string[] => {
  const set = new Set<string>()
  for (const project of projects) {
    if (project.managing_branch !== branch) continue
    const hq = String(project.managing_hq ?? '').trim()
    if (hq) set.add(hq)
  }
  return Array.from(set)
}

const emptySubtotal = (): NewDistrictSubtotal => ({
  districtCount: 0,
  inspectedDistrictCount: 0,
  inspectionCount: 0,
  excludedCount: 0,
  rate: 0,
})

/** 동명 지사가 여러 본부에 있을 때 하위 소계를 원수로 합친다. 율의 평균을 쓰지 않는다. */
const sumSubtotals = (subtotals: NewDistrictSubtotal[]): NewDistrictSubtotal => {
  const summed = subtotals.reduce<NewDistrictSubtotal>(
    (acc, item) => ({
      districtCount: acc.districtCount + item.districtCount,
      inspectedDistrictCount: acc.inspectedDistrictCount + item.inspectedDistrictCount,
      inspectionCount: acc.inspectionCount + item.inspectionCount,
      excludedCount: acc.excludedCount + item.excludedCount,
      rate: 0,
    }),
    emptySubtotal()
  )
  return {
    ...summed,
    rate: summed.districtCount > 0 ? summed.inspectedDistrictCount / summed.districtCount : 0,
  }
}

const NewDistrictConsultingView = ({
  initialHq,
  initialBranch,
  onBack,
}: NewDistrictConsultingViewProps) => {
  const { userProfile } = useAuth()

  // 지사명만으로 본부를 추정하지 않는다. 같은 지사명이 여러 본부에 있으면 다른 본부 실적이 잘린다.
  const hq0 = initialHq || null
  const branch0 = initialBranch || null
  const [viewLevel, setViewLevel] = useState<ViewLevel>(branch0 ? 'project' : hq0 ? 'branch' : 'hq')
  const [selectedHq, setSelectedHq] = useState<string | null>(hq0)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(branch0)
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [months, setMonths] = useState(DEFAULT_CONSULTING_MONTHS)
  const [projects, setProjects] = useState<Project[]>([])
  const [result, setResult] = useState<NewDistrictConsultingResult | null>(null)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [resultLoading, setResultLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const scopeAppliedRef = useRef(false)
  const loadedScopeRef = useRef<string | null>(null)
  // 결과 조회의 세대 번호. 이 값이 바뀐 뒤 끝난 요청은 상태를 건드리지 않는다.
  const resultRequestRef = useRef(0)

  // 조회 범위는 프로필의 소속 정보로만 결정된다. 객체 동일성이 흔들려도 아래 값이 그대로면 다시 부르지 않는다.
  const profileId = userProfile?.id ?? ''
  const profileRole = userProfile?.role ?? ''
  const profileHq = userProfile?.hq_division ?? ''
  const profileBranch = userProfile?.branch_division ?? ''

  // 조회 시점의 최신 프로필을 읽기 위한 참조. 아래 로딩 effect보다 먼저 선언해 순서를 보장한다.
  const userProfileRef = useRef(userProfile)
  useEffect(() => {
    userProfileRef.current = userProfile
  }, [userProfile])

  const isClientRole = profileRole === '발주청'

  useEffect(() => {
    const profile = userProfileRef.current
    if (!profileId || !profile) return
    if (!isClientRole) {
      setProjects([])
      setResult(null)
      setProjectsLoading(false)
      return
    }

    // 소속이 실제로 바뀌었으면 이전 계정 기준으로 좁혀둔 선택과 목록을 먼저 비운다
    const scopeKey = `${profileId}|${profileRole}|${profileHq}|${profileBranch}`
    if (loadedScopeRef.current !== null && loadedScopeRef.current !== scopeKey) {
      scopeAppliedRef.current = false
      setProjects([])
      setResult(null)
      setSelectedHq(hq0)
      setSelectedBranch(branch0)
      setViewLevel(branch0 ? 'project' : hq0 ? 'branch' : 'hq')
    }
    loadedScopeRef.current = scopeKey

    let cancelled = false
    setProjectsLoading(true)
    setError('')

    const load = async () => {
      try {
        // 과거 연도 신규지구까지 봐야 하므로 관할 전체를 나눠 받는다
        const projectResult = await getProjectsByUserBranch(profile, { fetchAll: true })
        if (cancelled) return
        if (!projectResult.success || !projectResult.projects) {
          setProjects([])
          setError('관할 프로젝트 목록을 불러오지 못했습니다.')
          return
        }
        // 준공 프로젝트도 제외하지 않는다 — 빼면 과거 신규지구 실적이 사라진다.
        // isOrganizationInUserScope 재필터를 걸지 않는다. fetchAll 경로가 managing_hq까지 함께 걸어
        // 동명 지사 방어가 이미 끝났고, 본부 첫 지사가 '사업관리부'류인 본부에서는 재필터가
        // 본부 전체 관할을 자기 부서로 잘못 잘라낸다.
        setProjects(projectResult.projects)
      } catch {
        if (!cancelled) {
          setProjects([])
          setError('데이터를 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (!cancelled) setProjectsLoading(false)
      }
    }

    load()
    // 소속이 바뀌면 이전 계정 응답이 뒤늦게 도착해도 버린다
    return () => {
      cancelled = true
    }
    // hq0·branch0은 마운트 시 props에서 정해진 상수라 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, profileRole, profileHq, profileBranch, isClientRole, reloadToken])

  /** 관할에 본부·지사가 하나뿐이면 그 단계를 건너뛴다. 사용자 관할 밖으로는 올라가지 않는다. */
  const scopeHqs = useMemo(() => {
    const set = new Set<string>()
    for (const project of projects) {
      const hq = String(project.managing_hq ?? '').trim()
      if (hq) set.add(hq)
    }
    return Array.from(set)
  }, [projects])

  const scopeBranches = useMemo(() => {
    const set = new Set<string>()
    for (const project of projects) {
      const branch = String(project.managing_branch ?? '').trim()
      if (branch) set.add(branch)
    }
    return Array.from(set)
  }, [projects])

  const rootLevel: ViewLevel = useMemo(() => {
    if (scopeHqs.length === 1 && scopeBranches.length === 1) return 'project'
    if (scopeHqs.length === 1) return 'branch'
    return 'hq'
  }, [scopeHqs, scopeBranches])

  useEffect(() => {
    if (projectsLoading || scopeAppliedRef.current || projects.length === 0) return
    scopeAppliedRef.current = true

    // 지사로 바로 들어온 경우: 관할 프로젝트에서 본부를 역산해 단일일 때만 지정한다.
    // 여러 본부에 같은 지사명이 있으면 본부 필터 없이 지사명으로 전부 보여준다.
    if (branch0) {
      if (!hq0) {
        const candidates = hqsOfBranch(projects, branch0)
        if (candidates.length === 1) setSelectedHq(candidates[0])
      }
      return
    }

    if (rootLevel === 'hq') return

    setSelectedHq((current) => current || scopeHqs[0] || null)
    if (rootLevel === 'project') {
      setSelectedBranch((current) => current || scopeBranches[0] || null)
    }
    setViewLevel((current) => {
      if (current === 'project') return current
      if (rootLevel === 'project') return 'project'
      return current === 'hq' ? 'branch' : current
    })
    // hq0·branch0은 마운트 시 props에서 정해진 상수라 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoading, projects, rootLevel, scopeHqs, scopeBranches])

  const projectIdsKey = useMemo(() => projects.map((project) => project.id).join(','), [projects])

  useEffect(() => {
    // 조기 종료 경로에서도 resultLoading을 반드시 내린다. 남겨두면 이어지는 관할 조회 실패·빈 관할에서
    // loading이 true로 굳어 오류 문구 대신 스피너만 영원히 남는다.
    if (projectsLoading) {
      resultRequestRef.current += 1
      setResultLoading(false)
      return
    }
    if (projects.length === 0) {
      resultRequestRef.current += 1
      setResult(null)
      setResultLoading(false)
      return
    }

    // cancelled 플래그 대신 요청 토큰을 쓴다. 뒤늦게 끝난 옛 요청이 최신 요청의 로딩을 꺼버리지 않는다.
    const requestId = (resultRequestRef.current += 1)
    const isLatest = () => resultRequestRef.current === requestId
    // 이전 조건의 수치가 새 연도·개월로 읽히지 않게 먼저 비운다
    setResult(null)
    setResultLoading(true)
    setError('')

    const load = async () => {
      try {
        const next = await getNewDistrictConsulting(projects, selectedYear, months)
        if (isLatest()) setResult(next)
      } catch {
        if (isLatest()) {
          setResult(null)
          setError('신규지구 안전컨설팅 데이터를 불러오지 못했습니다.')
        }
      } finally {
        if (isLatest()) setResultLoading(false)
      }
    }

    load()
    // 언마운트·조건 변경 시 진행 중 요청을 무효화한다
    return () => {
      resultRequestRef.current += 1
    }
    // projectIdsKey로 배열 동일성 변화를 흡수하고, reloadToken으로 재시도를 받는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdsKey, selectedYear, months, projectsLoading, reloadToken])

  const hqGroups = useMemo(() => result?.hqs ?? [], [result])
  const total = result?.total ?? emptySubtotal()

  const selectedHqGroup = useMemo(
    () => (selectedHq ? (hqGroups.find((group) => group.hq === selectedHq) ?? null) : null),
    [hqGroups, selectedHq]
  )

  /** 지사 단계에서 본부를 고르지 못한 경우는 없지만, 데이터가 없으면 빈 표를 보여준다. */
  const branchGroups = selectedHqGroup?.branches ?? []
  const branchLevelSubtotal = selectedHqGroup?.subtotal ?? emptySubtotal()

  // 동명 지사 진입(본부 미지정)에서는 같은 이름의 지사 그룹을 모두 모아 원수로 합산한다.
  const projectScope = useMemo(() => {
    if (!selectedBranch) return { rows: [] as NewDistrictProjectRow[], subtotal: emptySubtotal() }
    const matched: NewDistrictBranchGroup[] = []
    for (const hqGroup of hqGroups) {
      if (selectedHq && hqGroup.hq !== selectedHq) continue
      for (const branchGroup of hqGroup.branches) {
        if (branchGroup.branch === selectedBranch) matched.push(branchGroup)
      }
    }
    return {
      rows: matched.flatMap((group) => group.projects),
      subtotal: sumSubtotals(matched.map((group) => group.subtotal)),
    }
  }, [hqGroups, selectedHq, selectedBranch])

  // 요약 타일은 지금 보고 있는 단계의 소계를 따른다. 지사로 내려갔는데 관할 전체 수치가 남아 있으면 표와 어긋난다.
  const summary =
    viewLevel === 'project' ? projectScope.subtotal : viewLevel === 'branch' ? branchLevelSubtotal : total

  const loading = projectsLoading || resultLoading

  const handleBack = () => {
    if (viewLevel === rootLevel) {
      onBack()
      return
    }
    if (viewLevel === 'project') {
      setSelectedBranch(null)
      setViewLevel(rootLevel === 'branch' ? 'branch' : selectedHq ? 'branch' : 'hq')
      return
    }
    setSelectedHq(null)
    setViewLevel('hq')
  }

  const selectHq = (hq: string) => {
    setSelectedHq(hq)
    setViewLevel('branch')
  }

  const selectBranch = (branch: string) => {
    setSelectedBranch(branch)
    setViewLevel('project')
  }

  const title =
    viewLevel === 'project'
      ? `${selectedBranch ?? '관할'} - 지구별 신규지구 안전컨설팅`
      : viewLevel === 'branch'
        ? `${selectedHq ? hqDisplay(selectedHq) : ''} - 지사별 신규지구 안전컨설팅`
        : '본부별 신규지구 안전컨설팅'

  // 본부를 고르지 않은 지사 진입에서는 뒤로가기가 본부 표로 가므로 문구도 맞춘다
  const backLabel =
    viewLevel === rootLevel
      ? '안전현황으로 돌아가기'
      : viewLevel === 'project' && (rootLevel === 'branch' || selectedHq)
        ? '지사로 돌아가기'
        : '본부로 돌아가기'

  if (userProfile && !isClientRole) {
    return (
      <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-200 px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={onBack}
            className={BACK_BUTTON_CLASS}
          >
            <ArrowLeft className="h-4 w-4" />
            안전현황으로 돌아가기
          </button>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            <Sprout className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900 sm:text-lg">신규지구 안전컨설팅</h2>
          </div>
        </div>
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-gray-600">발주청 사용자만 조회할 수 있는 화면입니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-200 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={handleBack}
          className={BACK_BUTTON_CLASS}
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
          <Sprout className="h-4 w-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">{title}</h2>
        </div>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">신규지구</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">
              {loading ? '—' : `${summary.districtCount}개`}
            </p>
          </div>
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2">
            <p className="text-xs text-green-700">점검 지구</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-green-900">
              {loading ? '—' : `${summary.inspectedDistrictCount}개`}
            </p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-700">점검 건수</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-blue-900">
              {loading ? '—' : formatInspectionCount(summary.inspectionCount)}
            </p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-700">실시율</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-blue-900">
              {loading ? '—' : formatRate(summary.rate)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {/* 장갑 낀 손을 위해 증감 버튼을 좌우로 벌려 각 44×44 터치 영역을 확보한다 */}
          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            연도
            <div className="flex items-center rounded-md border border-gray-300 bg-white">
              <button
                type="button"
                onClick={() => setSelectedYear((year) => Math.max(year - 1, MIN_YEAR))}
                disabled={selectedYear <= MIN_YEAR}
                aria-label="이전 연도"
                className={STEPPER_BUTTON_CLASS}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <span className="min-w-[56px] text-center text-sm tabular-nums text-gray-900">
                {selectedYear}년
              </span>
              <button
                type="button"
                onClick={() => setSelectedYear((year) => Math.min(year + 1, CURRENT_YEAR))}
                disabled={selectedYear >= CURRENT_YEAR}
                aria-label="다음 연도"
                className={STEPPER_BUTTON_CLASS}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            인정 기간
            <div className="flex items-center rounded-md border border-gray-300 bg-white">
              <button
                type="button"
                onClick={() => setMonths((value) => clampConsultingMonths(value - 1))}
                disabled={months <= MIN_CONSULTING_MONTHS}
                aria-label="인정 기간 줄이기"
                className={STEPPER_BUTTON_CLASS}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <span className="min-w-[56px] text-center text-sm tabular-nums text-gray-900">
                {months}개월
              </span>
              {/* 인정 기간 상한은 두지 않는다 — 13개월 이상도 계속 늘릴 수 있다 */}
              <button
                type="button"
                onClick={() => setMonths((value) => clampConsultingMonths(value + 1))}
                aria-label="인정 기간 늘리기"
                className={STEPPER_BUTTON_CLASS}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className="pb-2 text-xs text-gray-500">
            대표 계약 시작일부터 {months}개월 안의 본부 점검을 컨설팅 실적으로 본다.
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </button>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto rounded-md border border-gray-200">
            {viewLevel === 'hq' && (
              <NewDistrictHqTable total={total} hqs={hqGroups} onSelectHq={selectHq} />
            )}

            {viewLevel === 'branch' && (
              <NewDistrictBranchTable
                subtotal={branchLevelSubtotal}
                branches={branchGroups}
                onSelectBranch={selectBranch}
              />
            )}

            {viewLevel === 'project' && (
              <NewDistrictProjectTable
                subtotal={projectScope.subtotal}
                projects={projectScope.rows}
                showHq={!selectedHq}
              />
            )}
          </div>
          {summary.excludedCount > 0 && (
            <p className="text-xs text-gray-500">
              제외(판정 불가) {summary.excludedCount}개는 선택 연도와 무관하게 관할 전체에서 대표
              계약을 확인하지 못해 착공연도를 판정할 수 없는 지구 수다.
            </p>
          )}
          </>
        )}
      </div>
    </div>
  )
}

export default NewDistrictConsultingView
