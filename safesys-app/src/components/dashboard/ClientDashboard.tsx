'use client'

import React from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import TBMStatus from '@/components/project/TBMStatus'
import KakaoMap from '@/components/ui/KakaoMap'
import ProjectCard from '@/components/project/ProjectCard'
import type { Project, ProjectWithCoords, HeatWaveCheck, ManagerInspection, HeadquartersInspection } from '@/lib/projects'

// NOTE: 본 컴포넌트는 기존 renderClientDashboard의 거대한 JSX를 그대로 이전하기엔 방대하여,
// 우선 상단 헤더/뷰모드 전환/조건/맵/리스트/안전현황 섹션을 그대로 props로 위임하는 얇은 래퍼로 시작합니다.
// 점진적으로 하위 블록을 더 쪼갤 예정입니다.

interface ClientDashboardProps {
  viewMode: 'tbm' | 'map' | 'list' | 'safety' | 'business'
  loading: boolean
  error: string
  // 상태
  selectedHq: string
  selectedBranch: string
  selectedSafetyCard: string | null
  selectedSafetyBranch: string | null
  selectedDate: string
  selectedQuarter: string
  canSeeAllHq: boolean
  // 데이터
  projects: Project[]
  projectsWithCoords: ProjectWithCoords[]
  heatWaveChecks: HeatWaveCheck[]
  managerInspections: ManagerInspection[]
  headquartersInspections: HeadquartersInspection[]
  // 콜백
  onRetryLoadBranches: () => void
  onProjectClick: (project: Project) => void
  onProjectEdit: (project: Project) => void
  onProjectDelete: (project: Project) => Promise<void> | void
  onProjectStatusChange: (project: Project, isActive: boolean) => void
  onProjectHandover: (project: Project) => void
  onProjectIsActiveJsonChange: (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
  onMapProjectClick: (project: any) => void
  onHeatWaveCheckClick: (check: HeatWaveCheck) => void
  onBranchSelect: (branchName: string) => void
  onHqSelect: (hqName: string) => void
  MapContainerRef: React.RefObject<HTMLDivElement | null>
  mapDynamicHeight: number
  userRole?: string
  Header: React.ReactNode
  Content: React.ReactNode
}

const ClientDashboard: React.FC<ClientDashboardProps> = ({
  loading,
  error,
  Header,
  Content
}) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
        <div className="text-sm text-red-700">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Header}
      {Content}
    </div>
  )
}

export default ClientDashboard


