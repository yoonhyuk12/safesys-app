'use client'

import React, { useState } from 'react'
import { Thermometer, Calendar, CheckCircle, Plus } from 'lucide-react'
import { Project } from '@/lib/projects'
import HeatWaveCheckModal from './HeatWaveCheckModal'

interface HeatWaveCheckCardProps {
  project: Project
}

const HeatWaveCheckCard: React.FC<HeatWaveCheckCardProps> = ({ project }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCardClick = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  return (
    <>
      <div 
        className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 cursor-pointer"
        onClick={handleCardClick}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="bg-orange-100 p-3 rounded-lg mr-4">
                <Thermometer className="h-8 w-8 text-orange-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">폭염대비 점검</h3>
                <p className="text-gray-600 mt-1">현장 안전을 위한 폭염 대비 점검을 실시합니다</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">최근 점검</div>
              <div className="font-medium text-gray-900">2024.01.15</div>
            </div>
          </div>

          {/* 점검 현황 */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">5</div>
              <div className="text-sm text-green-700">완료</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">2</div>
              <div className="text-sm text-yellow-700">주의</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">0</div>
              <div className="text-sm text-red-700">위험</div>
            </div>
          </div>

          {/* 주요 점검 항목 */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">물 공급</span>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">바람막이/그늘막</span>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">휴식 공간</span>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
          </div>

          {/* 하단 정보 */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <div className="flex items-center text-sm text-gray-500">
              <Calendar className="h-4 w-4 mr-1" />
              <span>이번 달 점검: 12회</span>
            </div>
            <div className="text-sm text-blue-600 font-medium">
              클릭하여 점검하기 →
            </div>
          </div>
        </div>
      </div>

      {/* 점검 모달 */}
      <HeatWaveCheckModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        project={project}
      />
    </>
  )
}

export default HeatWaveCheckCard 