'use client'

// 품질시험 결과 관리대장 페이지 — 실시대장·성과총괄표·확인시험 의뢰서 3종 양식 탭
// 원본 서식: 별지 제42호서식(실시대장), 별지 2호(성과총괄표), 별지 제4호서식(확인시험 의뢰서)

import React, { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ClipboardList,
  FileCheck2,
  type LucideIcon,
} from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import { computeProgressRate, ProgressAnchor } from '@/lib/work-daily-report/work-daily-report-types'
import { getProgressAnchors } from '@/lib/work-daily-report/progress-anchors'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QualityTestRecordsTab from '@/components/project/quality/QualityTestRecordsTab'
import QualitySummaryTab from '@/components/project/quality/QualitySummaryTab'
import QualityVerificationRequestsTab from '@/components/project/quality/QualityVerificationRequestsTab'

type TabKey = 'records' | 'summary' | 'verification'

interface QualityDocumentOption {
  key: TabKey
  label: string
  formLabel: string
  description: string
  icon: LucideIcon
  cardClass: string
  accentClass: string
  iconClass: string
  badgeClass: string
  activeTabClass: string
}

const TABS: QualityDocumentOption[] = [
  {
    key: 'records',
    label: '실시대장',
    formLabel: '별지 제42호서식',
    description: '시험·검사 기록과 판정 결과를 일자별로 관리합니다.',
    icon: ClipboardList,
    cardClass: 'border-amber-100 hover:border-amber-300 hover:shadow-amber-950/20',
    accentClass: 'bg-amber-500',
    iconClass: 'bg-amber-100 text-amber-700',
    badgeClass: 'bg-amber-50 text-amber-700',
    activeTabClass: 'border-amber-300 bg-amber-50 text-amber-800 shadow-sm',
  },
  {
    key: 'summary',
    label: '성과총괄표',
    formLabel: '별지 제2호서식',
    description: '공종별 품질시험 실적과 진행 현황을 한눈에 집계합니다.',
    icon: BarChart3,
    cardClass: 'border-sky-100 hover:border-sky-300 hover:shadow-sky-950/20',
    accentClass: 'bg-sky-500',
    iconClass: 'bg-sky-100 text-sky-700',
    badgeClass: 'bg-sky-50 text-sky-700',
    activeTabClass: 'border-sky-300 bg-sky-50 text-sky-800 shadow-sm',
  },
  {
    key: 'verification',
    label: '확인시험 의뢰서',
    formLabel: '별지 제4호서식',
    description: '확인이 필요한 시험을 의뢰하고 처리 결과를 관리합니다.',
    icon: FileCheck2,
    cardClass:
      'border-emerald-100 hover:border-emerald-300 hover:shadow-emerald-950/20',
    accentClass: 'bg-emerald-500',
    iconClass: 'bg-emerald-100 text-emerald-700',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    activeTabClass: 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm',
  },
]

export default function QualityTestLedgerPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectOwner, setProjectOwner] = useState<{
    company_name?: string
  } | null>(null)
  const [isSharedWithMe, setIsSharedWithMe] = useState(false)
  const [progressAnchors, setProgressAnchors] = useState<ProgressAnchor[]>([])
  // tab 쿼리로 진입하면 선택 화면을 건너뛰고 해당 양식을 바로 연다 (예: 사업현황 실시대장 행 클릭)
  const requestedTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<TabKey | null>(
    TABS.some(tab => tab.key === requestedTab) ? (requestedTab as TabKey) : null
  )
  const [summaryUnreadRejectionCount, setSummaryUnreadRejectionCount] = useState(0)

  const handleBack = () => {
    // 진입 경로를 returnUrl 쿼리로 받은 경우 그 위치로 정확히 복귀.
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(`/project/${projectId}`)
  }

  // 프로젝트 로드 (탭 프리필용 소유자 프로필 포함)
  useEffect(() => {
    if (!user || !projectId) return
    const loadProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (data) {
        setProject(data as Project)
        // 현재 사용자가 이 프로젝트를 공유받았는지 확인 (성과총괄표 삭제 권한 판정용)
        const { data: shareRows } = await supabase
          .from('project_shares')
          .select('id')
          .eq('project_id', projectId)
          .eq('shared_with', user.id)
          .limit(1)
        setIsSharedWithMe(!!(shareRows && shareRows.length))
        const createdBy = (data as Project).created_by
        if (createdBy) {
          const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('company_name')
            .eq('id', createdBy)
            .single()
          if (ownerProfile) setProjectOwner(ownerProfile)
        }
      }
    }
    loadProject()
  }, [user, projectId])

  // 성과총괄표 탭이 열리기 전에도 미확인 반려 건수를 표시한다.
  useEffect(() => {
    if (!user || !projectId) return

    let cancelled = false
    const loadSummaryUnreadRejectionCount = async () => {
      const { count, error } = await (supabase as any)
        .from('quality_summary_reports')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .not('rejected_at', 'is', null)
        .is('rejection_read_at', null)

      if (!cancelled && !error) setSummaryUnreadRejectionCount(count ?? 0)
    }

    loadSummaryUnreadRejectionCount()
    return () => {
      cancelled = true
    }
  }, [user, projectId])

  // 작업일보의 수동 입력 공정률 기준점 로드 — 성과총괄표 "공정(%)" 기본값 계산용
  useEffect(() => {
    if (!project?.construction_start_date || !project?.construction_end_date) return
    let cancelled = false
    getProgressAnchors(project.id).then((anchors) => {
      if (!cancelled && anchors.length > 0) setProgressAnchors(anchors)
    })
    return () => {
      cancelled = true
    }
  }, [project?.id, project?.construction_start_date, project?.construction_end_date])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

  const constructionPeriod =
    project?.construction_start_date && project?.construction_end_date
      ? `${project.construction_start_date} ~ ${project.construction_end_date}`
      : ''

  // 현재 공정률 — 성과총괄표 "공정(%)" 기본값 (작업일보 공정률과 동일한 보간 계산)
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentProgressRate = computeProgressRate(
    project?.construction_start_date,
    project?.construction_end_date,
    todayStr,
    progressAnchors
  )
  const canDeleteQualityRecords =
    userProfile?.role === '발주청' || project?.created_by === user.id
  // 성과총괄표 삭제 — 소유자·발주청에 더해 공유자도 허용
  const canDeleteQualitySummary = canDeleteQualityRecords || isSharedWithMe
  // 발주청 본부 소속 여부 — 성과총괄표 검토자 서명 권한 판정 (대시보드 전사 보기와 동일 기준)
  const isClientHeadquarters =
    userProfile?.role === '발주청' &&
    (userProfile.hq_division == null ||
      (userProfile.hq_division === '본사' && userProfile.branch_division === '본사') ||
      !!userProfile.branch_division?.endsWith('본부'))

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center h-16">
            <button
              onClick={handleBack}
              className="mr-3 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate flex-1">
              품질시험 결과 관리대장
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-none mx-auto py-4 px-2 sm:px-4">
        {activeTab === null ? (
          <section className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-2 py-6 sm:py-10">
            <div className="w-full max-w-5xl">
              <div className="mb-4 text-center md:mb-8">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-100 backdrop-blur">
                  QUALITY DOCUMENTS
                </span>
                <h2 className="mt-3 text-xl font-bold tracking-tight text-white md:mt-4 md:text-2xl lg:text-3xl">
                  품질시험 서류를 선택하세요
                </h2>
                <p className="mt-1.5 text-xs text-blue-100/80 md:mt-2 md:text-sm lg:text-base">
                  작성하거나 확인할 서류를 고르면 해당 관리 화면이 열립니다.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 md:gap-5 lg:gap-6">
                {TABS.map((tab, index) => {
                  const Icon = tab.icon

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`group relative overflow-hidden rounded-xl border-2 bg-white p-2.5 text-left shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/50 md:min-h-[22rem] md:rounded-[1.4rem] md:p-6 md:shadow-2xl ${tab.cardClass}`}
                    >
                      <span
                        className={`absolute inset-x-0 top-0 h-1 md:h-1.5 ${tab.accentClass}`}
                        aria-hidden="true"
                      />
                      <span
                        className="absolute right-0 top-0 hidden h-16 w-16 overflow-hidden md:block"
                        aria-hidden="true"
                      >
                        <span className="absolute -right-8 -top-8 h-16 w-16 rotate-45 border-b border-gray-200 bg-gray-100 shadow-sm" />
                      </span>

                      <span className="relative flex h-full flex-col">
                        <span className="flex items-center justify-between gap-3 md:pr-6">
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-tight tracking-tight md:px-2.5 md:py-1 md:text-[11px] md:tracking-wide ${tab.badgeClass}`}
                          >
                            {tab.formLabel}
                          </span>
                          <span className="hidden text-xs font-bold tracking-widest text-gray-300 md:inline">
                            0{index + 1}
                          </span>
                        </span>

                        <span
                          className={`mt-2.5 flex h-9 w-9 items-center justify-center rounded-xl md:mt-6 md:h-14 md:w-14 md:rounded-2xl ${tab.iconClass}`}
                        >
                          <Icon className="h-5 w-5 md:h-7 md:w-7" aria-hidden="true" />
                        </span>

                        <span className="mt-2.5 text-sm font-bold leading-tight text-gray-900 md:mt-5 md:text-xl">{tab.label}</span>
                        <span className="mt-1 text-[11px] leading-4 text-gray-500 md:mt-2 md:min-h-[3rem] md:text-sm md:leading-6">
                          {tab.description}
                        </span>

                        <span
                          className="mt-5 hidden rounded-xl border border-gray-100 bg-gray-50 p-3 md:block"
                          aria-hidden="true"
                        >
                          <span className="block h-1.5 w-2/3 rounded-full bg-gray-300" />
                          <span className="mt-3 grid grid-cols-4 gap-1">
                            {Array.from({ length: 12 }).map((_, cellIndex) => (
                              <span
                                key={cellIndex}
                                className={`h-2 rounded-sm ${
                                  cellIndex < 4 ? 'bg-gray-300' : 'bg-gray-200'
                                }`}
                              />
                            ))}
                          </span>
                        </span>

                        <span className="mt-auto flex items-center gap-1 pt-2.5 text-[11px] font-bold text-gray-700 transition-colors group-hover:text-gray-950 md:gap-1.5 md:pt-5 md:text-sm">
                          서류 열기
                          <ArrowRight
                            className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover:translate-x-1 md:h-4 md:w-4"
                            aria-hidden="true"
                          />
                        </span>

                        {tab.key === 'summary' && summaryUnreadRejectionCount > 0 && (
                          <span
                            className="absolute bottom-0 right-0 inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm md:bottom-4 md:min-w-6 md:px-2 md:py-1 md:text-[11px]"
                            title={`미확인 반려 ${summaryUnreadRejectionCount}건`}
                            aria-label={`미확인 반려 ${summaryUnreadRejectionCount}건`}
                          >
                            {summaryUnreadRejectionCount}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        ) : (
          <div
            className="mx-auto mb-4 grid w-full max-w-3xl grid-cols-3 gap-2 rounded-2xl border border-white/70 bg-white/95 p-2 shadow-xl backdrop-blur"
            role="tablist"
            aria-label="품질시험 서류 전환"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2.5 text-xs font-semibold transition-all sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
                    isActive
                      ? tab.activeTabClass
                      : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? tab.iconClass : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-center leading-tight sm:truncate">{tab.label}</span>
                  {tab.key === 'summary' && summaryUnreadRejectionCount > 0 && (
                    <span
                      className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                      title={`미확인 반려 ${summaryUnreadRejectionCount}건`}
                      aria-label={`미확인 반려 ${summaryUnreadRejectionCount}건`}
                    >
                      {summaryUnreadRejectionCount}
                    </span>
                  )}
                  {isActive && (
                    <span
                      className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full ${tab.accentClass}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {activeTab === 'records' && (
          <QualityTestRecordsTab
            projectId={projectId}
            userId={user.id}
            canDeleteQualityRecords={canDeleteQualityRecords}
            canSignQualityRecords={userProfile?.role === '발주청'}
            projectName={project?.project_name || ''}
            supervisorName={project?.supervisor_name || ''}
          />
        )}
        {activeTab === 'summary' && (
          <QualitySummaryTab
            projectId={projectId}
            userId={user.id}
            currentUserRole={userProfile?.role}
            isClientHeadquarters={isClientHeadquarters}
            canDeleteReports={canDeleteQualitySummary}
            projectName={project?.project_name || ''}
            constructionPeriod={constructionPeriod}
            currentProgressRate={currentProgressRate}
            supervisorBranch={project?.managing_branch || ''}
            supervisorPosition={project?.supervisor_position || ''}
            supervisorName={project?.supervisor_name || ''}
            ownerCompanyName={projectOwner?.company_name || ''}
            onUnreadRejectionCountChange={setSummaryUnreadRejectionCount}
          />
        )}
        {activeTab === 'verification' && (
          <QualityVerificationRequestsTab
            projectId={projectId}
            userId={user.id}
            canSignQualityRecords={userProfile?.role === '발주청'}
            projectName={project?.project_name || ''}
            managingBranch={project?.managing_branch || ''}
            ownerCompanyName={projectOwner?.company_name || ''}
            supervisorName={project?.supervisor_name || ''}
            siteAddress={[project?.site_address, project?.site_address_detail].filter(Boolean).join(' ')}
          />
        )}
      </main>
    </div>
  )
}
