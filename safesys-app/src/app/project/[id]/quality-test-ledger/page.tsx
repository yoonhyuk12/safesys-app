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
  const [progressAnchors, setProgressAnchors] = useState<ProgressAnchor[]>([])
  const [activeTab, setActiveTab] = useState<TabKey | null>(null)
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
              <div className="mb-8 text-center">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-100 backdrop-blur">
                  QUALITY DOCUMENTS
                </span>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  품질시험 서류를 선택하세요
                </h2>
                <p className="mt-2 text-sm text-blue-100/80 sm:text-base">
                  작성하거나 확인할 서류를 고르면 해당 관리 화면이 열립니다.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-3 lg:gap-6">
                {TABS.map((tab, index) => {
                  const Icon = tab.icon

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`group relative min-h-[22rem] overflow-hidden rounded-[1.4rem] border-2 bg-white p-6 text-left shadow-2xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/50 ${tab.cardClass}`}
                    >
                      <span
                        className={`absolute inset-x-0 top-0 h-1.5 ${tab.accentClass}`}
                        aria-hidden="true"
                      />
                      <span
                        className="absolute right-0 top-0 h-16 w-16 overflow-hidden"
                        aria-hidden="true"
                      >
                        <span className="absolute -right-8 -top-8 h-16 w-16 rotate-45 border-b border-gray-200 bg-gray-100 shadow-sm" />
                      </span>

                      <span className="relative flex h-full flex-col">
                        <span className="flex items-center justify-between gap-3 pr-6">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${tab.badgeClass}`}
                          >
                            {tab.formLabel}
                          </span>
                          <span className="text-xs font-bold tracking-widest text-gray-300">
                            0{index + 1}
                          </span>
                        </span>

                        <span
                          className={`mt-6 flex h-14 w-14 items-center justify-center rounded-2xl ${tab.iconClass}`}
                        >
                          <Icon className="h-7 w-7" aria-hidden="true" />
                        </span>

                        <span className="mt-5 text-xl font-bold text-gray-900">{tab.label}</span>
                        <span className="mt-2 min-h-[3rem] text-sm leading-6 text-gray-500">
                          {tab.description}
                        </span>

                        <span
                          className="mt-5 block rounded-xl border border-gray-100 bg-gray-50 p-3"
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

                        <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-bold text-gray-700 transition-colors group-hover:text-gray-950">
                          서류 열기
                          <ArrowRight
                            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                            aria-hidden="true"
                          />
                        </span>

                        {tab.key === 'summary' && summaryUnreadRejectionCount > 0 && (
                          <span
                            className="absolute bottom-4 right-0 inline-flex min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 py-1 text-[11px] font-bold leading-none text-white shadow-sm"
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
