'use client'

// 품질시험 결과 관리대장 페이지 — 실시대장·성과총괄표·확인시험 의뢰서 3종 양식 탭
// 원본 서식: 별지 제42호서식(실시대장), 별지 2호(성과총괄표), 별지 제4호서식(확인시험 의뢰서)

import React, { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import { computeProgressRate, ProgressAnchor } from '@/lib/work-daily-report/work-daily-report-types'
import { getProgressAnchors } from '@/lib/work-daily-report/progress-anchors'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QualityTestRecordsTab from '@/components/project/quality/QualityTestRecordsTab'
import QualitySummaryTab from '@/components/project/quality/QualitySummaryTab'
import QualityVerificationRequestsTab from '@/components/project/quality/QualityVerificationRequestsTab'

type TabKey = 'records' | 'summary' | 'verification'

const TABS: { key: TabKey; label: string; badge?: string }[] = [
  { key: 'records', label: '실시대장' },
  { key: 'summary', label: '성과총괄표' },
  { key: 'verification', label: '확인시험 의뢰서', badge: '미사용' },
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
    full_name?: string
  } | null>(null)
  const [progressAnchors, setProgressAnchors] = useState<ProgressAnchor[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('records')
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
            .select('company_name, full_name')
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
        {/* 탭 바 */}
        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-amber-600 text-amber-700 bg-amber-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                  {tab.badge}
                </span>
              )}
              {tab.key === 'summary' && summaryUnreadRejectionCount > 0 && (
                <span
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
                  title={`미확인 반려 ${summaryUnreadRejectionCount}건`}
                  aria-label={`미확인 반려 ${summaryUnreadRejectionCount}건`}
                >
                  {summaryUnreadRejectionCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'records' && (
          <QualityTestRecordsTab
            projectId={projectId}
            userId={user.id}
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
            projectName={project?.project_name || ''}
            managingBranch={project?.managing_branch || ''}
            ownerCompanyName={projectOwner?.company_name || ''}
            ownerFullName={projectOwner?.full_name || ''}
          />
        )}
      </main>
    </div>
  )
}
