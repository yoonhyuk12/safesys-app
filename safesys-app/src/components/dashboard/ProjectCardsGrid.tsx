'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import ProjectCard from '@/components/project/ProjectCard'
import type { Project } from '@/lib/projects'

interface ProjectCardsGridProps {
  projects: Project[]
  userRole?: string
  canEditQuarters?: boolean
  onProjectClick: (project: Project) => void
  onProjectEdit: (project: Project) => void
  onProjectDelete: (project: Project) => Promise<void> | void
  onProjectStatusChange: (project: Project, isActive: boolean) => void
  onProjectHandover: (project: Project) => void
  onProjectIsActiveJsonChange: (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
  hqPendingCounts?: Record<string, number>
}

const ProjectCardsGrid: React.FC<ProjectCardsGridProps> = ({
  projects,
  userRole,
  canEditQuarters = false,
  onProjectClick,
  onProjectEdit,
  onProjectDelete,
  onProjectStatusChange,
  onProjectHandover,
  onProjectIsActiveJsonChange,
  hqPendingCounts
}) => {
  const [isEditMode, setIsEditMode] = useState(false)
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)
  const [localProjects, setLocalProjects] = useState<Project[] | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // display_order로 정렬 (지사별 순서)
  const sortedProjects = React.useMemo(() => {
    return [...projects].sort((a, b) => {
      const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
      const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.project_name.localeCompare(b.project_name, 'ko-KR')
    })
  }, [projects])

  const displayProjects = localProjects ?? sortedProjects

  // 드래그/재정렬 중 표시용 순서(번호) 계산
  const getDisplayOrder = useCallback((project: Project, fallbackIndex: number) => {
    const base = localProjects ?? sortedProjects
    if (!isEditMode) return project.display_order ?? fallbackIndex + 1

    const sameBranch = base.filter(p => p.managing_branch === project.managing_branch)
    const i = sameBranch.findIndex(p => p.id === project.id)
    return i >= 0 ? i + 1 : (project.display_order ?? fallbackIndex + 1)
  }, [isEditMode, localProjects, sortedProjects])

  // 편집 모드 종료
  const exitEditMode = useCallback(() => {
    setIsEditMode(false)
    setDraggedProjectId(null)
    setDragOverProjectId(null)
    setLocalProjects(null)
  }, [])

  // 외부 클릭 감지 (Dashboard.tsx에서 처리하므로 여기서는 제거)
  // useEffect(() => {
  //   if (!isEditMode) return
  //   ...
  // }, [isEditMode, exitEditMode, draggedProjectId])

  // 롱 프레스 시작 (ProjectCard에서 타이머 완료 시 호출됨)
  const handleLongPressStart = useCallback(() => {
    // 발주청만 "순서 변경(편집 모드)" 진입 가능
    if (userRole !== '발주청') return
    console.log('ProjectCardsGrid: 롱 프레스 시작 - 편집 모드 진입')
    setIsEditMode(true)
    setDraggedProjectId(null)
    setDragOverProjectId(null)
    // 편집 모드 진입 시 현재 순서 스냅샷
    setLocalProjects([...sortedProjects])
    console.log('편집 모드 활성화됨:', true)
  }, [sortedProjects, userRole])

  // 롱 프레스 종료: 편집 모드는 "바깥 클릭"으로만 종료 (아이폰 방식)
  const handleLongPressEnd = useCallback(() => {
    // no-op
  }, [])

  // 드래그 시작
  const handleDragStart = useCallback((projectId: string) => {
    if (!isEditMode) return
    setDraggedProjectId(projectId)
    // 혹시 localProjects가 없다면 생성
    setLocalProjects((prev) => prev ?? [...sortedProjects])
  }, [isEditMode, sortedProjects])

  // 드래그 오버
  const handleDragOver = useCallback((e: React.DragEvent, projectId: string) => {
    if (!isEditMode || !draggedProjectId || draggedProjectId === projectId) return
    e.preventDefault()
    setDragOverProjectId(projectId)
    const base = (localProjects ?? sortedProjects)
    const draggedIndex = base.findIndex(p => p.id === draggedProjectId)
    const targetIndex = base.findIndex(p => p.id === projectId)
    if (draggedIndex === -1 || targetIndex === -1) return

    const draggedProject = base[draggedIndex]
    const targetProject = base[targetIndex]
    if (draggedProject.managing_branch !== targetProject.managing_branch) return

    // 같은 지사 내에서만 "실제 배열 재정렬"하여 카드가 밀려 들어오게 함
    const next = [...base]
    const [picked] = next.splice(draggedIndex, 1)
    next.splice(targetIndex, 0, picked)
    setLocalProjects(next)
  }, [isEditMode, draggedProjectId, localProjects, sortedProjects])

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    setDragOverProjectId(null)
    setDraggedProjectId(null)
  }, [])

  // 드롭 처리
  const handleDrop = useCallback(async (e: React.DragEvent, targetProjectId: string) => {
    if (!isEditMode || !draggedProjectId || draggedProjectId === targetProjectId) return
    
    e.preventDefault()
    setDragOverProjectId(null)

    const base = (localProjects ?? sortedProjects)
    const draggedIndex = base.findIndex(p => p.id === draggedProjectId)
    const targetIndex = base.findIndex(p => p.id === targetProjectId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // 새로운 순서 계산
    const newProjects = [...base]
    const [draggedProject] = newProjects.splice(draggedIndex, 1)
    newProjects.splice(targetIndex, 0, draggedProject)

    // display_order 업데이트 (같은 지사 내에서만)
    const managingBranch = draggedProject.managing_branch
    const sameBranchProjects = newProjects.filter(p => p.managing_branch === managingBranch)
    
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('인증 토큰이 없습니다.')
      }

      // 각 프로젝트의 display_order 업데이트
      const updatePromises = sameBranchProjects.map(async (project, index) => {
        const newOrder = index + 1
        console.log(`프로젝트 ${project.project_name}의 display_order를 ${newOrder}로 업데이트 중...`)
        
        const response = await fetch(`/api/projects/${project.id}/order`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ display_order: newOrder })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error(`프로젝트 ${project.project_name} 업데이트 실패:`, response.status, errorData)
          throw new Error(`프로젝트 ${project.project_name} 업데이트 실패: ${response.status}`)
        }

        const result = await response.json()
        console.log(`프로젝트 ${project.project_name} 업데이트 성공:`, result)
        return result
      })

      const results = await Promise.all(updatePromises)
      console.log('모든 프로젝트 순서 업데이트 완료:', results)
      // ✅ 아이폰 방식: 저장돼도 편집모드 유지 (리로드/종료 없음)
    } catch (error) {
      console.error('순서 업데이트 실패:', error)
      alert(`순서 변경에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}. 다시 시도해주세요.`)
    }
  }, [isEditMode, draggedProjectId, localProjects, sortedProjects])

  // ===== 모바일(터치) 편집모드 드래그 정렬 지원 (ProjectCardsGrid 버전) =====
  useEffect(() => {
    if (!isEditMode) return

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (!draggedProjectId) return
      e.preventDefault()

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const cardEl = el?.closest?.('[data-project-card="true"]') as HTMLElement | null
      const targetId = cardEl?.getAttribute('data-project-id')
      if (!targetId || targetId === draggedProjectId) return

      setDragOverProjectId(targetId)

      const base = (localProjects ?? sortedProjects)
      const draggedIndex = base.findIndex(p => p.id === draggedProjectId)
      const targetIndex = base.findIndex(p => p.id === targetId)
      if (draggedIndex === -1 || targetIndex === -1) return

      const draggedProject = base[draggedIndex]
      const targetProject = base[targetIndex]
      if (draggedProject.managing_branch !== targetProject.managing_branch) return

      const next = [...base]
      const [picked] = next.splice(draggedIndex, 1)
      next.splice(targetIndex, 0, picked)
      setLocalProjects(next)
    }

    const handlePointerUp = async (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (!draggedProjectId) return

      const draggedId = draggedProjectId
      setDragOverProjectId(null)
      setDraggedProjectId(null)

      const base = (localProjects ?? sortedProjects)
      const draggedProject = base.find(p => p.id === draggedId)
      const branch = draggedProject?.managing_branch
      if (!branch) return

      const sameBranchProjects = base.filter(p => p.managing_branch === branch)

      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('인증 토큰이 없습니다.')

        const updatePromises = sameBranchProjects.map(async (project, index) => {
          const newOrder = index + 1
          console.log(`[touch-grid] 프로젝트 ${project.project_name}의 display_order를 ${newOrder}로 업데이트 중...`)
          const response = await fetch(`/api/projects/${project.id}/order`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ display_order: newOrder })
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error(`[touch-grid] 프로젝트 ${project.project_name} 업데이트 실패:`, response.status, errorData)
            throw new Error(`[touch-grid] 프로젝트 ${project.project_name} 업데이트 실패: ${response.status}`)
          }
          const result = await response.json()
          console.log(`[touch-grid] 프로젝트 ${project.project_name} 업데이트 성공:`, result)
          return result
        })

        const results = await Promise.all(updatePromises)
        console.log('[touch-grid] 모든 프로젝트 순서 업데이트 완료:', results)
      } catch (error) {
        console.error('[touch-grid] 순서 업데이트 실패:', error)
        alert(`순서 변경에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}. 다시 시도해주세요.`)
      }
    }

    document.addEventListener('pointermove', handlePointerMove, { passive: false })
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove as any)
      document.removeEventListener('pointerup', handlePointerUp as any)
      document.removeEventListener('pointercancel', handlePointerUp as any)
    }
  }, [isEditMode, draggedProjectId, localProjects, sortedProjects])

  return (
    <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {displayProjects.map((project: Project, index: number) => (
        <ProjectCard
          key={project.id}
          project={project}
          onClick={isEditMode ? undefined : onProjectClick}
          onEdit={isEditMode ? undefined : onProjectEdit}
          onDelete={isEditMode ? undefined : onProjectDelete}
          onStatusChange={isEditMode ? undefined : onProjectStatusChange}
          onHandover={isEditMode ? undefined : onProjectHandover}
          canEditQuarters={isEditMode ? false : canEditQuarters}
          onIsActiveChange={isEditMode ? undefined : onProjectIsActiveJsonChange}
          isEditMode={isEditMode}
          displayOrder={getDisplayOrder(project, index)}
          onLongPressStart={handleLongPressStart}
          onLongPressEnd={handleLongPressEnd}
          onDragStart={() => handleDragStart(project.id)}
          onDragOver={(e) => handleDragOver(e, project.id)}
          onDragEnd={handleDragEnd}
          onDrop={(e) => handleDrop(e, project.id)}
          isDragging={draggedProjectId === project.id}
          isDragOver={dragOverProjectId === project.id}
          hqPendingCount={hqPendingCounts?.[project.id]}
        />
      ))}
    </div>
  )
}

export default ProjectCardsGrid


