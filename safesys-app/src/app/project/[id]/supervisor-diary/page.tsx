'use client'

import React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function SupervisorDiaryPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const handleBack = () => {
    router.push(`/project/${projectId}`)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

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
            <h1 className="text-xl font-bold text-gray-900">︵AI︶공사감독 일지</h1>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl lg:max-w-none mx-auto py-6 sm:px-6 lg:px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-gray-500 text-lg mb-4">
            준비중입니다.
          </div>
          <p className="text-gray-400">
            곧 서비스를 이용하실 수 있습니다.
          </p>
        </div>
      </main>
    </div>
  )
}
