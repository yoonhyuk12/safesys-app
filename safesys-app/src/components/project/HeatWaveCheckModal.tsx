'use client'

import React, { useState } from 'react'
import { X, CheckSquare, Calendar, Eye } from 'lucide-react'
import { Project } from '@/lib/projects'

interface HeatWaveCheckModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project
}

const HeatWaveCheckModal: React.FC<HeatWaveCheckModalProps> = ({
  isOpen,
  onClose,
  project
}) => {
  const [activeTab, setActiveTab] = useState<'check' | 'view'>('check')

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleStartCheck = () => {
    // 점검하기 페이지로 이동
    window.location.href = `/project/${project.id}/heatwave`
    onClose()
  }

  const handleViewHistory = () => {
    // 점검표 보기 페이지로 이동
    window.location.href = `/project/${project.id}/heatwave`
    onClose()
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">폭염대비 점검</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 프로젝트 정보 */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-1">{project.project_name}</h3>
          <p className="text-sm text-gray-600">
            {project.managing_hq} • {project.managing_branch}
          </p>
          {project.site_address && (
            <p className="text-sm text-gray-500 mt-1">{project.site_address}</p>
          )}
        </div>

        {/* 모달 본문 */}
        <div className="p-6">
          <div className="space-y-4">
            <div className="text-center mb-6">
              <p className="text-gray-600 mb-4">
                어떤 작업을 수행하시겠습니까?
              </p>
            </div>

            {/* 점검하기 버튼 */}
            <button
              onClick={handleStartCheck}
              className="w-full flex items-center justify-center p-4 border-2 border-blue-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 group"
            >
              <div className="flex items-center">
                <div className="bg-blue-100 p-3 rounded-lg mr-4 group-hover:bg-blue-200 transition-colors">
                  <CheckSquare className="h-6 w-6 text-blue-600" />
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 mb-1">점검하기</h4>
                  <p className="text-sm text-gray-600">새로운 폭염대비 점검을 시작합니다</p>
                </div>
              </div>
            </button>

            {/* 점검표 보기 버튼 */}
            <button
              onClick={handleViewHistory}
              className="w-full flex items-center justify-center p-4 border-2 border-green-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-all duration-200 group"
            >
              <div className="flex items-center">
                <div className="bg-green-100 p-3 rounded-lg mr-4 group-hover:bg-green-200 transition-colors">
                  <Calendar className="h-6 w-6 text-green-600" />
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 mb-1">점검표 보기</h4>
                  <p className="text-sm text-gray-600">캘린더에서 과거 점검 기록을 확인합니다</p>
                </div>
              </div>
            </button>

            {/* 추가 정보 */}
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <Eye className="h-5 w-5 text-yellow-600 mt-0.5" />
                </div>
                <div className="ml-3">
                  <h5 className="text-sm font-medium text-yellow-800">안내사항</h5>
                  <p className="text-sm text-yellow-700 mt-1">
                    폭염대비 점검은 하루에 한 번 이상 실시하는 것을 권장합니다.
                    체감온도가 32°C 이상일 때는 필수로 점검해주세요.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

export default HeatWaveCheckModal 