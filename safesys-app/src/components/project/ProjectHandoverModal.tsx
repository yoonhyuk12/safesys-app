'use client'

import React, { useEffect, useState } from 'react'
import { X, Mail, UserCheck, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { Project } from '@/lib/projects'
import { transferProjectOwnership } from '@/lib/projects'
import { supabase } from '@/lib/supabase'

interface ProjectHandoverModalProps {
  isOpen: boolean
  project: Project | null
  onClose: () => void
  onSuccess?: () => void
}

const ProjectHandoverModal: React.FC<ProjectHandoverModalProps> = ({ isOpen, project, onClose, onSuccess }) => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'invalid'>('idle')

  // 이메일 존재 확인 (디바운스)
  useEffect(() => {
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setEmailStatus('idle')
      return
    }
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    if (!isValid) {
      setEmailStatus('invalid')
      return
    }

    setEmailStatus('checking')
    const timer = setTimeout(async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('email', trimmed)
          .limit(1)

        if (queryError) {
          console.error('Email check error:', queryError)
          setEmailStatus('not_found')
        } else {
          setEmailStatus(Array.isArray(data) && data.length > 0 ? 'exists' : 'not_found')
        }
      } catch (e) {
        console.error('Email check exception:', e)
        setEmailStatus('not_found')
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [email])

  if (!isOpen || !project) return null

  const handleClose = () => {
    if (loading) return
    setEmail('')
    setError('')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmed = email.trim()
    if (!trimmed) {
      setError('인계 받을 분의 이메일을 입력해주세요.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('유효한 이메일 형식이 아닙니다.')
      return
    }

    // 사전 존재 확인
    if (emailStatus === 'not_found' || emailStatus === 'invalid') {
      setError('해당 이메일의 사용자를 찾을 수 없습니다.')
      return
    }

    setLoading(true)
    try {
      const res = await transferProjectOwnership(project.id, trimmed)
      if (!res.success) {
        throw new Error(res.error || '인계 실패')
      }
      if (onSuccess) onSuccess()
      alert('프로젝트를 인계했습니다.')
      handleClose()
    } catch (err: any) {
      console.error('handover error:', err)
      setError(err.message || '인계 처리 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <UserCheck className="h-6 w-6 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">프로젝트 인계</h3>
          </div>
          <button onClick={handleClose} disabled={loading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 내용 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <p className="text-sm text-gray-600 mb-2">다음 프로젝트를 다른 사용자에게 인계합니다:</p>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="font-medium text-gray-900">{project.project_name}</p>
              <p className="text-sm text-gray-600 mt-1">{project.managing_hq} • {project.managing_branch}</p>
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">인계 받을 이메일</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                disabled={loading}
                autoComplete="off"
              />
              {/* 이메일 상태 아이콘 */}
              <div className="absolute right-3 top-2.5 h-6 w-6 flex items-center justify-center">
                {emailStatus === 'checking' && (
                  <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                )}
                {emailStatus === 'exists' && (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
                {emailStatus === 'not_found' && (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <p className="mt-2 text-xs text-gray-500">인계 대상자는 시스템에 가입되어 있어야 합니다.</p>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '인계 중...' : '인계하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectHandoverModal


