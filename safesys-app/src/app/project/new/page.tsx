'use client'

import React, { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import ProjectRegistrationForm from '@/components/project/ProjectRegistrationForm'
import { ArrowLeft, Building } from 'lucide-react'
import PWAInstallButtonHeader from '@/components/common/PWAInstallButtonHeader'

export default function NewProjectPage() {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()

  // 로그인하지 않은 사용자는 로그인 페이지로 리디렉션
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // 로딩 중이면 로딩 스피너 표시
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // 로그인하지 않은 사용자는 로딩 표시
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // 발주청도 프로젝트 생성 가능
  // 권한 제한 제거

  const handleBack = () => {
    router.push('/')
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Building className="h-6 w-6 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">현장 등록</h1>
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
      <main className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
        <div className="px-4 py-6 sm:px-0 lg:px-0">
        <div className="bg-white shadow-sm rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">새 현장 등록</h2>
            <p className="mt-1 text-sm text-gray-600">
              새로운 건설 현장의 정보를 입력해주세요.
            </p>
          </div>
          
          <div className="px-6 py-4">
            <ProjectRegistrationForm />
          </div>
        </div>
        </div>
      </main>
    </div>
  )
} 