'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'
import { updateProject } from '@/lib/projects'
import { Project } from '@/lib/projects'
import { Building, Save, MapPin } from 'lucide-react'
import VworldAddressSearch from '@/components/ui/VworldAddressSearch'

interface FormData {
  project_name: string
  managing_hq: string
  managing_branch: string
  site_address: string
  site_address_detail: string
  latitude?: number
  longitude?: number
}

interface ProjectEditFormProps {
  project: Project
}

const ProjectEditForm: React.FC<ProjectEditFormProps> = ({ project }) => {
  const router = useRouter()
  const { user, userProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState<FormData>({
    project_name: project.project_name || '',
    managing_hq: project.managing_hq || '',
    managing_branch: project.managing_branch || '',
    site_address: project.site_address || '',
    site_address_detail: project.site_address_detail || '',
    latitude: project.latitude || undefined,
    longitude: project.longitude || undefined
  })

  // 선택된 본부에 따른 지사 옵션 필터링
  const filteredBranches = formData.managing_hq 
    ? BRANCH_OPTIONS[formData.managing_hq] || []
    : []

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    
    if (name === 'managing_hq') {
      // 본부가 변경되면 지사 초기화
      setFormData(prev => ({
        ...prev,
        [name]: value,
        managing_branch: ''
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  const handleAddressSelect = (address: string, roadAddress: string, coords?: {lat: number, lng: number}) => {
    setFormData(prev => ({
      ...prev,
      site_address: roadAddress || address, // 도로명주소 우선, 없으면 지번주소
      latitude: coords?.lat,
      longitude: coords?.lng
    }))
    
    // 좌표 정보 저장 확인
    if (coords) {
      console.log('선택된 주소 좌표 저장:', coords)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 유효성 검사
    if (!formData.project_name.trim()) {
      setError('사업명을 입력해주세요.')
      setLoading(false)
      return
    }

    if (!formData.managing_hq) {
      setError('관할 본부를 선택해주세요.')
      setLoading(false)
      return
    }

    if (!formData.managing_branch) {
      setError('관할 지사를 선택해주세요.')
      setLoading(false)
      return
    }

    if (!user) {
      setError('로그인이 필요합니다.')
      setLoading(false)
      return
    }

    try {
      await updateProject(project.id, {
        project_name: formData.project_name.trim(),
        managing_hq: formData.managing_hq,
        managing_branch: formData.managing_branch,
        site_address: formData.site_address,
        site_address_detail: formData.site_address_detail.trim(),
        latitude: formData.latitude,
        longitude: formData.longitude
      })

      alert('프로젝트가 성공적으로 수정되었습니다!')
      router.push(`/project/${project.id}`)
    } catch (err: any) {
      console.error('Project update error:', err)
      setError(err.message || '프로젝트 수정에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 오류 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                오류가 발생했습니다
              </h3>
              <div className="mt-2 text-sm text-red-700">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 사업명 */}
      <div>
        <label htmlFor="project_name" className="block text-sm font-medium text-gray-700 mb-2">
          사업명 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Building className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            id="project_name"
            name="project_name"
            value={formData.project_name}
            onChange={handleInputChange}
            placeholder="예: 강남 아파트 건설공사"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={loading}
          />
        </div>
      </div>

      {/* 현장 주소 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          현장 주소
        </label>
        <div className="space-y-3">
          <VworldAddressSearch
            onAddressSelect={handleAddressSelect}
            placeholder="주소를 검색해주세요"
            value={formData.site_address}
            disabled={loading}
          />
          {formData.site_address && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">선택된 주소</p>
                  <p className="text-sm text-blue-700">{formData.site_address}</p>
                </div>
              </div>
            </div>
          )}
          <input
            type="text"
            name="site_address_detail"
            value={formData.site_address_detail}
            onChange={handleInputChange}
            placeholder="상세주소 (동, 호수 등)"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={loading}
          />
        </div>
      </div>

      {/* 관할 본부 */}
      <div>
        <label htmlFor="managing_hq" className="block text-sm font-medium text-gray-700 mb-2">
          관할 본부 <span className="text-red-500">*</span>
        </label>
        <select
          id="managing_hq"
          name="managing_hq"
          value={formData.managing_hq}
          onChange={handleInputChange}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          disabled={loading}
        >
          <option value="">본부를 선택해주세요</option>
          {HEADQUARTERS_OPTIONS.map((hq) => (
            <option key={hq} value={hq}>
              {hq}
            </option>
          ))}
        </select>
      </div>

      {/* 관할 지사 */}
      <div>
        <label htmlFor="managing_branch" className="block text-sm font-medium text-gray-700 mb-2">
          관할 지사 <span className="text-red-500">*</span>
        </label>
        <select
          id="managing_branch"
          name="managing_branch"
          value={formData.managing_branch}
          onChange={handleInputChange}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          disabled={loading || !formData.managing_hq}
        >
          <option value="">
            {formData.managing_hq ? '지사를 선택해주세요' : '먼저 본부를 선택해주세요'}
          </option>
          {filteredBranches.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      </div>

      {/* 수정자 정보 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">수정자 정보</h3>
        <div className="text-sm text-gray-600">
          <div>성명: {userProfile?.full_name}</div>
          <div>역할: {userProfile?.role}</div>
          {userProfile?.company_name && (
            <div>회사명: {userProfile.company_name}</div>
          )}
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={() => router.push('/list')}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          disabled={loading}
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              수정 중...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              프로젝트 수정
            </>
          )}
        </button>
      </div>
    </form>
  )
}

export default ProjectEditForm 