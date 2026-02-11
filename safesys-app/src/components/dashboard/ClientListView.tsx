'use client'

import React, { useMemo, useState } from 'react'
import { Building, ChevronDown, ChevronUp } from 'lucide-react'
import ProjectCardsGrid from '@/components/dashboard/ProjectCardsGrid'
import type { Project } from '@/lib/projects'

interface ClientListViewProps {
  projects: Project[]
  filteredProjects: Project[]
  userRole?: string
  canEditQuarters?: boolean
  selectedHq: string
  selectedBranch: string
  onProjectClick: (project: Project) => void
  onProjectEdit: (project: Project) => void
  onProjectDelete: (project: Project) => Promise<void> | void
  onProjectStatusChange: (project: Project, isActive: boolean) => void
  onProjectHandover: (project: Project) => void
  onProjectIsActiveJsonChange: (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
  isHeadOfficeUser?: boolean  // 본사 소속 사용자 여부
}

const ClientListView: React.FC<ClientListViewProps> = ({
  projects,
  filteredProjects,
  userRole,
  canEditQuarters = false,
  selectedHq,
  selectedBranch,
  onProjectClick,
  onProjectEdit,
  onProjectDelete,
  onProjectStatusChange,
  onProjectHandover,
  onProjectIsActiveJsonChange,
  isHeadOfficeUser = false
}) => {
  // 펼치기/접기 상태 관리
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // 본사 사용자인 경우 본부별로, 본부 사용자인 경우 지사별로 그룹화
  const groupedProjects = useMemo(() => {
    // display_order로 정렬하는 헬퍼 함수
    const sortByDisplayOrder = (projects: Project[]): Project[] => {
      return [...projects].sort((a, b) => {
        const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
        const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.project_name.localeCompare(b.project_name, 'ko-KR')
      })
    }

    if (selectedHq && selectedBranch) {
      // 특정 지사가 선택된 경우 그룹화 없이 반환 (정렬 적용)
      return { '': sortByDisplayOrder(filteredProjects) }
    }

    if (isHeadOfficeUser && !selectedHq) {
      // 본사 사용자: 본부별로 그룹화
      const grouped: { [key: string]: Project[] } = {}
      filteredProjects.forEach(project => {
        const hq = project.managing_hq || '미지정'
        if (!grouped[hq]) {
          grouped[hq] = []
        }
        grouped[hq].push(project)
      })
      // 각 그룹을 display_order로 정렬
      Object.keys(grouped).forEach(key => {
        grouped[key] = sortByDisplayOrder(grouped[key])
      })
      return grouped
    }

    if (selectedHq && !selectedBranch) {
      // 본부 사용자: 지사별로 그룹화
      const grouped: { [key: string]: Project[] } = {}
      filteredProjects.forEach(project => {
        const branch = project.managing_branch || '미지정'
        if (!grouped[branch]) {
          grouped[branch] = []
        }
        grouped[branch].push(project)
      })
      // 각 그룹을 display_order로 정렬
      Object.keys(grouped).forEach(key => {
        grouped[key] = sortByDisplayOrder(grouped[key])
      })
      return grouped
    }

    // 그 외의 경우 그룹화 없이 반환 (정렬 적용)
    return { '': sortByDisplayOrder(filteredProjects) }
  }, [filteredProjects, isHeadOfficeUser, selectedHq, selectedBranch])

  // 그룹 펼치기/접기 토글
  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupName)) {
        newSet.delete(groupName)
      } else {
        newSet.add(groupName)
      }
      return newSet
    })
  }

  if (filteredProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            현장이 등록되어 있지 않습니다
          </h3>
          <p className="text-gray-600">
            선택한 조건에 해당하는 현장이 없습니다.
          </p>
        </div>
      </div>
    )
  }

  // 그룹화 없이 표시 (필터 적용 시 또는 본사가 아닌 경우)
  if (Object.keys(groupedProjects).length === 1 && groupedProjects['']) {
    return (
      <ProjectCardsGrid
        projects={filteredProjects}
        userRole={userRole}
        canEditQuarters={canEditQuarters}
        onProjectClick={onProjectClick}
        onProjectEdit={onProjectEdit}
        onProjectDelete={onProjectDelete}
        onProjectStatusChange={onProjectStatusChange}
        onProjectHandover={onProjectHandover}
        onProjectIsActiveJsonChange={onProjectIsActiveJsonChange}
      />
    )
  }

  // 본부별/지사별 그룹화해서 표시
  return (
    <div className="space-y-8">
      {Object.entries(groupedProjects)
        .sort(([a], [b]) => {
          // '본사'를 맨 위로
          if (a === '본사') return -1
          if (b === '본사') return 1
          // 나머지는 가나다순
          return a.localeCompare(b, 'ko-KR')
        })
        .map(([groupName, groupProjects]) => {
          const isCollapsed = collapsedGroups.has(groupName)

          return (
            <div key={groupName} className="space-y-3">
              <div
                className="flex items-center gap-2 border-b border-gray-200 pb-2 cursor-pointer hover:bg-gray-50 transition-colors px-2 py-1 rounded-t"
                onClick={() => toggleGroup(groupName)}
              >
                <Building className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 flex-1">
                  {groupName} ({groupProjects.length})
                </h3>
                {isCollapsed ? (
                  <ChevronDown className="h-5 w-5 text-gray-600" />
                ) : (
                  <ChevronUp className="h-5 w-5 text-gray-600" />
                )}
              </div>
              {!isCollapsed && (
                <ProjectCardsGrid
                  projects={groupProjects}
                  userRole={userRole}
                  canEditQuarters={canEditQuarters}
                  onProjectClick={onProjectClick}
                  onProjectEdit={onProjectEdit}
                  onProjectDelete={onProjectDelete}
                  onProjectStatusChange={onProjectStatusChange}
                  onProjectHandover={onProjectHandover}
                  onProjectIsActiveJsonChange={onProjectIsActiveJsonChange}
                />
              )}
            </div>
          )
        })}
    </div>
  )
}

export default ClientListView


