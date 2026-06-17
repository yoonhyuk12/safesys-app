'use client'

// 시공 예정공정표 페이지 — 공종 기반 공정표 작성·편집·Excel 출력 (공정률 마스터)

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, CalendarRange } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import WorkScheduleEditor from '@/components/project/WorkScheduleEditor'
import CopyrightNotice from '@/components/common/CopyrightNotice'

export default function WorkSchedulePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadProject = useCallback(async () => {
    try {
      setError('')
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (projectError) throw new Error(projectError.message)
      setProject(data)
    } catch (err: unknown) {
      console.error('프로젝트 로드 실패:', err)
      setError(err instanceof Error ? err.message : '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadProject()
  }, [user, projectId, loadProject])

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
    }
    router.push(`/project/${projectId}`)
  }

  if (authLoading || loading) {
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">프로젝트를 찾을 수 없습니다.</div>
      </div>
    )
  }

  const hasPeriod = !!project.construction_start_date && !!project.construction_end_date

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">예정공정표</h1>
              <p className="text-sm text-gray-500 mt-1">{project.project_name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!hasPeriod ? (
          <div className="bg-white rounded-lg shadow p-4 sm:p-5">
            <div className="max-w-xl mx-auto text-center py-8 space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-600">
                <CalendarRange className="h-7 w-7" />
              </div>
              <p className="text-sm text-gray-700">
                공정표를 작성하려면 먼저 <b>착공일·준공일</b>이 필요합니다.
                <br />작업일보 1단계에서 공사기간을 설정해주세요.
              </p>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') sessionStorage.setItem(`project_${projectId}_from_subpage`, 'true')
                  router.push(`/project/${projectId}/work-daily-report`)
                }}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                작업일보에서 공사기간 설정 →
              </button>
            </div>
          </div>
        ) : (
          <WorkScheduleEditor
            projectId={projectId}
            projectName={project.project_name}
            userId={user.id}
            constructionStart={project.construction_start_date}
            constructionEnd={project.construction_end_date}
            initialSchedule={project.construction_schedule}
            onSaved={s => setProject(prev => (prev ? { ...prev, construction_schedule: s } : prev))}
          />
        )}
      </main>

      <footer className="w-full px-4 py-6 [&_p]:!text-blue-200/70 [&_p:first-child]:!text-blue-100">
        <CopyrightNotice withDivider={false} />
      </footer>
    </div>
  )
}
