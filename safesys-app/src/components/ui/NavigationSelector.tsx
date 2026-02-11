'use client'

import { MapPin, X } from 'lucide-react'

interface NavigationSelectorProps {
  isOpen: boolean
  address: string
  onClose: () => void
}

/**
 * 네비게이션 앱 선택 모달 컴포넌트
 * 카카오맵, 티맵, 네이버맵 중 선택하여 목적지로 길 안내
 */
export default function NavigationSelector({ isOpen, address, onClose }: NavigationSelectorProps) {
  if (!isOpen) return null

  const openKakaoMap = () => {
    window.open(`https://map.kakao.com/link/search/${encodeURIComponent(address)}`)
    onClose()
  }

  const openTMap = () => {
    window.open(`https://apis.openapi.sk.com/tmap/app/poi?appKey=hTKnKnSYyD4ljeMriScKD4M74VX1Nm6S7KRbyLfw&name=${encodeURIComponent(address)}`)
    onClose()
  }

  const openNaverMap = () => {
    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(address)}`)
    onClose()
  }

  return (
    <div 
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 ml-4">
                내비게이션 선택
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="text-sm text-gray-500 mb-6">
            <p className="mb-2">목적지:</p>
            <p className="font-medium text-gray-900 bg-gray-50 p-2 rounded">
              {address}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={openKakaoMap}
              className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 rounded-md px-4 py-3 font-medium transition-colors"
            >
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold mb-1">K</span>
                <span className="text-xs">카카오맵</span>
              </div>
            </button>
            <button
              onClick={openTMap}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white border border-blue-600 rounded-md px-4 py-3 font-medium transition-colors"
            >
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold mb-1">T</span>
                <span className="text-xs">티맵</span>
              </div>
            </button>
            <button
              onClick={openNaverMap}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white border border-green-600 rounded-md px-4 py-3 font-medium transition-colors"
            >
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold mb-1">N</span>
                <span className="text-xs">네이버맵</span>
              </div>
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={onClose}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md px-4 py-2 font-medium transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
