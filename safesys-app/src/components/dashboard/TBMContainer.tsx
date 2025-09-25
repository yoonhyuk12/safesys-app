'use client'

import React from 'react'
import TBMStatus from '@/components/project/TBMStatus'
import type { Project } from '@/lib/projects'

interface TBMContainerProps {
  projects: Project[]
  selectedHq: string
  selectedBranch: string
  onProjectClick: (project: any) => void
  onBranchSelect: (branchName: string) => void
  onHqSelect: (hqName: string) => void
}

const TBMContainer: React.FC<TBMContainerProps> = ({
  projects,
  selectedHq,
  selectedBranch,
  onProjectClick,
  onBranchSelect,
  onHqSelect
}) => {
  return (
    <TBMStatus
      projects={projects}
      selectedHq={selectedHq}
      selectedBranch={selectedBranch}
      onProjectClick={onProjectClick}
      onBranchSelect={onBranchSelect}
      onHqSelect={onHqSelect}
    />
  )
}

export default TBMContainer


