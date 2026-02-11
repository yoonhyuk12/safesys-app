'use client'

import React from 'react'
import TBMStatus from '@/components/project/TBMStatus'
import type { Project } from '@/lib/projects'

interface TBMContainerProps {
  projects: Project[]
  selectedHq: string
  selectedBranch: string
  offices?: any[]
  onProjectClick: (project: any) => void
  onBranchSelect: (branchName: string) => void
  onHqSelect: (hqName: string) => void
  onProgressUpdate?: (percentage: number, timeRemaining: number) => void
  onManualRefreshReady?: (refreshFn: () => Promise<void>) => void
}

const TBMContainer: React.FC<TBMContainerProps> = ({
  projects,
  selectedHq,
  selectedBranch,
  offices = [],
  onProjectClick,
  onBranchSelect,
  onHqSelect,
  onProgressUpdate,
  onManualRefreshReady
}) => {
  return (
    <TBMStatus
      projects={projects}
      selectedHq={selectedHq}
      selectedBranch={selectedBranch}
      offices={offices}
      onProjectClick={onProjectClick}
      onBranchSelect={onBranchSelect}
      onHqSelect={onHqSelect}
      onProgressUpdate={onProgressUpdate}
      onManualRefreshReady={onManualRefreshReady}
    />
  )
}

export default TBMContainer


