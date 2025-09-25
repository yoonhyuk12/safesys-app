'use client'

import React from 'react'
import { Building } from 'lucide-react'
import ProjectCardsGrid from '@/components/dashboard/ProjectCardsGrid'
import type { Project } from '@/lib/projects'

interface ClientListViewProps {
  projects: Project[]
  filteredProjects: Project[]
  userRole?: string
  selectedHq: string
  selectedBranch: string
  onProjectClick: (project: Project) => void
  onProjectEdit: (project: Project) => void
  onProjectDelete: (project: Project) => Promise<void> | void
  onProjectStatusChange: (project: Project, isActive: boolean) => void
  onProjectHandover: (project: Project) => void
  onProjectIsActiveJsonChange: (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
}

const ClientListView: React.FC<ClientListViewProps> = ({
  projects,
  filteredProjects,
  userRole,
  selectedHq,
  selectedBranch,
  onProjectClick,
  onProjectEdit,
  onProjectDelete,
  onProjectStatusChange,
  onProjectHandover,
  onProjectIsActiveJsonChange
}) => {
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

  return (
    <ProjectCardsGrid
      projects={filteredProjects}
      userRole={userRole}
      onProjectClick={onProjectClick}
      onProjectEdit={onProjectEdit}
      onProjectDelete={onProjectDelete}
      onProjectStatusChange={onProjectStatusChange}
      onProjectHandover={onProjectHandover}
      onProjectIsActiveJsonChange={onProjectIsActiveJsonChange}
    />
  )
}

export default ClientListView


