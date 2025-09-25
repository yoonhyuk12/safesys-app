'use client'

import React from 'react'
import ProjectCard from '@/components/project/ProjectCard'
import type { Project } from '@/lib/projects'

interface ProjectCardsGridProps {
  projects: Project[]
  userRole?: string
  onProjectClick: (project: Project) => void
  onProjectEdit: (project: Project) => void
  onProjectDelete: (project: Project) => Promise<void> | void
  onProjectStatusChange: (project: Project, isActive: boolean) => void
  onProjectHandover: (project: Project) => void
  onProjectIsActiveJsonChange: (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
}

const ProjectCardsGrid: React.FC<ProjectCardsGridProps> = ({
  projects,
  userRole,
  onProjectClick,
  onProjectEdit,
  onProjectDelete,
  onProjectStatusChange,
  onProjectHandover,
  onProjectIsActiveJsonChange
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {projects.map((project: Project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onClick={onProjectClick}
          onEdit={onProjectEdit}
          onDelete={onProjectDelete}
          onStatusChange={onProjectStatusChange}
          onHandover={onProjectHandover}
          canEditQuarters={userRole === '발주청'}
          onIsActiveChange={onProjectIsActiveJsonChange}
        />
      ))}
    </div>
  )
}

export default ProjectCardsGrid


