'use client'

import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface VworldMapAddressModalProps {
  isOpen: boolean
  onClose: () => void
  onAddressSelect: (address: string, coords?: { lat: number; lng: number }) => void
}

const VworldMapAddressModal: React.FC<VworldMapAddressModalProps> = ({
  isOpen,
  onClose,
  onAddressSelect
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // postMessage 이벤트 리스너
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ADDRESS_SELECTED') {
        const { address, coordinates } = event.data
        onAddressSelect(address, coordinates)
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('message', handleMessage)
    }

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [isOpen, onAddressSelect, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
          <h3 className="text-base sm:text-lg font-semibold">주소 검색</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* iframe으로 지도 로드 - 남은 공간 모두 사용 */}
        <div className="flex-1 min-h-0">
          <iframe
            ref={iframeRef}
            src="/vworld-map.html"
            className="w-full h-full border-0"
            title="V-world 지도"
          />
        </div>
      </div>
    </div>
  )
}

export default VworldMapAddressModal
