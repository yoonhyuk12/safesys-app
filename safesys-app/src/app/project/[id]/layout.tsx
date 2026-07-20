'use client'

// 프로젝트 하위 전 라우트에 현장 AI 비서 챗봇을 유지하는 레이아웃 — 서류철 이동에도 대화 보존, 프로젝트 이탈·전환 시 초기화
import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProjectAssistantBot from '@/components/project/ProjectAssistantBot'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const projectId = typeof params.id === 'string' ? params.id : ''
  const [projectName, setProjectName] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    supabase
      .from('projects')
      .select('project_name')
      .eq('id', projectId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) {
          setProjectName((data as { project_name?: string }).project_name)
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <>
      {children}
      {/* 동적 파라미터 변경 시 레이아웃은 리마운트되지 않으므로 key로 프로젝트 단위 초기화 보장 */}
      {projectId && (
        <ProjectAssistantBot key={projectId} projectId={projectId} projectName={projectName} />
      )}
    </>
  )
}
