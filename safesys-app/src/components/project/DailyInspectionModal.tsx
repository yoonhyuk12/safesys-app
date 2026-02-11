'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface DailyInspectionModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project
}

const DailyInspectionModal: React.FC<DailyInspectionModalProps> = ({
  isOpen,
  onClose,
  project
}) => {
  const { user, userProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_name: userProfile?.full_name || '',
  })

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    try {
      setLoading(true)

      const { error } = await supabase
        .from('daily_inspections')
        .insert({
          project_id: project.id,
          inspection_date: formData.inspection_date,
          inspector_name: formData.inspector_name,
          created_by: user.id,
        })

      if (error) throw error

      alert('일일안전점검이 등록되었습니다.')
      onClose()
    } catch (err: any) {
      console.error('점검 등록 실패:', err)
      alert(err.message || '점검 등록에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">일일안전점검 등록</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 프로젝트 정보 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="text-sm text-blue-900">
              <strong>{project.project_name}</strong>
              <div className="text-blue-700 mt-1">
                {project.managing_hq} / {project.managing_branch}
              </div>
            </div>
          </div>

          {/* 점검일 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              점검일 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.inspection_date}
              onChange={(e) => handleChange('inspection_date', e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 점검자 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              점검자 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.inspector_name}
              onChange={(e) => handleChange('inspector_name', e.target.value)}
              required
              placeholder="점검자 이름을 입력하세요"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 버튼 */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default DailyInspectionModal
