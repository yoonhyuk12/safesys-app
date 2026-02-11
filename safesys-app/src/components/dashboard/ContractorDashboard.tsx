'use client'

import React from 'react'
import { Building, Plus, Share2 } from 'lucide-react'
import ProjectCard from '@/components/project/ProjectCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project } from '@/lib/projects'

interface ContractorDashboardProps {
  loading: boolean
  error: string
  projects: Project[]
  sharedProjects?: Project[]
  userRole?: string
  showQuarters?: boolean
  canEditQuartersForProject?: (project: Project) => boolean
  onRetry: () => void
  onSiteRegistration: () => void
  onProjectClick: (project: Project) => void
  onProjectEdit: (project: Project) => void
  onProjectDelete: (project: Project) => Promise<void> | void
  onProjectStatusChange: (project: Project, isActive: boolean) => void
  onProjectHandover: (project: Project) => void
  onProjectShare?: (project: Project) => void
  onProjectIsActiveJsonChange: (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
  hqPendingCounts?: Record<string, number>
}

const ContractorDashboard: React.FC<ContractorDashboardProps> = ({
  loading,
  error,
  projects,
  sharedProjects = [],
  userRole,
  showQuarters = false,
  canEditQuartersForProject,
  onRetry,
  onSiteRegistration,
  onProjectClick,
  onProjectEdit,
  onProjectDelete,
  onProjectStatusChange,
  onProjectHandover,
  onProjectShare,
  onProjectIsActiveJsonChange,
  hqPendingCounts
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
        <button
          onClick={onRetry}
          className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (projects.length === 0 && sharedProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-center mb-8">
          <Building className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            현장 관리 시스템
          </h2>
          <p className="text-gray-600 max-w-md">
            {userRole === '시공사' ? '시공' : '감리'} 업무를 위한 현장을 등록하고 관리하세요.
          </p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            등록된 현장이 없습니다
          </h3>
          <p className="text-gray-600 mb-4">
            프로젝트를 만들기 전 지사/본부에 생성여부를 물어보세요 (인계 해줌)
          </p>
          <p className="text-gray-600 mb-6">
            없는 경우 직접 등록할 수 있습니다.
          </p>
          <button
            onClick={onSiteRegistration}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            현장 등록
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row">
      {/* 좌측: 내 프로젝트 */}
      <div className="flex-1 min-w-0">
        <div className="mb-4 pb-2 border-b border-white/20 flex items-center">
          <Building className="h-5 w-5 mr-2 text-blue-300" />
          <h3 className="text-base font-bold text-white">내 프로젝트</h3>
          <span className="ml-2 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/20 text-white text-xs font-bold">{projects.length}</span>
        </div>
        {projects.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {projects.map((project: Project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={onProjectClick}
                onEdit={onProjectEdit}
                onDelete={onProjectDelete}
                onStatusChange={onProjectStatusChange}
                onHandover={onProjectHandover}
                onShare={onProjectShare}
                showQuarters={showQuarters}
                canEditQuarters={canEditQuartersForProject ? canEditQuartersForProject(project) : false}
                onIsActiveChange={onProjectIsActiveJsonChange}
                hqPendingCount={hqPendingCounts?.[project.id]}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            등록된 프로젝트가 없습니다
          </div>
        )}
      </div>

      {/* 점선 구분선: 모바일 가로 / 데스크톱 세로 */}
      <div className="my-5 lg:my-0 lg:mx-5 border-b-2 lg:border-b-0 lg:border-l-2 border-dashed border-gray-300 flex-shrink-0" />

      {/* 우측: 공유받은 프로젝트 */}
      <div className="flex-1 min-w-0">
        <div className="mb-4 pb-2 border-b border-white/20 flex items-center">
          <Share2 className="h-5 w-5 mr-2 text-green-400" />
          <h3 className="text-base font-bold text-white">공유받은 프로젝트</h3>
          <span className="ml-2 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/20 text-white text-xs font-bold">{sharedProjects.length}</span>
        </div>
        {sharedProjects.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {sharedProjects.map((project: Project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={onProjectClick}
                isShared={true}
                showQuarters={showQuarters}
                canEditQuarters={canEditQuartersForProject ? canEditQuartersForProject(project) : false}
                onIsActiveChange={onProjectIsActiveJsonChange}
                onStatusChange={onProjectStatusChange}
                hqPendingCount={hqPendingCounts?.[project.id]}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            공유받은 프로젝트가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}

export default ContractorDashboard
