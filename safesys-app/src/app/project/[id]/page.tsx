'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Building, Phone } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import DocumentFolder from '@/components/project/DocumentFolder'
import HeatWaveCheckModal from '@/components/project/HeatWaveCheckModal'
import PWAInstallButtonHeader from '@/components/common/PWAInstallButtonHeader'

export default function ProjectDetailPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [creatorProfile, setCreatorProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isHeatWaveModalOpen, setIsHeatWaveModalOpen] = useState(false)

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

      // 프로젝트 생성인의 프로필 정보 조회
      if (data.created_by) {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', data.created_by)
          .single()

        if (!profileError && profileData) {
          setCreatorProfile(profileData)
        }
      }
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err)
      setError(err.message || '프로젝트를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    router.push('/')
  }

  const handleHeatWaveCheck = () => {
    setIsHeatWaveModalOpen(true)
  }

  const handleCloseHeatWaveModal = () => {
    setIsHeatWaveModalOpen(false)
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

  // 에러 발생
  if (error) {
    return (
      <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">프로젝트 상세</h1>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
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
      <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">프로젝트 상세</h1>
            </div>
          </div>
        </header>
        
        <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
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
              <div className="flex items-center flex-1 min-w-0">
                <button
                  onClick={handleBack}
                  className="mr-2 lg:mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 flex-shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Building className="h-6 w-6 text-blue-600 mr-2 lg:mr-3 flex-shrink-0" />
                <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">{project.project_name}</h1>
              </div>
              <div className="flex items-center space-x-2 lg:space-x-4">
                {/* PWA 설치 버튼 */}
                <PWAInstallButtonHeader />
                
                <div className="text-xs lg:text-sm text-gray-700 flex-shrink-0">
                  <span className="font-medium hidden sm:inline">{userProfile?.full_name}</span>
                  <span className="text-gray-500">({userProfile?.role})</span>
                </div>
              </div>
            </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
        <div className="px-4 py-6 sm:px-0 lg:px-0">
        {/* 프로젝트 정보 */}
        <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="space-y-4">
            {/* 프로젝트명 */}
            <div className="text-sm text-gray-600">
              {project.project_name} / {project.managing_hq} / {project.managing_branch} / {project.site_address}
              {project.site_address_detail && (
                <span className="text-gray-500"> ({project.site_address_detail})</span>
              )}
            </div>
            
            {/* 생성인 정보 */}
            {creatorProfile && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <span>{creatorProfile.company_name || '미입력'} / {creatorProfile.full_name || '미입력'}</span>
                  {creatorProfile.phone_number && (
                    <>
                      <span>/</span>
                      <Phone className="h-4 w-4 text-gray-500" />
                      <a 
                        href={`tel:${creatorProfile.phone_number}`}
                        className="text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                      >
                        {creatorProfile.phone_number}
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 문서철 그리드 */}
        <div className="flex justify-center">
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {/* 폭염대비 점검 문서철 */}
            <DocumentFolder
              title="폭염대비점검"
              year="2025"
              isActive={false}
              projectId={projectId}
              isProjectActive={project.is_active !== false}
            />
            
            {/* 일일안전교육(TBM일지) 문서철 */}
            <DocumentFolder
              title="일일안전교육
︵TBM일지︶"
              year="2025"
              isActive={false}
              externalUrl="https://krctbmform.netlify.app/"
              isProjectActive={project.is_active !== false}
            />
            
            {/* 안전서류 점검 문서철 */}
            <DocumentFolder
              title="안전서류
점검"
              year="2025"
              isActive={false}
              externalUrl="https://krcsafedocu.vercel.app/"
            />
            
            {/* 시공서류 점검 문서철 */}
            <DocumentFolder
              title="시공서류
점검"
              year="2025"
              isActive={false}
              externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSdY1beSxNGj6niH6_jG7onccyQsUoIBfldYbIWsbMkc7VoQKA/viewform"
            />
            
            {/* 품질서류 점검 문서철 */}
            <DocumentFolder
              title="품질서류
점검"
              year="2025"
              isActive={false}
              externalUrl="https://docs.google.com/forms/d/e/1FAIpQLSeSTpnRsOBiy0myufl0itGdeDeVzfkYWeybqBhR7ThDef5HHw/viewform"
            />
            
            {/* 관리자 일상점검 문서철 - 00지사인 경우에만 표시 */}
            {project?.managing_branch?.endsWith('지사') && (
              <DocumentFolder
                title="관리자 일상점검"
                year="2025"
                isActive={false}
                projectId={projectId}
                projectName={project?.project_name}
                managingBranch={project?.managing_branch}
                onClick={() => router.push(`/project/${projectId}/manager-inspection`)}
              />
            )}
            
            {/* 본부 불시점검 문서철 - 모든 프로젝트에 표시 */}
            <DocumentFolder
              title="본부 불시점검"
              year="2025"
              isActive={false}
              projectId={projectId}
              projectName={project?.project_name}
              managingBranch={project?.managing_branch}
              onClick={() => router.push(`/project/${projectId}/headquarters-inspection`)}
            />
            
            {/* 빈 문서철들 - 개수를 1개 줄임 */}
            {Array.from({ length: 1 }, (_, index) => (
              <DocumentFolder
                key={index}
                title=""
                year="2025"
                isActive={false}
                onClick={() => {}}
              />
            ))}
          </div>
        </div>
        </div>
      </main>

      {/* 폭염대비 점검 모달 */}
      {project && (
        <HeatWaveCheckModal
          isOpen={isHeatWaveModalOpen}
          onClose={handleCloseHeatWaveModal}
          project={project}
        />
      )}


    </div>
  )
} 