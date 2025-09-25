'use client'

import React from 'react'
import { Building, Plus } from 'lucide-react'
import ProjectCard from '@/components/project/ProjectCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import type { Project } from '@/lib/projects'

interface ContractorDashboardProps {
  loading: boolean
  error: string
  projects: Project[]
  userRole?: string
  onRetry: () => void
  onSiteRegistration: () => void
  onProjectClick: (project: Project) => void
  onProjectEdit: (project: Project) => void
  onProjectDelete: (project: Project) => Promise<void> | void
  onProjectStatusChange: (project: Project, isActive: boolean) => void
  onProjectHandover: (project: Project) => void
  onProjectIsActiveJsonChange: (project: Project, json: { q1: boolean; q2: boolean; q3: boolean; q4: boolean; completed: boolean }) => void
}

const ContractorDashboard: React.FC<ContractorDashboardProps> = ({
  loading,
  error,
  projects,
  userRole,
  onRetry,
  onSiteRegistration,
  onProjectClick,
  onProjectEdit,
  onProjectDelete,
  onProjectStatusChange,
  onProjectHandover,
  onProjectIsActiveJsonChange
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

  if (projects.length === 0) {
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
          <p className="text-gray-600 mb-6">
            새로운 현장을 등록하여 안전관리를 시작하세요.
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
    <div>
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
    </div>
  )
}

export default ContractorDashboard


