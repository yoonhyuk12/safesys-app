'use client'

import React, { useState, useEffect } from 'react'
import { X, Save, User, Building, Phone, UserCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PasswordChangeModal from './PasswordChangeModal'

interface ProfileEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { userProfile, refreshProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    position: '',
    role: '발주청',
    hq_division: '',
    branch_division: '',
    company_name: ''
  })
  const [availableBranches, setAvailableBranches] = useState<string[]>([])

  // 모달이 열릴 때 현재 프로필 정보로 폼 초기화
  useEffect(() => {
    if (isOpen && userProfile) {
      setFormData({
        full_name: userProfile.full_name || '',
        phone_number: userProfile.phone_number || '',
        position: userProfile.position || '',
        role: userProfile.role || '발주청',
        hq_division: userProfile.hq_division || '',
        branch_division: userProfile.branch_division || '',
        company_name: userProfile.company_name || ''
      })
      setError('')
    }
  }, [isOpen, userProfile])

  // 본부 선택 시 지사 목록 업데이트
  useEffect(() => {
    if (formData.hq_division) {
      setAvailableBranches(BRANCH_OPTIONS[formData.hq_division] || [])
      // 현재 선택된 지사가 새로운 본부의 지사 목록에 없는 경우 초기화
      if (!BRANCH_OPTIONS[formData.hq_division]?.includes(formData.branch_division)) {
        setFormData(prev => ({
          ...prev,
          branch_division: ''
        }))
      }
    } else {
      setAvailableBranches([])
    }
  }, [formData.hq_division])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // 발주청이 아닌 경우 본부/지사 정보 초기화
      ...(name === 'role' && value !== '발주청' ? {
        hq_division: '',
        branch_division: ''
      } : {})
    }))
  }

  // 전화번호 포맷팅 함수
  const formatPhoneNumber = (value: string) => {
    // 숫자만 추출
    const numbers = value.replace(/[^\d]/g, '')
    
    // 길이에 따라 포맷팅
    if (numbers.length <= 3) {
      return numbers
    } else if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    } else {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
    }
  }

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedNumber = formatPhoneNumber(e.target.value)
    setFormData(prev => ({
      ...prev,
      phone_number: formattedNumber
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!userProfile?.id) {
      setError('사용자 정보를 찾을 수 없습니다.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          full_name: formData.full_name.trim(),
          phone_number: formData.phone_number.trim(),
          position: formData.position.trim(),
          role: formData.role,
          hq_division: formData.role === '발주청' ? formData.hq_division : null,
          branch_division: formData.role === '발주청' ? formData.branch_division : null,
          company_name: formData.role !== '발주청' ? formData.company_name.trim() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userProfile.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      // 사용자 프로필 새로고침
      await refreshProfile()
      
      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
      alert('프로필이 성공적으로 업데이트되었습니다.')
    } catch (err: any) {
      console.error('프로필 업데이트 실패:', err)
      setError(err.message || '프로필 업데이트에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <User className="h-5 w-5 mr-2" />
            프로필 수정
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 폼 */}
        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 이름 */}
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                <UserCircle className="h-4 w-4 inline mr-1" />
                이름 *
              </label>
              <input
                type="text"
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="이름을 입력하세요"
                required
                disabled={loading}
              />
            </div>

            {/* 전화번호 */}
            <div>
              <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-1">
                <Phone className="h-4 w-4 inline mr-1" />
                전화번호 *
              </label>
              <input
                type="tel"
                id="phone_number"
                name="phone_number"
                value={formData.phone_number}
                onChange={handlePhoneNumberChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="010-1234-5678"
                maxLength={13}
                required
                disabled={loading}
              />
            </div>

            {/* 직급 */}
            <div>
              <label htmlFor="position" className="block text-sm font-medium text-gray-700 mb-1">
                <UserCircle className="h-4 w-4 inline mr-1" />
                직급 *
              </label>
              <input
                type="text"
                id="position"
                name="position"
                value={formData.position}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="직급을 입력하세요"
                required
                disabled={loading}
              />
            </div>

            {/* 역할 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">역할 *</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    role: '발주청',
                    ...(prev.role !== '발주청' ? {
                      hq_division: '',
                      branch_division: ''
                    } : {})
                  }))}
                  className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                    formData.role === '발주청'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  disabled={loading}
                >
                  발주청
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    role: '감리단',
                    hq_division: '',
                    branch_division: ''
                  }))}
                  className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                    formData.role === '감리단'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  disabled={loading}
                >
                  감리단
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    role: '시공사',
                    hq_division: '',
                    branch_division: ''
                  }))}
                  className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                    formData.role === '시공사'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  disabled={loading}
                >
                  시공사
                </button>
              </div>
            </div>

            {/* 발주청인 경우에만 본부/지사 입력 표시 */}
            {formData.role === '발주청' && (
              <>
                {/* 본부 선택 */}
                <div>
                  <label htmlFor="hq_division" className="block text-sm font-medium text-gray-700 mb-1">
                    <Building className="h-4 w-4 inline mr-1" />
                    소속 본부 *
                  </label>
                  <select
                    id="hq_division"
                    name="hq_division"
                    value={formData.hq_division}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={loading}
                  >
                    <option value="">본부를 선택하세요</option>
                    {HEADQUARTERS_OPTIONS.map((hq) => (
                      <option key={hq} value={hq}>{hq}</option>
                    ))}
                  </select>
                </div>

                {/* 지사 선택 */}
                <div>
                  <label htmlFor="branch_division" className="block text-sm font-medium text-gray-700 mb-1">
                    <Building className="h-4 w-4 inline mr-1" />
                    소속 지사 *
                  </label>
                  <select
                    id="branch_division"
                    name="branch_division"
                    value={formData.branch_division}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    disabled={!formData.hq_division || loading}
                  >
                    <option value="">지사를 선택하세요</option>
                    {availableBranches.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* 회사명 입력 - 발주청이 아닌 경우에만 표시 */}
            {formData.role !== '발주청' && (
              <div>
                <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
                  <Building className="h-4 w-4 inline mr-1" />
                  회사명 *
                </label>
                <input
                  type="text"
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="회사명을 입력하세요"
                  required
                  disabled={loading}
                />
              </div>
            )}

            {/* 버튼 */}
            <div className="flex justify-between items-center pt-4">
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-yellow-100 hover:bg-yellow-200 rounded-md transition-colors"
                disabled={loading}
              >
                비밀번호 변경
              </button>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  disabled={loading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">저장 중...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      저장
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      
      {/* 비밀번호 변경 모달 */}
      <PasswordChangeModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          setShowPasswordModal(false)
        }}
      />
    </div>
  )
}

export default ProfileEditModal