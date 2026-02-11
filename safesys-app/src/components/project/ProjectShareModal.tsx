'use client'

import React, { useEffect, useState } from 'react'
import { X, Mail, Share2, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react'
import type { Project } from '@/lib/projects'
import { shareProject, getProjectShares, revokeProjectShare, type ProjectShare } from '@/lib/projects'
import { supabase } from '@/lib/supabase'

interface ProjectShareModalProps {
  isOpen: boolean
  project: Project | null
  onClose: () => void
  onSuccess?: () => void
  // 현재 사용자 역할: '발주청' 사용자는 '시공사', '감리단'에게만 공유 가능 (발주청에게는 공유 불가)
  currentUserRole?: string
}

const ProjectShareModal: React.FC<ProjectShareModalProps> = ({ isOpen, project, onClose, onSuccess, currentUserRole }) => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'invalid'>('idle')
  const [shares, setShares] = useState<ProjectShare[]>([])
  const [sharesLoading, setSharesLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

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
          .select('id, role')
          .eq('email', trimmed)
          .limit(1)

        if (queryError) {
          setEmailStatus('not_found')
        } else if (Array.isArray(data) && data.length > 0) {
          // 발주청 사용자는 시공사, 감리단에게만 공유 가능 (발주청에게는 공유 불가)
          if (currentUserRole === '발주청' && data[0].role === '발주청') {
            setEmailStatus('not_found')
            setError('발주청 사용자에게는 공유할 수 없습니다. 시공사 또는 감리단 사용자에게만 공유 가능합니다.')
          } else {
            setEmailStatus('exists')
          }
        } else {
          setEmailStatus('not_found')
        }
      } catch {
        setEmailStatus('not_found')
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [email])

  // 공유 목록 로드
  useEffect(() => {
    if (isOpen && project) {
      loadShares()
    }
  }, [isOpen, project])

  const loadShares = async () => {
    if (!project) return
    setSharesLoading(true)
    try {
      const result = await getProjectShares(project.id)
      if (result.success && result.shares) {
        setShares(result.shares)
      }
    } catch (err) {
      console.error('Load shares error:', err)
    } finally {
      setSharesLoading(false)
    }
  }

  if (!isOpen || !project) return null

  const handleClose = () => {
    if (loading) return
    setEmail('')
    setError('')
    setShares([])
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmed = email.trim()
    if (!trimmed) {
      setError('공유할 대상의 이메일을 입력해주세요.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('유효한 이메일 형식이 아닙니다.')
      return
    }

    if (emailStatus === 'not_found' || emailStatus === 'invalid') {
      setError('해당 이메일의 사용자를 찾을 수 없습니다.')
      return
    }

    setLoading(true)
    try {
      const res = await shareProject(project.id, trimmed)
      if (!res.success) {
        throw new Error(res.error || '공유 실패')
      }
      setEmail('')
      setEmailStatus('idle')
      await loadShares()
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setError(err.message || '공유 처리 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (shareId: string) => {
    setRevokingId(shareId)
    try {
      const res = await revokeProjectShare(shareId)
      if (res.success) {
        setShares(prev => prev.filter(s => s.id !== shareId))
        if (onSuccess) onSuccess()
      } else {
        alert(res.error || '공유 취소에 실패했습니다.')
      }
    } catch {
      alert('공유 취소 중 오류가 발생했습니다.')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <Share2 className="h-6 w-6 text-green-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">프로젝트 공유</h3>
          </div>
          <button onClick={handleClose} disabled={loading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-6 space-y-5">
          <div>
            <p className="text-sm text-gray-600 mb-2">다음 프로젝트를 다른 사용자에게 공유합니다:</p>
            {/* 발주청 사용자에게는 시공사/감리단만 공유 가능하다는 안내 표시 */}
            {currentUserRole === '발주청' && (
              <p className="text-xs text-amber-600 mb-2">※ 시공사, 감리단 사용자에게만 공유할 수 있습니다.</p>
            )}
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="font-medium text-gray-900">{project.project_name}</p>
              <p className="text-sm text-gray-600 mt-1">{project.managing_hq} &bull; {project.managing_branch}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <label htmlFor="share-email" className="block text-sm font-medium text-gray-700 mb-2">공유 대상 이메일</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="share-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-sm"
                disabled={loading}
                autoComplete="off"
              />
              <div className="absolute right-3 top-2.5 h-6 w-6 flex items-center justify-center">
                {emailStatus === 'checking' && <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />}
                {emailStatus === 'exists' && <CheckCircle className="h-5 w-5 text-green-600" />}
                {emailStatus === 'not_found' && <XCircle className="h-5 w-5 text-red-500" />}
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="flex justify-end mt-3">
              <button
                type="submit"
                disabled={loading || emailStatus !== 'exists'}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '공유 중...' : '공유하기'}
              </button>
            </div>
          </form>

          {/* 공유 목록 */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">공유 대상자 목록</h4>
            {sharesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">공유된 사용자가 없습니다.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {shares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {share.user_profiles?.full_name || '알 수 없음'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {share.user_profiles?.email || ''} {share.user_profiles?.company_name ? `(${share.user_profiles.company_name})` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevoke(share.id)}
                      disabled={revokingId === share.id}
                      className="ml-2 p-1 text-gray-400 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
                      title="공유 취소"
                    >
                      {revokingId === share.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectShareModal
