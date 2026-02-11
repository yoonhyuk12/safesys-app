'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Building } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/projects'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ProjectEditForm from '@/components/project/ProjectEditForm'
import PWAInstallButtonHeader from '@/components/common/PWAInstallButtonHeader'

export default function EditProjectPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user && projectId) {
      loadProject()
    }
  }, [user, projectId])

  const loadProject = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) {
        throw new Error(projectError.message)
      }

      if (!data) {
        throw new Error('프로젝트를 찾을 수 없습니다.')
      }

      setProject(data)
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    router.back()
  }

  // 로딩 중
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // 로그인하지 않은 사용자
  if (!user) {
    router.push('/login')
    return null
  }

  // 발주청도 프로젝트 수정 가능
  // 권한 제한 제거

  // 에러 발생
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">프로젝트 수정</h1>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-sm text-red-700">{error}</div>
            <button 
              onClick={loadProject}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              다시 시도
            </button>
          </div>
        </main>
      </div>
    )
  }

  // 프로젝트가 없는 경우
  if (!project) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">프로젝트 수정</h1>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-500">프로젝트를 찾을 수 없습니다.</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Building className="h-6 w-6 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">프로젝트 수정</h1>
            </div>
            <div className="flex items-center space-x-2 lg:space-x-4">
              {/* PWA 설치 버튼 */}
              <PWAInstallButtonHeader />
              
              <div className="text-sm text-gray-700">
                <span className="font-medium">{userProfile?.full_name}</span>
                <span className="ml-2 text-gray-500">({userProfile?.role})</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
        <div className="px-4 py-6 sm:px-0 lg:px-0">
        <div className="bg-white shadow-sm rounded-lg max-w-2xl mx-auto">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">프로젝트 정보 수정</h2>
            <p className="mt-1 text-sm text-gray-600">
              프로젝트 정보를 수정할 수 있습니다.
            </p>
          </div>
          
          <div className="px-6 py-4">
            <ProjectEditForm project={project} onCancel={handleBack} />
          </div>
        </div>
        </div>
      </main>
    </div>
  )
} 